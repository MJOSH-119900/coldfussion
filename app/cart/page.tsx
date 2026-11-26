'use client';
import Link from 'next/link';
import { useCart } from '../(public)/components/CartProvider';
import QuantityStepper from '../(public)/components/QuantityStepper';
import { useToast } from '../components/ToastProvider';

export default function CartPage() {
    const { cart, cartTotal, increment, decrement, removeFromCart, isReady } = useCart();
    const { notify, confirm } = useToast();

    const handleRemove = async (id: string, title: string) => {
        const accepted = await confirm({ title: 'Remove item from cart?', message: `${title} will be removed from your cart.`, confirmText: 'Remove item', cancelText: 'Keep item', danger: true });
        if (!accepted) return;
        removeFromCart(id);
        notify('success', `${title} was removed from your cart.`, 'Cart updated');
    };

    if (!isReady) {
        return <main className="mx-auto max-w-5xl px-4 py-20 text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600"/><p className="mt-4 text-sm font-semibold text-slate-500">Restoring your cart…</p></main>;
    }

    if (!cart.length) {
        return <main className="mx-auto max-w-5xl px-4 py-20 text-center"><h1 className="text-3xl font-black">Your cart is empty</h1><Link href="/" className="mt-5 inline-block rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Continue shopping</Link></main>;
    }

    return <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Your cart</p><h1 className="mt-1 text-3xl font-black">Review your items</h1></div>
        <Link href="/" className="text-sm font-semibold text-violet-700">Continue shopping</Link>
      </div>
      <div className="mt-8 space-y-3">
        {cart.map(item => {
          const itemKey = item.cart_key || item.id;
          const otherSizeQuantity = cart
            .filter(other => other.id === item.id && (other.cart_key || other.id) !== itemKey)
            .reduce((sum, other) => sum + other.quantity, 0);
          const maxForItem = Math.max(1, (item.available_quantity ?? Number.POSITIVE_INFINITY) - otherSizeQuantity);
          return <article key={itemKey} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <img src={item.images?.[0]} alt={item.title} className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover sm:h-24 sm:w-24"/>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-slate-950">{item.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{item.selected_size ? `Size: ${item.selected_size} · ` : ''}₦{item.price.toLocaleString()} each</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <QuantityStepper
                    compact
                    value={item.quantity}
                    onDecrease={() => decrement(itemKey)}
                    onIncrease={() => increment(itemKey)}
                    decreaseDisabled={item.quantity <= 1}
                    increaseDisabled={item.quantity >= maxForItem}
                    decreaseLabel={item.quantity <= 1 ? 'Minimum quantity is 1' : 'Decrease quantity'}
                  />
                  <button type="button" onClick={() => void handleRemove(itemKey, item.title)} className="rounded-full px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Remove</button>
                </div>
              </div>
            </div>
            <p className="pl-24 text-lg font-black tabular-nums text-slate-950 sm:pl-0 sm:text-right">₦{(item.price * item.quantity).toLocaleString()}</p>
          </article>;
        })}
      </div>
      <div className="mt-6 flex flex-col items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xl font-black">Total: ₦{cartTotal.toLocaleString()}</div>
        <Link href="/checkout" className="rounded-xl bg-slate-950 px-6 py-3 font-bold text-white transition hover:bg-violet-700">Proceed to checkout</Link>
      </div>
    </main>;
}
