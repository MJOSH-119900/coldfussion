'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { CustomerInquiry, ProductFeedback } from '../../../(public)/components/types/store';
import { useToast } from '../../../components/ToastProvider';
import { deleteProductFeedbackAction, getAdminCustomerContentAction, markCustomerInquiryReadAction, moderateProductFeedbackAction } from '../actions';

type CustomerContent = { inquiries: CustomerInquiry[]; feedback: ProductFeedback[] };

export default function CustomerInboxManager({ onInboxCountChange }: { onInboxCountChange: (count: number) => void }) {
    const [content, setContent] = useState<CustomerContent>({ inquiries: [], feedback: [] });
    const [tab, setTab] = useState<'enquiries' | 'feedback'>('enquiries');
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { notify, confirm } = useToast();
    const newInquiries = content.inquiries.filter(item => item.status === 'new').length;
    const pendingFeedback = content.feedback.filter(item => item.status === 'pending').length;

    const reload = useCallback(async () => {
        try {
            const result = await getAdminCustomerContentAction();
            setContent(result);
            onInboxCountChange(result.inquiries.filter(item => item.status === 'new').length + result.feedback.filter(item => item.status === 'pending').length);
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not load the customer inbox.', 'Inbox unavailable');
        } finally {
            setLoading(false);
        }
    }, [notify, onInboxCountChange]);

    useEffect(() => {
        let active = true;
        getAdminCustomerContentAction().then(result => {
            if (!active)
                return;
            setContent(result);
            onInboxCountChange(result.inquiries.filter(item => item.status === 'new').length + result.feedback.filter(item => item.status === 'pending').length);
        }).catch(error => {
            if (active)
                notify('error', error instanceof Error ? error.message : 'Could not load the customer inbox.', 'Inbox unavailable');
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, [notify, onInboxCountChange]);

    function markRead(id: string) {
        startTransition(async () => {
            const result = await markCustomerInquiryReadAction(id);
            if (!result.success) {
                notify('error', result.error || 'Could not update the enquiry.', 'Update failed');
                return;
            }
            await reload();
        });
    }

    function moderate(id: string, status: 'approved' | 'rejected') {
        startTransition(async () => {
            const result = await moderateProductFeedbackAction(id, status);
            if (!result.success) {
                notify('error', result.error || 'Could not update the feedback.', 'Update failed');
                return;
            }
            notify('success', status === 'approved' ? 'Feedback is now published.' : 'Feedback has been hidden.', status === 'approved' ? 'Feedback approved' : 'Feedback hidden');
            await reload();
        });
    }

    async function removeFeedback(item: ProductFeedback) {
        const accepted = await confirm({
            title: 'Delete this feedback?',
            message: `This permanently removes the review for “${item.product_title}” from the storefront and admin inbox.`,
            confirmText: 'Delete feedback',
            cancelText: 'Keep feedback',
            danger: true,
        });
        if (!accepted)
            return;

        startTransition(async () => {
            const result = await deleteProductFeedbackAction(item.id);
            if (!result.success) {
                notify('error', result.error || 'Could not delete the feedback.', 'Delete failed');
                return;
            }
            notify('success', 'The feedback was permanently removed.', 'Feedback deleted');
            await reload();
        });
    }

    return (
        <section className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Shopper support</p>
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                    <div><h2 className="text-2xl font-black text-slate-950">Customer inbox</h2><p className="mt-1 text-sm text-slate-500">Review help requests and moderate product feedback before it appears on the storefront.</p></div>
                    <button type="button" onClick={() => { setLoading(true); void reload(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700">Refresh inbox</button>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                    <button type="button" onClick={() => setTab('enquiries')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === 'enquiries' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-violet-50'}`}>Enquiries {newInquiries > 0 && <span className="ml-1 rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{newInquiries}</span>}</button>
                    <button type="button" onClick={() => setTab('feedback')} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === 'feedback' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-violet-50'}`}>Product feedback {pendingFeedback > 0 && <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{pendingFeedback}</span>}</button>
                </div>

                {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading customer messages…</p> : tab === 'enquiries' ? <div className="mt-4 space-y-3">
                    {content.inquiries.map(item => <article key={item.id} className={`rounded-2xl border p-4 ${item.status === 'new' ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{item.category.replace('_', ' ')}</h3>{item.status === 'new' && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-700">New</span>}</div><p className="mt-1 text-xs text-slate-500">Received {item.created_at.slice(0, 16).replace('T', ' ')} UTC</p></div>
                            <div className="flex flex-wrap gap-2"><a href={`https://wa.me/${item.whatsapp}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Reply on WhatsApp ↗</a>{item.status === 'new' && <button type="button" disabled={isPending} onClick={() => markRead(item.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-violet-300 disabled:opacity-50">Mark read</button>}</div>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-700">Customer WhatsApp: +{item.whatsapp}</p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.message}</p>
                    </article>)}
                    {!content.inquiries.length && <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">No customer enquiries yet.</p>}
                </div> : <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                    {content.feedback.map(item => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><Link href={`/product/${item.product_id}`} className="block truncate text-sm font-black text-violet-800 hover:underline">{item.product_title}</Link><p className="mt-1 truncate text-xs text-slate-500">{item.name} · {item.created_at.slice(0, 16).replace('T', ' ')} UTC</p></div>
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700" aria-label={`${item.rating} out of 5 stars, ${item.status}`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)} · {item.status}</span>
                        </div>
                        <details className="group mt-2">
                            <summary className="cursor-pointer list-none text-sm leading-5 text-slate-700 marker:hidden">
                                <span className="line-clamp-2 whitespace-pre-line group-open:hidden">{item.message}</span>
                                <span className="mt-1 inline-block text-xs font-bold text-violet-700 group-open:hidden">Read full feedback</span>
                                <span className="hidden text-xs font-bold text-violet-700 group-open:inline">Hide full feedback</span>
                            </summary>
                            <p className="mt-2 whitespace-pre-line border-t border-slate-100 pt-2 text-sm leading-5 text-slate-700">{item.message}</p>
                        </details>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {item.status !== 'approved' && <button type="button" disabled={isPending} onClick={() => moderate(item.id, 'approved')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>}
                            {item.status !== 'rejected' && <button type="button" disabled={isPending} onClick={() => moderate(item.id, 'rejected')} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Hide</button>}
                            <button type="button" disabled={isPending} onClick={() => void removeFeedback(item)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">Delete</button>
                        </div>
                    </article>)}
                    {!content.feedback.length && <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">No product feedback has been submitted yet.</p>}
                </div>}
            </div>
        </section>
    );
}
