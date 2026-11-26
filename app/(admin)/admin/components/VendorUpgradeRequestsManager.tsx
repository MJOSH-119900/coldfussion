'use client';

import { useEffect, useState } from 'react';
import { getAdminVendorUpgradeRequestsAction, reviewVendorUpgradeRequestAction } from '../actions';
import { useToast } from '../../../components/ToastProvider';

type Request = Awaited<ReturnType<typeof getAdminVendorUpgradeRequestsAction>>[number];
const labels: Record<string, string> = { monthly_renewal: 'Monthly renewal', extra_brand: 'Extra brand', extra_category: 'Extra category', extra_slots: 'Five extra slots', featured_boost: '7 day featured boost' };

export default function VendorUpgradeRequestsManager() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const { notify } = useToast();
  const reload = async () => setRequests(await getAdminVendorUpgradeRequestsAction());
  useEffect(() => { void reload().catch(error => notify('error', error instanceof Error ? error.message : 'Could not load upgrade requests.', 'Load failed')).finally(() => setLoading(false)); }, []);
  const decide = async (request: Request, approve: boolean) => {
    const note = window.prompt(approve ? `Approve ${request.reference_code}? Optional admin note:` : `Reject ${request.reference_code}? Optional reason:`);
    if (note === null) return;
    setWorking(request.id);
    try {
      const result = await reviewVendorUpgradeRequestAction(request.id, approve, note);
      if (!result.success) { notify('error', result.error || 'Could not review this request.', 'Review failed'); return; }
      notify('success', `${request.reference_code} ${approve ? 'approved' : 'rejected'}.`, 'Request reviewed');
      await reload();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Could not review this request.', 'Review failed'); }
    finally { setWorking(''); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">Vendor add-on payments</h2>
    <p className="mt-1 text-sm text-slate-500">Match the transfer narration to its reference code, then approve or reject the request.</p>
    {loading && <p className="py-8 text-sm text-slate-500">Loading pending transfers…</p>}
    {!loading && !requests.length && <p className="py-8 text-center text-sm text-slate-500">There are no pending vendor add-on payments.</p>}
    <div className="mt-4 space-y-3">{requests.map(request => {
      let detail = request.requested_value;
      if (request.request_type === 'extra_brand') { try { const value = JSON.parse(detail); detail = `${value.category} / ${value.brand}`; } catch { /* Keep the stored text visible for manual review. */ } }
      return <article key={request.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-900">{labels[request.request_type] || request.request_type} · ₦{request.amount_naira.toLocaleString()}</p><p className="mt-1 text-sm text-slate-600">{request.vendor_name} · {request.email}</p><p className="mt-1 text-xs text-slate-500">Value: {detail || '30 day extension'} · {new Date(request.created_at).toLocaleString()}</p></div><span className="rounded-lg bg-amber-100 px-3 py-1.5 font-mono text-sm font-black text-amber-900">{request.reference_code}</span></div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working === request.id} onClick={() => void decide(request, true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Approve transfer</button><button type="button" disabled={working === request.id} onClick={() => void decide(request, false)} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Reject</button></div>
      </article>;
    })}</div>
  </section>;
}
