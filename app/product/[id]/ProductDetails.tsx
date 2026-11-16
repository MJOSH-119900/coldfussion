'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ProductCard from '../../(public)/components/ProductCard';
import { useCart } from '../../(public)/components/CartProvider';
import { Product } from '../../(public)/components/types/store';
import productsData from '../../(public)/components/data/products.json';

export default function ProductDetails({ product }: { product?: Product }) {
  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  useEffect(() => {
    if (!product) return;
    try {
      const likes: string[] = JSON.parse(localStorage.getItem('user_likes') || '[]');
      const wishlist: string[] = JSON.parse(localStorage.getItem('user_wishlist') || '[]');
      setLiked(likes.includes(product.id));
      setInWishlist(wishlist.includes(product.id));
    } catch { /* ignore invalid legacy storage */ }
  }, [product]);

  if (!product) return <main className="py-24 text-center"><p className="font-semibold">Product not found.</p><Link href="/" className="mt-4 inline-block text-violet-700">Back to Fussion</Link></main>;

  const gallery = product.detail_gallery_enabled ? (product.images || []).slice(0, 7) : (product.images || []).slice(0, 1);
  const related = (productsData as Product[]).filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);

  const toggleLike = () => {
    const likes: string[] = JSON.parse(localStorage.getItem('user_likes') || '[]');
    const updated = liked ? likes.filter(value => value !== product.id) : [...likes, product.id];
    localStorage.setItem('user_likes', JSON.stringify(updated));
    setLiked(!liked);
  };

  const toggleWishlist = () => {
    const wishlist: string[] = JSON.parse(localStorage.getItem('user_wishlist') || '[]');
    const updated = inWishlist ? wishlist.filter(value => value !== product.id) : [...wishlist, product.id];
    localStorage.setItem('user_wishlist', JSON.stringify(updated));
    setInWishlist(!inWishlist);
  };

  const addCurrentToCart = () => addToCart(product, quantity);
  const buyNow = () => {
    addToCart(product, quantity);
    window.location.href = '/checkout?buyNow=' + encodeURIComponent(product.id) + '&qty=' + quantity;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <Link href="/" className="mb-7 inline-flex text-sm font-semibold text-slate-500 hover:text-violet-700">← Back to Fussion</Link>
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-3xl bg-slate-100">
            {gallery[activeImage] ? <img src={gallery[activeImage]} alt={product.title} className="h-[420px] w-full object-cover sm:h-[520px]" /> : <div className="grid h-[420px] place-items-center text-slate-400">No image available</div>}
          </div>
          {gallery.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7">{gallery.map((src, index) => <button key={`${src}-${index}`} onClick={() => setActiveImage(index)} aria-label={`View product image ${index + 1}`} className={`overflow-hidden rounded-xl border-2 ${activeImage === index ? 'border-violet-600' : 'border-transparent'}`}><img src={src} alt="" className="h-16 w-full object-cover sm:h-20" /></button>)}</div>}
        </div>
        <div className="py-2">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-700">{product.category}</span>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{product.title}</h1>
          <p className="mt-4 text-3xl font-black text-violet-700">₦{product.price.toLocaleString()}</p>
          <p className="mt-6 leading-7 text-slate-600">{product.description}</p>

          <div className="mt-7 flex items-center gap-3">
            <label htmlFor="quantity" className="text-sm font-semibold text-slate-600">Quantity</label>
            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-4 py-2 text-lg">−</button>
              <span className="min-w-10 text-center font-bold">{quantity}</span>
              <button type="button" onClick={() => setQuantity(q => q + 1)} className="px-4 py-2 text-lg">+</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={addCurrentToCart} className="rounded-xl bg-slate-950 px-5 py-4 font-bold text-white transition hover:bg-violet-700">Add to cart</button>
            <button type="button" onClick={buyNow} className="rounded-xl bg-violet-600 px-5 py-4 font-bold text-white transition hover:bg-violet-700">Buy now</button>
          </div>
          <Link href="/cart" className="mt-3 block text-center text-sm font-semibold text-slate-500 hover:text-violet-700">View cart</Link>

          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={toggleLike} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{liked ? '♥ Liked' : '♡ Like'}</button>
            <button onClick={toggleWishlist} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{inWishlist ? '★ Saved' : '☆ Wishlist'}</button>
          </div>
          <p className="mt-4 text-xs text-slate-400">WhatsApp checkout remains available from the checkout page.</p>
        </div>
      </div>
      {related.length > 0 && <section className="mt-20 border-t border-slate-200 pt-10"><h2 className="mb-6 text-2xl font-black text-slate-950">You may also like</h2><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{related.map(p => <ProductCard key={p.id} product={p} />)}</div></section>}
    </main>
  );
}
