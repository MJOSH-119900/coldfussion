'use client';

import { useState } from 'react';
import type { Order } from '../../(public)/components/types/store';
import { createOrderReceiptConfirmationLinkAction } from '../../../lib/marketplace';
import { useToast } from '../../components/ToastProvider';

export default function VendorReceiptConfirmation({ order }: { order: Order }) {
    const [loading, setLoading] = useState(false);
    const [confirmationUrl, setConfirmationUrl] = useState('');
    const { notify } = useToast();

    async function createLink() {
        setLoading(true);
        try {
            const result = await createOrderReceiptConfirmationLinkAction(order.order_id);
            if (!result.success) throw new Error(result.error || 'Could not create the confirmation link.');
            if (!result.confirmationPath) throw new Error('The server did not return a confirmation link.');
            setConfirmationUrl(new URL(result.confirmationPath, window.location.origin).toString());
            notify('success', 'Customer receipt confirmation link created.', 'Link ready');
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not create the confirmation link.', 'Link creation failed');
        } finally {
            setLoading(false);
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(confirmationUrl);
            notify('success', 'Confirmation link copied.', 'Link copied');
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not copy the confirmation link.', 'Copy failed');
        }
    }

    const phone = (order.customer_phone || '').replace(/\D/g, '');
    const message = `Please confirm that you received order ${order.order_id} by opening this secure link: ${confirmationUrl}`;
    const whatsappUrl = phone.length >= 10 && phone.length <= 15
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : '';

    return <div className="mt-3 space-y-2">
      {!confirmationUrl && <button type="button" disabled={loading} onClick={() => void createLink()} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50">{loading ? 'Creating link…' : order.receipt_confirmation_sent_at ? 'Create a new confirmation link' : 'Request customer receipt confirmation'}</button>}
      {confirmationUrl && <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50 p-3">
        <p className="text-xs leading-5 text-violet-900">This secure link expires in 30 days. Creating another link will replace the previous one.</p>
        <input aria-label={`Customer receipt confirmation link for ${order.order_id}`} readOnly value={confirmationUrl} onFocus={event => event.currentTarget.select()} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-slate-700"/>
        <div className="flex flex-wrap gap-2">
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Send via WhatsApp ↗</a>}
          <button type="button" onClick={() => void copyLink()} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800">Copy link</button>
        </div>
        {!whatsappUrl && <p className="text-xs text-slate-600">No customer phone was saved. Copy and share this link through your usual contact channel.</p>}
      </div>}
    </div>;
}
