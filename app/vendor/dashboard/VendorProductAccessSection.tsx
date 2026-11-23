'use client';

import { useState, type FormEvent } from 'react';
import type { VendorProductAccess } from '../../(public)/components/types/store';
import { createVendorProductRequestAction } from '../../(admin)/admin/actions';
import { getProductSubcategories, PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';
import { useToast } from '../../components/ToastProvider';

export default function VendorProductAccessSection({
    access,
    onRefresh,
    onPublishApproved,
}: {
    access: VendorProductAccess;
    onRefresh: () => Promise<void>;
    onPublishApproved: (requestId?: string) => void;
}) {
    const [requestOpen, setRequestOpen] = useState(false);
    const [mainCategory, setMainCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');
    const [customSubcategory, setCustomSubcategory] = useState('');
    const [saving, setSaving] = useState(false);
    const { notify } = useToast();
    const subcategories = getProductSubcategories(mainCategory);

    async function submitRequest(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setSaving(true);
        try {
            const result = await createVendorProductRequestAction(new FormData(form));
            if (!result.success) throw new Error(result.error || 'Could not submit the product request.');
            form.reset();
            setMainCategory('');
            setSubcategory('');
            setCustomSubcategory('');
            setRequestOpen(false);
            notify('success', 'Your request is waiting for admin review.', 'Product request submitted');
            await onRefresh();
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not submit the product request.', 'Request failed');
        } finally {
            setSaving(false);
        }
    }

    return <div className="space-y-5">
      <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Product upload access</h2>
            <p className="mt-1 text-sm text-slate-500">Each permission covers one listing only. Another product needs its own admin approval.</p>
            <p className="mt-3 text-sm font-semibold text-slate-800">Approved starting category: {access.main_category} / {access.subcategory}</p>
          </div>
          <div className="grid min-w-[13rem] grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Published products</p><p className="mt-1 text-2xl font-black">{access.published_products}</p></div>
            <div className="rounded-xl bg-violet-50 p-3"><p className="text-xs text-violet-700">Remaining permissions</p><p className="mt-1 text-2xl font-black text-violet-800">{access.remaining_permissions}</p></div>
          </div>
        </div>
        {access.initial_permission_available
          ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Your first product permission is ready. Publish it in the approved category before requesting another product.</p>
          : <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Your first product permission has been used. Request approval for each additional product.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onPublishApproved()} disabled={access.remaining_permissions === 0} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">Publish an approved product</button>
          <button type="button" onClick={() => setRequestOpen(value => !value)} disabled={access.initial_permission_available} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">Request to Add Another Product</button>
        </div>
        {access.initial_permission_available && <p className="mt-2 text-xs text-slate-500">Publish your first product before requesting additional product access.</p>}
      </section>

      {requestOpen && <form onSubmit={submitRequest} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h3 className="text-lg font-black">Request product permission</h3><p className="mt-1 text-sm text-slate-500">Requests may be for your current category or a different category. Approval applies to this proposed product only.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">Main category
            <select required name="main_category" value={mainCategory} onChange={event => { setMainCategory(event.target.value); setSubcategory(''); setCustomSubcategory(''); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
              <option value="" disabled>Select a main category</option>
              {PRODUCT_MAIN_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">Subcategory
            <select required name="subcategory" value={subcategory} onChange={event => { setSubcategory(event.target.value); setCustomSubcategory(''); }} disabled={!mainCategory} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 disabled:cursor-not-allowed disabled:opacity-60">
              <option value="" disabled>Select a subcategory</option>
              {subcategories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {subcategory === 'Other' && <label className="text-sm font-bold text-slate-700 sm:col-span-2">Specify the product or subcategory
            <input required maxLength={100} name="subcategory_custom" value={customSubcategory} onChange={event => setCustomSubcategory(event.target.value)} placeholder="For example, handmade baskets" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/>
          </label>}
        </div>
        <label className="block text-sm font-bold text-slate-700">Product name
          <input required maxLength={150} name="product_name" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/>
        </label>
        <label className="block text-sm font-bold text-slate-700">Product description
          <textarea required maxLength={5000} rows={4} name="product_description" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/>
        </label>
        <label className="block text-sm font-bold text-slate-700">Product image <span className="font-normal text-slate-500">(optional)</span>
          <input type="file" name="product_image" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif" className="mt-2 block w-full text-sm"/>
          <span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG, WEBP, GIF or AVIF; maximum 500 KB.</span>
        </label>
        <label className="block text-sm font-bold text-slate-700">Reason for request
          <textarea required maxLength={2000} rows={3} name="reason" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">{saving ? 'Submitting…' : 'Submit request'}</button>
          <button type="button" disabled={saving} onClick={() => setRequestOpen(false)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700">Cancel</button>
        </div>
      </form>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">Product permission requests</h3><p className="mt-1 text-sm text-slate-500">Review decisions and any comments from the administrator.</p></div><button type="button" onClick={() => void onRefresh()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Refresh status</button></div>
        <div className="mt-4 space-y-3">
          {access.requests.map(request => {
            const fulfilled = Boolean(request.fulfilled_at);
            const statusClass = request.status === 'approved'
              ? 'bg-emerald-100 text-emerald-800'
              : request.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800';
            const statusLabel = request.status === 'approved' && fulfilled ? 'Approved · product published' : request.status;
            return <article key={request.request_id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-bold">{request.product_name}</p><p className="mt-1 text-xs text-slate-500">{request.main_category} / {request.subcategory} · Request {request.request_id}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass}`}>{statusLabel}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{request.product_description}</p>
              {request.product_image && <img src={request.product_image} alt={`Proposed image for ${request.product_name}`} className="mt-3 h-24 w-24 rounded-lg border object-cover"/>}
              {request.admin_comment && <p role="status" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"><strong>Admin comment:</strong> {request.admin_comment}</p>}
              {request.status === 'approved' && !fulfilled && <button type="button" onClick={() => onPublishApproved(request.request_id)} className="mt-3 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Publish this approved product</button>}
              <p className="mt-3 text-[11px] text-slate-400">Submitted {new Date(request.created_at).toLocaleString()}{request.reviewed_at ? ` · Reviewed ${new Date(request.reviewed_at).toLocaleString()}` : ''}</p>
            </article>;
          })}
          {!access.requests.length && <p className="py-8 text-center text-sm text-slate-500">No additional product requests yet.</p>}
        </div>
      </section>
    </div>;
}
