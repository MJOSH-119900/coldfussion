'use client';

import { FormEvent, useState, useTransition } from 'react';
import type { ProductFeedback } from '../../(public)/components/types/store';
import { useToast } from '../../components/ToastProvider';
import { submitProductFeedbackAction } from '../../(public)/components/public-actions';

export default function ProductFeedbackSection({ productId, initialFeedback }: {
    productId: string;
    initialFeedback: ProductFeedback[];
}) {
    const feedback = initialFeedback;
    const [rating, setRating] = useState('5');
    const [expanded, setExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { notify } = useToast();
    const average = feedback.length
        ? feedback.reduce((total, item) => total + item.rating, 0) / feedback.length
        : 0;

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set('product_id', productId);
        startTransition(async () => {
            try {
                const result = await submitProductFeedbackAction(formData);
                if (!result.success)
                    throw new Error(result.error || 'Could not submit product feedback.');
                form.reset();
                setRating('5');
                notify('success', 'Thank you. Your feedback is waiting for admin review before it appears publicly.', 'Feedback received');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not submit product feedback.', 'Feedback not sent');
            }
        });
    }

    return (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-600">Shopper feedback</p>
                    <h2 className="mt-1 text-lg font-black text-slate-950">Product reviews</h2>
                    <p className="mt-1 text-xs text-slate-500">{feedback.length ? `Latest ${feedback.length} approved review${feedback.length === 1 ? '' : 's'}` : 'No approved reviews yet'}</p>
                </div>
                <div className="flex items-center gap-3">
                    {feedback.length > 0 && <div className="text-right">
                        <p className="font-black text-slate-800">{average.toFixed(1)} <span aria-label="out of 5 stars" className="text-amber-400 drop-shadow-[0_1px_1px_rgba(180,83,9,0.4)]">★</span></p>
                        <p className="text-xs text-slate-500">{feedback.length} total</p>
                    </div>}
                    <button type="button" aria-expanded={expanded} aria-controls={`product-feedback-${productId}`} onClick={() => setExpanded(open => !open)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 sm:px-4 sm:text-sm">
                        <span>{expanded ? 'Hide feedback' : 'Read reviews & write one'}</span>
                        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6"/></svg>
                    </button>
                </div>
            </div>

            {expanded && <div id={`product-feedback-${productId}`} className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
                <p className="text-xs leading-5 text-slate-500">Reviews are checked by the admin before appearing. They are shopper-submitted and are not verified-purchase badges.</p>
                {feedback.length > 0
                    ? <div aria-label="Latest product reviews" className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:gap-4 sm:px-6">
                        {feedback.slice(0, 10).map(item => <article key={item.id} className="w-[min(82vw,360px)] min-w-[260px] shrink-0 snap-start rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-violet-50/60 p-3 shadow-sm sm:p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0"><p className="truncate font-bold text-slate-900">{item.name}</p><time className="mt-1 block text-xs text-slate-400" dateTime={item.created_at}>{item.created_at.slice(0, 10)}</time></div>
                                <span className="shrink-0 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-400 shadow-sm drop-shadow-[0_1px_1px_rgba(180,83,9,0.3)]" aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}<span className="text-slate-200">{'★'.repeat(5 - item.rating)}</span></span>
                            </div>
                            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-5 text-slate-600">{item.message}</p>
                        </article>)}
                    </div>
                    : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No reviews yet. Be the first to share helpful feedback.</p>}

                <form onSubmit={handleSubmit} className="mt-5 rounded-2xl bg-slate-50 p-4 sm:p-5">
                    <h3 className="font-black text-slate-900">Write product feedback</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">Display name <span className="font-normal text-slate-400">(optional)</span>
                            <input name="name" maxLength={80} placeholder="Shopper" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm outline-none transition focus:border-violet-500 focus:shadow-md focus:ring-4 focus:ring-violet-100" />
                        </label>
                        <fieldset className="text-sm font-semibold text-slate-700">
                            <legend>Rating</legend>
                            <div className="mt-1 flex min-h-12 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-violet-400 focus-within:shadow-md focus-within:ring-4 focus-within:ring-violet-100">
                                {[1, 2, 3, 4, 5].map(value => <label key={value} title={`${value} star${value === 1 ? '' : 's'}`} className="cursor-pointer">
                                    <input type="radio" name="rating" value={value} checked={Number(rating) === value} onChange={() => setRating(String(value))} aria-label={`${value} out of 5 stars`} className="peer sr-only" />
                                    <span aria-hidden="true" className={`inline-block rounded px-0.5 text-2xl leading-none transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 ${value <= Number(rating) ? 'text-amber-400 drop-shadow-[0_1px_1px_rgba(180,83,9,0.4)]' : 'text-slate-200 hover:text-amber-300'}`}>★</span>
                                </label>)}
                                <span className="ml-auto border-l border-slate-100 pl-3 text-xs font-bold text-slate-500">{rating}/5</span>
                            </div>
                        </fieldset>
                        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Your feedback
                            <textarea required name="message" minLength={5} maxLength={1000} rows={3} placeholder="What should other shoppers know about this product listing?" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 leading-6 shadow-sm outline-none transition focus:border-violet-500 focus:shadow-md focus:ring-4 focus:ring-violet-100" />
                        </label>
                        <button type="submit" disabled={isPending} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 sm:justify-self-start">{isPending ? 'Sending…' : 'Submit feedback'}</button>
                    </div>
                </form>
            </div>}
        </section>
    );
}
