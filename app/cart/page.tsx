'use client';
import Link from 'next/link';
import { useCart } from '../(public)/components/CartProvider';
import { useToast } from '../components/ToastProvider';
export default function CartPage() {
    const { cart, cartTotal, increment, decrement, removeFromCart, isReady } = useCart();
    const { notify, confirm } = useToast();
    const handleRemove = async (id: string, title: string) => {
        const accepted = await confirm({ title: 'Remove item from cart?', message: `${title} will be removed from your cart.`, confirmText: 'Remove item', cancelText: 'Keep item', danger: true });
        if (!accepted)
            return;
        removeFromCart(id);
        notify('success', `${title} was removed from your cart.`, 'Cart updated');
    };
    if (!isReady)
        return <main className="mx-auto max-w-5xl px-4 py-20 text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600"/><p className="mt-4 text-sm font-semibold text-slate-500">Restoring your cart…</p></main>;
    if (!cart.length)
        return <main className="mx-auto max-w-5xl px-4 py-20 text-center"><h1 className="text-3xl font-black">Your cart is empty</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Continue shopping</Link></main>;
    return <main className="mx-auto max-w-5xl px-4 py-10"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Your cart</p><h1 className="mt-1 text-3xl font-black">Review your items</h1></div><Link href="/" className="text-sm font-semibold text-violet-700">Continue shopping</Link></div>
    <div className="mt-8 space-y-3">{cart.map(item => <div key={item.cart_key || item.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4"><img src={item.images?.[0]} alt={item.title} className="h-24 w-24 rounded-xl object-cover"/><div className="min-w-0 flex-1"><h2 className="font-bold">{item.title}</h2><p className="text-sm text-slate-500">{item.selected_size ? `Size: ${item.selected_size} · ` : ''}₦{item.price.toLocaleString()} each</p><div className="mt-3 flex items-center gap-2"><button onClick={() => decrement(item.cart_key || item.id)} className="h-9 w-9 rounded-lg border font-bold">−</button><span className="w-8 text-center font-bold">{item.quantity}</span><button onClick={() => increment(item.cart_key || item.id)} className="h-9 w-9 rounded-lg border font-bold">+</button><button onClick={() => handleRemove(item.cart_key || item.id, item.title)} className="ml-3 text-xs font-bold text-red-600">Remove</button></div></div><p className="font-black">₦{(item.price * item.quantity).toLocaleString()}</p></div>)}</div>
    <div className="mt-6 flex flex-col items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xl font-black">Total: ₦{cartTotal.toLocaleString()}</div><Link href="/checkout" className="rounded-xl bg-slate-950 px-6 py-3 font-bold text-white hover:bg-violet-700">Proceed to checkout</Link></div>
  </main>;
}
