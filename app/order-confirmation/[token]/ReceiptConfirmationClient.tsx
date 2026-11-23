'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { OrderReceiptConfirmation } from '../../(public)/components/types/store';
import { confirmCustomerReceiptAction } from '../../../lib/marketplace';
import { useToast } from '../../components/ToastProvider';

export default function ReceiptConfirmationClient({
    token,
    confirmation,
}: {
    token: string;
    confirmation: OrderReceiptConfirmation;
}) {
    const [confirmedAt, setConfirmedAt] = useState(confirmation.customer_received_at || '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const { notify } = useToast();

    async function confirmReceipt() {
        if (submitting || confirmedAt) return;
        setSubmitting(true);
        setError('');
        try {
            const result = await confirmCustomerReceiptAction(token);
            if (!result.success) throw new Error(result.error || 'Could not confirm receipt.');
            setConfirmedAt(new Date().toISOString());
            notify('success', 'Your order receipt is confirmed. Thank you.', 'Receipt confirmed');
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : 'Could not confirm receipt.';
            setError(message);
            notify('error', message, 'Confirmation failed');
        } finally {
            setSubmitting(false);
        }
    }

    return <main className="mx-auto max-w-xl px-4 py-16">
      <section className="rounded-3xl border border-emerald-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">Order receipt</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">{confirmedAt ? 'Receipt confirmed' : 'Confirm you received your order'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Order reference <strong>{confirmation.order_id}</strong>. Confirm only if you have received the items listed below.</p>
        <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4">
          {confirmation.items.map((item, index) => <p key={`${item.product_name}-${index}`} className="text-sm font-semibold text-slate-800">{item.product_name} <span className="text-slate-500">× {item.quantity}</span></p>)}
          <p className="border-t border-slate-200 pt-3 text-sm font-black text-slate-950">Total: ₦{confirmation.total.toLocaleString()}</p>
        </div>
        {confirmedAt
          ? <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Your receipt was confirmed on {new Date(confirmedAt).toLocaleString()}.</p>
          : <><p className="mt-4 text-xs leading-5 text-slate-500">This one-time confirmation link expires {new Date(confirmation.expires_at).toLocaleString()}.</p><button type="button" disabled={submitting} onClick={() => void confirmReceipt()} className="mt-5 w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Confirming receipt…' : 'I confirm that I received this order'}</button>{error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}</>}
        <Link href="/" className="mt-6 inline-flex text-sm font-bold text-violet-700">Continue shopping →</Link>
      </section>
    </main>;
}
