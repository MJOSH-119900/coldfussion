'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '../../(public)/components/CartProvider';
import ProductCard from '../../(public)/components/ProductCard';
import QuantityStepper from '../../(public)/components/QuantityStepper';
import { Product } from '../../(public)/components/types/store';
import type { ProductFeedback } from '../../(public)/components/types/store';
import ProductFeedbackSection from './ProductFeedbackSection';
import { useToast } from '../../components/ToastProvider';
import { recordEngagement } from '../../../lib/marketplace';
import { useBranding } from '../../(public)/components/BrandingProvider';
import { normalizeProductMainCategory } from '../../../lib/product-categories';
export default function ProductDetailsClient({ product, related, feedback }: {
    product: Product;
    related: Product[];
    feedback: ProductFeedback[];
}) {
    const [activeImage, setActiveImage] = useState(0);
    const [liked, setLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(product.likes_count || 0);
    const [visitorId, setVisitorId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [selectedSize, setSelectedSize] = useState(product.size_prices?.[0]?.size || '');
    const { addToCart, toggleWishlist, isWishlisted, buyNow } = useCart();
    const { notify } = useToast();
    const { brand } = useBranding();
    const gallery = (product.images || []).slice(0, 3);
    const unavailable = (product.available_quantity ?? 0) <= 0;
    const max = product.available_quantity ?? 1;
    const selectedVariant = product.size_prices?.find(v => v.size === selectedSize);
    const selectedPrice = selectedVariant?.price ?? product.price;
    const selectedCompare = selectedVariant?.compare_at_price ?? product.compare_at_price;
    const discounted = typeof selectedCompare === 'number' && selectedCompare > selectedPrice;
    const cartProduct = { ...product, price: selectedPrice, compare_at_price: selectedCompare };
    useEffect(() => {
        let id = localStorage.getItem('fussion_visitor_id');
        if (!id) {
            id = `visitor-${crypto.randomUUID()}`;
            localStorage.setItem('fussion_visitor_id', id);
        }
        setVisitorId(id);
        void recordEngagement('view', product.id, id);
        setLiked(Boolean(localStorage.getItem(`fussion_like_${product.id}`)));
        setLikesCount(product.likes_count || 0);
    }, [product.id]);
    const toggleLike = async () => {
        if (!visitorId)
            return;
        const next = !liked;
        setLiked(next);
        localStorage.setItem(`fussion_like_${product.id}`, next ? '1' : '');
        const result = await recordEngagement(next ? 'like' : 'unlike', product.id, visitorId);
        if (result.success && !result.duplicate) setLikesCount(count => Math.max(0, count + (next ? 1 : -1)));
        notify('success', next ? 'Thanks for liking this product.' : 'Product removed from your likes.', next ? 'Liked' : 'Like removed');
    };
    const enquireAvailability = () => {
        if (visitorId)
            void recordEngagement('enquiry', product.id, visitorId);
        const number = (product.vendor_whatsapp || '').replace(/\D/g, '');
        const message = `Hello! I want to enquire about availability and payment details for:\n${product.title}\nRef: ${product.id}\nRequested quantity: ${quantity}`;
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };
    return (<main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <Link href="/" className="mb-7 inline-flex text-sm font-semibold text-slate-500 hover:text-violet-700">← Back to {brand.companyName}</Link>
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-3xl bg-slate-100">
            {gallery[activeImage] ? <img src={gallery[activeImage]} alt={product.title} className="h-[420px] w-full object-cover sm:h-[520px]"/> : <div className="grid h-[420px] place-items-center text-slate-400">No image available</div>}
          </div>
          {gallery.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7">{gallery.map((src, index) => <button key={`${src}-${index}`} onClick={() => setActiveImage(index)} aria-label={`View product image ${index + 1}`} className={`overflow-hidden rounded-xl border-2 ${activeImage === index ? 'border-violet-600' : 'border-transparent'}`}><img src={src} alt="" className="h-16 w-full object-cover sm:h-20"/></button>)}</div>}
        </div>
        <div className="py-2">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-700">{normalizeProductMainCategory(product.category)}{product.subcategory ? ` · ${product.subcategory}` : ''}</span>
            {product.giveaway && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Giveaway</span>}
            {discounted && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Slash price</span>}
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{product.title}</h1>
          <div className="mt-4 flex items-end gap-3"><p className="text-3xl font-black text-violet-700">₦{selectedPrice.toLocaleString()}</p>{discounted && <p className="text-base text-slate-400 line-through">₦{selectedCompare!.toLocaleString()}</p>}</div>
          {!!product.size_prices?.length && <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-bold text-slate-700">Choose a size</legend>
            <p className="mb-2 text-xs text-slate-500">The price above updates when you select a size.</p>
            <div className="flex flex-wrap gap-2">
              {product.size_prices.map(variant => <label key={variant.size} className="cursor-pointer">
                <input type="radio" name={`size-${product.id}`} value={variant.size} checked={selectedSize === variant.size} onChange={() => setSelectedSize(variant.size)} className="peer sr-only"/>
                <span className="flex min-w-16 flex-col items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition hover:border-violet-400 peer-checked:border-violet-700 peer-checked:bg-violet-50 peer-checked:text-violet-900 peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-violet-200">
                  <span className="font-bold">{variant.size}{variant.conventional_size ? ` (${variant.conventional_size})` : ''}</span>
                </span>
              </label>)}
            </div>
          </fieldset>}
          {product.giveaway_announcement && <p className="mt-2 text-sm font-semibold text-emerald-700">{product.giveaway_announcement}</p>}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm"><p className="font-bold text-slate-900">Sold by {product.vendor_business_name || `${brand.companyName} seller`}</p><Link href={`/vendor/${product.vendor_id}`} className="mt-1 inline-block font-semibold text-violet-700">View seller storefront →</Link></div>
          <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">{(product.condition || 'new') === 'spare-part' ? 'Spare part' : product.condition || 'New'}</span>{product.location && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">⌖ {product.location}</span>}</div>
          <p className="mt-6 leading-7 text-slate-600">{product.description}</p>
          <p className={`mt-4 text-sm font-semibold ${unavailable ? 'text-red-600' : 'text-emerald-600'}`}>{unavailable ? 'Currently unavailable' : `${product.available_quantity ?? 0} available`}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:justify-start sm:gap-6">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-slate-500">Quantity</p>
              <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">Choose how many to order</p>
            </div>
            <QuantityStepper
              value={quantity}
              onDecrease={() => setQuantity(current => Math.max(1, current - 1))}
              onIncrease={() => setQuantity(current => Math.min(max, current + 1))}
              decreaseDisabled={unavailable || quantity <= 1}
              increaseDisabled={unavailable || quantity >= max}
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button disabled={unavailable} onClick={() => { const added = addToCart(cartProduct, quantity, selectedSize || undefined); notify(added ? 'success' : 'warning', added ? `${quantity} × ${product.title} added to your cart.` : 'This item is unavailable or the requested quantity exceeds the available stock.', added ? 'Added to cart' : 'Unable to add item'); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-800 transition hover:border-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l2.2 11.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Add to cart</span></button>
            <button disabled={unavailable} onClick={() => buyNow(cartProduct, quantity, selectedSize || undefined)} className="rounded-xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-violet-700 disabled:opacity-40">Buy now</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={toggleLike} className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${liked ? 'border-rose-200 bg-rose-500 text-white shadow-sm shadow-rose-200' : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'}`}>{liked ? '♥ Liked' : '♡ Like'} · {likesCount}</button>
            <button onClick={() => { const saved = !isWishlisted(product.id); toggleWishlist(product.id); notify('success', saved ? 'Product saved to your wishlist.' : 'Product removed from your wishlist.', saved ? 'Saved for later' : 'Wishlist updated'); }} aria-pressed={isWishlisted(product.id)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${isWishlisted(product.id) ? 'border-amber-200 bg-amber-400 text-amber-950 shadow-sm shadow-amber-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill={isWishlisted(product.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg><span>{isWishlisted(product.id) ? 'Saved' : 'Wishlist'}</span></button>
          </div>
          <button onClick={enquireAvailability} disabled={!product.vendor_whatsapp} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">WhatsApp to enquire availability & payment ↗</button>
          <p className="mt-3 text-xs text-slate-400">Availability and payment are confirmed directly with the seller. Cart and wishlist stay on this device.</p>
        </div>
      </div>
      <ProductFeedbackSection productId={product.id} initialFeedback={feedback} />
      {related.length > 0 && <section className="mt-20 border-t border-slate-200 pt-10"><h2 className="mb-6 text-2xl font-black text-slate-950">You may also like</h2><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{related.map(p => <ProductCard key={p.id} product={p}/>)}</div></section>}
    </main>);
}
