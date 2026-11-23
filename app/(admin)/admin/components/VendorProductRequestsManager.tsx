'use client';

import { useEffect, useState } from 'react';
import type { VendorProductRequest } from '../../../(public)/components/types/store';
import { getVendorProductRequestsAction, reviewVendorProductRequestAction } from '../actions';
import { useToast } from '../../../components/ToastProvider';

export default function VendorProductRequestsManager() {
    const [requests, setRequests] = useState<VendorProductRequest[]>([]);
    const [comments, setComments] = useState<Record<string, string>>({});
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
    const [loading, setLoading] = useState(true);
    const [workingId, setWorkingId] = useState('');
    const { notify } = useToast();

    async function reload() {
        try {
            setRequests(await getVendorProductRequestsAction());
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not load vendor product requests.', 'Requests unavailable');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let active = true;
        void getVendorProductRequestsAction().then(requests => {
            if (active) setRequests(requests);
        }).catch(error => {
            if (active) notify('error', error instanceof Error ? error.message : 'Could not load vendor product requests.', 'Requests unavailable');
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [notify]);

    async function decide(request: VendorProductRequest, decision: 'approved' | 'rejected') {
        setWorkingId(request.request_id);
        try {
            const result = await reviewVendorProductRequestAction(
                request.request_id,
                decision,
                comments[request.request_id] || '',
            );
            if (!result.success) throw new Error(result.error || 'Could not review this request.');
            notify('success', decision === 'approved' ? 'Permission granted for this specific product.' : 'The vendor will see your rejection comment.', decision === 'approved' ? 'Request approved' : 'Request rejected');
            await reload();
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not review this request.', 'Review failed');
        } finally {
            setWorkingId('');
        }
    }

    const visibleRequests = requests.filter(request => filter === 'all' || request.status === filter);
    const pendingCount = requests.filter(request => request.status === 'pending').length;
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-black">Vendor Product Requests</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Each approval authorizes one product matching its proposed name, description, main category, and subcategory. Vendors need a separate approval for every additional product.</p></div>
        <button type="button" onClick={() => { setLoading(true); void reload(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Refresh</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter product requests">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${filter === value ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{value}{value === 'pending' ? ` (${pendingCount})` : ''}</button>)}
      </div>
      <div className="mt-5 space-y-4">
        {loading && <p className="py-8 text-center text-sm text-slate-500">Loading product requests…</p>}
        {!loading && visibleRequests.map(request => <article key={request.request_id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-black">{request.product_name}</p>
              <p className="mt-1 text-xs text-slate-500">Request {request.request_id} · Submitted {new Date(request.created_at).toLocaleString()}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : request.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{request.status}{request.status === 'approved' && request.fulfilled_at ? ' · published' : ''}</span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-bold">{request.vendor?.business_name || 'Vendor'} · {request.vendor?.status || 'unknown status'}</p>
                <p className="mt-1 text-slate-600">{request.vendor?.owner_name} · {request.vendor?.email} · {request.vendor_id}</p>
              </div>
              <p className="text-sm"><span className="font-bold">Requested category:</span> {request.main_category} / {request.subcategory}</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.product_description}</p>
              <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm leading-6"><span className="font-bold">Reason:</span> {request.reason}</p>
              {request.admin_comment && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span className="font-bold">Rejection comment:</span> {request.admin_comment}</p>}
            </div>
            {request.product_image && <a href={request.product_image} target="_blank" rel="noopener noreferrer" className="block"><img src={request.product_image} alt={`Proposed image for ${request.product_name}`} className="h-48 w-full rounded-xl border border-slate-200 object-cover lg:h-40"/></a>}
          </div>
          {request.status === 'pending' && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <label className="block text-sm font-semibold text-slate-700">Rejection comment <span className="font-normal text-slate-500">(required when rejecting)</span>
              <textarea rows={2} maxLength={2000} value={comments[request.request_id] || ''} onChange={event => setComments(current => ({ ...current, [request.request_id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"/>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(workingId)} onClick={() => void decide(request, 'approved')} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{workingId === request.request_id ? 'Reviewing…' : 'Approve this product'}</button>
              <button type="button" disabled={Boolean(workingId)} onClick={() => void decide(request, 'rejected')} className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject with comment</button>
            </div>
          </div>}
          {request.reviewed_at && <p className="mt-3 text-xs text-slate-400">Reviewed {new Date(request.reviewed_at).toLocaleString()} by {request.reviewed_by || 'admin'}</p>}
        </article>)}
        {!loading && !visibleRequests.length && <p className="py-10 text-center text-sm text-slate-500">{filter === 'pending' ? 'No pending product requests.' : `No ${filter === 'all' ? '' : `${filter} `}requests.`}</p>}
      </div>
    </section>;
}
