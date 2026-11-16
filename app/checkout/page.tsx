'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCart } from '../(public)/components/CartProvider';
import { CartItem } from '../(public)/components/types/store';
import { useToast } from '../components/ToastProvider';
import { createWhatsAppOrders } from '../../lib/marketplace';
import { useBranding } from '../(public)/components/BrandingProvider';
export default function CheckoutPage() {
    return <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-20 text-center"><p className="text-sm font-semibold text-slate-500">Preparing your checkout…</p></main>}><CheckoutContent /></Suspense>;
}

function CheckoutContent() {
    const searchParams = useSearchParams();
    const { cart, cartTotal, clearCart, isReady } = useCart();
    const { notify } = useToast();
    const { brand } = useBranding();
    const [buyNowLoaded, setBuyNowLoaded] = useState(false);
    const [buyNowItems, setBuyNowItems] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [checkoutId, setCheckoutId] = useState('');
    const [whatsappLinks, setWhatsappLinks] = useState<{
        orderId: string;
        url: string;
    }[]>([]);
    const isBuyNow = searchParams.get('mode') === 'buy-now';
    useEffect(() => {
        let id = sessionStorage.getItem('fussion_checkout_id');
        if (!id) {
            id = `checkout-${crypto.randomUUID()}`;
            sessionStorage.setItem('fussion_checkout_id', id);
        }
        setCheckoutId(id);
        if (!isBuyNow)
            return;
        try {
            setBuyNowItems(JSON.parse(sessionStorage.getItem('fussion_buy_now') || '[]'));
        }
        catch {
            setBuyNowItems([]);
        }
        setBuyNowLoaded(true);
    }, [isBuyNow]);
    const items = isBuyNow ? buyNowItems : cart;
    const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
    const enquire = async () => {
        if (submitting)
            return;
        setSubmitting(true);
        const result = await createWhatsAppOrders(items, customerName, customerPhone, checkoutId);
        if (!result.success) {
            notify('error', result.error || 'Could not create the WhatsApp order request.', 'Checkout failed');
            setSubmitting(false);
            return;
        }
        const links = (result.orders || []).map(order => {
            const vendorItem = items.find(i => i.vendor_id === order.vendor_id);
            const number = (order.vendor_whatsapp || vendorItem?.vendor_whatsapp || '').replace(/\D/g, '');
            const lines = order.items.map(i => `- ${i.product_name}${i.selected_size ? ` (${i.selected_size})` : ''} x${i.quantity} = ₦${i.subtotal.toLocaleString()}`);
            const message = `Hello! I would like to order from ${brand.companyName}.\n\nCheckout Reference: ${order.checkout_id || checkoutId}\nVendor Order ID: ${order.order_id}\n\n${lines.join('\n')}\n\nTotal: ₦${order.total.toLocaleString()}\n\nPlease confirm availability and payment details.`;
            return { orderId: order.order_id, url: `https://wa.me/${number}?text=${encodeURIComponent(message)}` };
        });
        setWhatsappLinks(links);
        if (!isBuyNow)
            clearCart();
        sessionStorage.removeItem('fussion_buy_now');
        sessionStorage.removeItem('fussion_checkout_id');
        setCheckoutId('');
        notify('success', `Created ${result.orders?.length || 1} pending WhatsApp order${(result.orders?.length || 1) === 1 ? '' : 's'}.`, 'Order request created');
        setSubmitting(false);
    };
    if (!isReady || (isBuyNow && !buyNowLoaded))
        return <main className="mx-auto max-w-4xl px-4 py-20 text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600"/><p className="mt-4 text-sm font-semibold text-slate-500">Preparing your checkout…</p></main>;
    if (whatsappLinks.length)
        return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-3xl border border-emerald-200 bg-white p-7 shadow-sm sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">Order request created</p><h1 className="mt-2 text-3xl font-black text-slate-950">Continue to each seller on WhatsApp</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your order request is saved. Open each seller conversation below to confirm availability and payment. For multi-vendor checkouts, each seller has a separate order reference.</p><div className="mt-6 space-y-3">{whatsappLinks.map(link => <a key={link.orderId} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-emerald-600 px-5 py-4 font-bold text-white hover:bg-emerald-700"><span>Contact seller · {link.orderId}</span><span>WhatsApp ↗</span></a>)}</div><Link href="/" className="mt-6 inline-flex text-sm font-bold text-violet-700">Continue shopping →</Link></div></main>;
    if (!items.length)
        return <main className="mx-auto max-w-4xl px-4 py-20 text-center"><h1 className="text-3xl font-black">Nothing to checkout</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Shop products</Link></main>;
    return <main className="mx-auto max-w-4xl px-4 py-10"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700">← Continue shopping</Link><Link href="/cart" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Back to cart</Link></div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Checkout</p><h1 className="mt-1 text-3xl font-black">Confirm your request</h1><div className="mt-8 space-y-3">{items.map(item => <div key={item.cart_key || item.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"><img src={item.images?.[0]} alt={item.title} className="h-16 w-16 rounded-lg object-cover"/><div className="min-w-0 flex-1"><p className="font-bold">{item.title}</p><p className="text-sm text-slate-500">{item.selected_size ? `Size: ${item.selected_size} · ` : ''}Quantity: {item.quantity}</p></div><p className="font-black">₦{(item.price * item.quantity).toLocaleString()}</p></div>)}</div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between text-xl font-black"><span>Estimated total</span><span>₦{total.toLocaleString()}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Your name (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone / WhatsApp (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></div><p className="mt-3 text-sm leading-6 text-slate-500">This storefront does not collect payment online. Use WhatsApp to confirm current availability and obtain the seller's payment details before paying.</p><button onClick={enquire} disabled={submitting} className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-40">{submitting ? 'Creating order request…' : 'Confirm availability & payment on WhatsApp'}</button></div></main>;
}
