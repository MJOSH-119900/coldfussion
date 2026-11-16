'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../(public)/components/CartProvider';
import ProductCard from '../(public)/components/ProductCard';
import { Product } from '../(public)/components/types/store';
import { getPublicProductsAction } from '../(public)/components/public-actions';
import { useToast } from '../components/ToastProvider';
export default function WishlistPage() {
    const { wishlist, isReady } = useCart();
    const { notify } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    useEffect(() => {
        let active = true;
        getPublicProductsAction().then(items => {
            if (active)
                setProducts(items);
        }).catch(error => {
            if (active)
                notify('error', error instanceof Error ? error.message : 'Could not load saved products.', 'Wishlist loading failed');
        }).finally(() => {
            if (active)
                setProductsLoading(false);
        });
        return () => { active = false; };
    }, [notify]);
    const savedProducts = useMemo(() => products.filter(product => wishlist.includes(product.id)), [products, wishlist]);
    if (!isReady || productsLoading)
        return <main className="mx-auto max-w-6xl px-4 py-20 text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600"/><p className="mt-4 text-sm font-semibold text-slate-500">Restoring your wishlist…</p></main>;
    return <main className="mx-auto max-w-6xl px-4 py-10"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Saved items</p><h1 className="mt-1 text-3xl font-black">Wishlist</h1></div><Link href="/" className="text-sm font-semibold text-violet-700">Continue shopping</Link></div>{savedProducts.length ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">{savedProducts.map(product => <ProductCard key={product.id} product={product}/>)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">No saved items yet.</div>}</main>;
}
