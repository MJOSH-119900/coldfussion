'use client';

import { useEffect, useState } from 'react';
import { createVendorUpgradeRequestAction, getVendorUpgradeRequestsAction } from '../../(admin)/admin/actions';
import type { Product } from '../../(public)/components/types/store';
import { PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';

type UpgradeData = Awaited<ReturnType<typeof getVendorUpgradeRequestsAction>>;
const options = [
  ['monthly_renewal', 'Monthly renewal', 1000],
  ['extra_brand', 'Extra brand', 500],
  ['extra_category', 'Extra category', 1000],
  ['extra_slots', 'Five extra product slots', 300],
  ['featured_boost', 'Feature one product for 7 days', 500],
] as const;

export default function VendorUpgradePanel({ products, renewalOnly = false }: { products: Product[]; renewalOnly?: boolean }) {
  const [data, setData] = useState<UpgradeData | null>(null);
  const [type, setType] = useState<(typeof options)[number][0]>('monthly_renewal');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [productId, setProductId] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  const refresh = async () => setData(await getVendorUpgradeRequestsAction());
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Could not load upgrade requests.')); }, []);

  const submit = async () => {
    let value = '';
    if (type === 'extra_category') value = category;
    if (type === 'extra_brand') value = JSON.stringify({ category, brand });
    if (type === 'featured_boost') value = productId;
    if (type === 'extra_category' && !category) { setMessage('Choose the category to unlock.'); return; }
    if (type === 'extra_brand' && (!category || !brand.trim())) { setMessage('Choose a category and enter the brand name.'); return; }
    if (type === 'featured_boost' && !productId) { setMessage('Choose one of your products.'); return; }
    setWorking(true); setMessage('');
    try {
      const result = await createVendorUpgradeRequestAction(type, value);
      if (!result.success) { setMessage(result.error || 'Could not create this request.'); return; }
      setMessage(`Request created. Transfer ₦${result.amount_naira?.toLocaleString()} and include reference ${result.reference_code} in the narration. Admin transfer details are shown below.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create this request.'); }
    finally { setWorking(false); }
  };

  return <section className="mt-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-black">{renewalOnly ? 'Renew vendor access' : 'Request an upgrade'}</h2>
    <p className="mt-1 text-sm text-slate-600">{renewalOnly ? 'Your vendor access expired. Submit a monthly renewal request and include its reference code in the transfer narration. Admin dashboard access returns after approval.' : 'Choose an add-on, make the bank transfer, and include its reference code in the narration. An admin reviews payment manually.'}</p>
    {data?.entitlements && <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">Slots: {data.entitlements.max_products ?? 'legacy access'} · Categories: {data.entitlements.allowed_categories?.join(', ') || 'existing product approvals'} · Brands: {data.entitlements.allowed_brands?.join(', ') || 'existing product approvals'}{data.entitlements.subscription_expires_at ? ` · Access expires ${new Date(data.entitlements.subscription_expires_at).toLocaleDateString()}` : ''}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="text-sm font-semibold text-slate-700">Upgrade<select value={renewalOnly ? 'monthly_renewal' : type} onChange={event => setType(event.target.value as typeof type)} disabled={renewalOnly} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{options.filter(([value]) => !renewalOnly || value === 'monthly_renewal').map(([value, label, price]) => <option key={value} value={value}>{label} · ₦{price.toLocaleString()}</option>)}</select></label>
      {!renewalOnly && type === 'extra_category' && <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Category to unlock<select value={category} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Choose category</option>{PRODUCT_MAIN_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>}
      {!renewalOnly && type === 'extra_brand' && <><label className="text-sm font-semibold text-slate-700">Category<select value={category} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Choose category</option>{(data?.entitlements?.allowed_categories || PRODUCT_MAIN_CATEGORIES).map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Brand<input maxLength={80} value={brand} onChange={event => setBrand(event.target.value)} placeholder="Brand name" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label></>}
      {!renewalOnly && type === 'featured_boost' && <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Product to feature<select value={productId} onChange={event => setProductId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Choose product</option>{products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>}
      <button type="button" disabled={working} onClick={() => void submit()} className="self-end rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{working ? 'Creating request…' : 'I have paid / create request'}</button>
    </div>
    {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">{message}</p>}
    {data?.payment_instructions && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-amber-900">Bank transfer details</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{data.payment_instructions}</p></div>}
    <div className="mt-4 space-y-2">{data?.requests.map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3 text-sm"><span className="font-semibold">{options.find(option => option[0] === request.request_type)?.[1] || request.request_type} · {request.reference_code} · ₦{request.amount_naira.toLocaleString()}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : request.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{request.status}</span></div>)}</div>
  </section>;
}
