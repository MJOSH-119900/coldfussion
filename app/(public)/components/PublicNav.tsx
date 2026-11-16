'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCart } from './CartProvider';
import { useBranding } from './BrandingProvider';
export default function PublicNav() {
    const { cartCount, wishlist, isReady } = useCart();
    const { brand } = useBranding();
    const [menuOpen, setMenuOpen] = useState(false);
    return (<nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-2 sm:gap-3">
        <Link href="/" aria-label={`${brand.companyName} home`} className="mr-auto flex min-w-0 flex-1 items-center gap-2 text-lg font-black tracking-tight text-slate-950 sm:flex-initial sm:text-2xl">{brand.logo && <img src={brand.logo} alt="" className="h-9 max-w-16 shrink-0 object-contain sm:max-w-28"/>}<span className="truncate">{brand.companyName}<span className="text-violet-600">.</span></span></Link>
        <Link href="/#all-products" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 sm:block">Products</Link><Link href="/about" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 md:block">About</Link><Link href="/faq" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 lg:block">Help &amp; safety</Link><Link href="/vendor/register" className="hidden text-sm font-semibold text-slate-600 hover:text-violet-700 md:block">Sell on {brand.companyName}</Link>
        <button type="button" onClick={() => setMenuOpen(open => !open)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="storefront-mobile-menu" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 md:hidden">
          {menuOpen
            ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18"/></svg>
            : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>}
        </button>
        <Link href="/wishlist" aria-label={`Wishlist (${isReady ? wishlist.length : 'loading'})`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 sm:px-3">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
          <span className="hidden sm:inline">Wishlist</span><span>{isReady ? wishlist.length : '…'}</span>
        </Link>
        <Link href="/cart" aria-label={`Cart (${isReady ? cartCount : 'loading'})`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-2.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 sm:px-3">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l2.2 11.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
          <span className="hidden sm:inline">Cart</span><span>{isReady ? cartCount : '…'}</span>
        </Link>
      </div>
      {menuOpen && <div id="storefront-mobile-menu" className="mx-auto mt-3 max-w-7xl space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg md:hidden">
        <Link href="/#all-products" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-800">Browse products</Link>
        <Link href="/about" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-800">About {brand.companyName}</Link>
        <Link href="/faq" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-800">Help &amp; safety</Link>
        <Link href="/vendor/register" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-800">Sell on {brand.companyName}</Link>
      </div>}
    </nav>);
}
