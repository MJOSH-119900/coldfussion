'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Product } from './types/store';

const SEEN_KEY = 'fussion_giveaway_popup_seen';

export default function GiveawayPopup({ products }: { products: Product[] }) {
    const giveaways = products.filter(product => product.giveaway);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!giveaways.length) return;
        try {
            if (window.sessionStorage.getItem(SEEN_KEY)) return;
        } catch {
            // Continue without session persistence if browser storage is unavailable.
        }

        const timeout = setTimeout(() => {
            try {
                window.sessionStorage.setItem(SEEN_KEY, '1');
            } catch {
                // The popup still works for the current page if storage is unavailable.
            }
            setOpen(true);
        }, 800);
        return () => clearTimeout(timeout);
    }, [giveaways.length]);

    if (!open || !giveaways.length) return null;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <section role="dialog" aria-modal="true" aria-labelledby="giveaway-popup-title" className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-emerald-800 px-6 py-7 text-white sm:px-8">
                    <button type="button" onClick={() => setOpen(false)} aria-label="Close giveaway announcements" className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-lg text-white hover:bg-white/25">×</button>
                    <p className="text-xs font-black uppercase tracking-[.25em] text-emerald-300">Limited-time highlights</p>
                    <h2 id="giveaway-popup-title" className="mt-2 text-3xl font-black sm:text-4xl">Giveaway drops</h2>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-slate-200">A little something special is waiting. Explore the current giveaways while they last.</p>
                </div>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4 sm:p-6">
                    {giveaways.map(product => (
                        <Link
                            key={product.id}
                            href={`/product/${product.id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-4 rounded-2xl border border-slate-200 p-3 transition hover:border-violet-400 hover:bg-violet-50 sm:p-4"
                        >
                            {product.images?.[0]
                                ? <img src={product.images[0]} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24" />
                                : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700 sm:h-24 sm:w-24">Giveaway</div>}
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-black uppercase tracking-wider text-emerald-700">Giveaway</span>
                                <span className="mt-1 block font-black text-slate-950">{product.title}</span>
                                <span className="mt-1 block line-clamp-2 text-sm text-slate-600">{product.giveaway_announcement || `${product.title} is currently featured as a giveaway.`}</span>
                            </span>
                            <span className="shrink-0 text-sm font-bold text-violet-700">View →</span>
                        </Link>
                    ))}
                </div>
                <div className="flex justify-end border-t border-slate-100 p-4 sm:px-6">
                    <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Maybe later</button>
                </div>
            </section>
        </div>
    );
}
