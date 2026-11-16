'use client';
import Link from 'next/link';
import { useCart } from './CartProvider';
export default function PublicNav() {
    const { cartCount, wishlist, isReady } = useCart();
    return (<nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <Link href="/" className="mr-auto text-2xl font-black tracking-tight text-slate-950">fussion<span className="text-violet-600">.</span></Link>
        <Link href="/#all-products" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 sm:block">Products</Link><Link href="/vendor/register" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 md:block">Sell on Fussion</Link>
        <Link href="/wishlist" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-400">Wishlist ({isReady ? wishlist.length : '…'})</Link>
        <Link href="/cart" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">Cart ({isReady ? cartCount : '…'})</Link>
      </div>
    </nav>);
}
