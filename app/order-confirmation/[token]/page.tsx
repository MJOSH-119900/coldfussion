import { getOrderReceiptConfirmationAction } from '../../../lib/marketplace';
import ReceiptConfirmationClient from './ReceiptConfirmationClient';

export const metadata = {
    title: 'Confirm order receipt',
    robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const confirmation = await getOrderReceiptConfirmationAction(token);
    if (!confirmation) {
        return <main className="mx-auto max-w-xl px-4 py-16"><section className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-rose-700">Confirmation link unavailable</p><h1 className="mt-2 text-2xl font-black text-slate-950">This link is invalid or expired</h1><p className="mt-3 text-sm leading-6 text-slate-600">Ask the seller to send you a new receipt confirmation link if you still need to confirm this order.</p></section></main>;
    }
    return <ReceiptConfirmationClient token={token} confirmation={confirmation}/>;
}
