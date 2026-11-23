'use client';
import Link from 'next/link';
import { useCart } from './CartProvider';
import { Product } from './types/store';
import { useToast } from '../../components/ToastProvider';
import { normalizeProductMainCategory } from '../../../lib/product-categories';
export default function ProductCard({ product, compact = false }: {
    product: Product;
    compact?: boolean;
}) {
    const image = product.images?.[0];
    const { addToCart, toggleWishlist, isWishlisted, buyNow } = useCart();
    const { notify } = useToast();
    const unavailable = product.is_available === false || (product.available_quantity ?? 1) <= 0;
    const startingVariant = product.size_prices?.length
        ? product.size_prices.reduce((lowest, variant) => variant.price < lowest.price ? variant : lowest)
        : undefined;
    const displayedPrice = startingVariant?.price ?? product.price;
    const displayedCompare = startingVariant?.compare_at_price ?? product.compare_at_price;
    const discounted = typeof displayedCompare === 'number' && displayedCompare > displayedPrice;
    return (<article className={`group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-xl ${compact ? 'w-52 shrink-0' : ''}`}>
      <div className="relative">
        <Link href={`/product/${product.id}`} className="block">
          <div className={`${compact ? 'h-40' : 'h-56'} overflow-hidden bg-slate-100`}>
            {image ? <img src={image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="grid h-full place-items-center text-slate-400">No image</div>}
          </div>
        </Link>
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {product.giveaway && <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">Giveaway</span>}
          {discounted && <span className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">Slash price</span>}
        </div>
        <button onClick={() => { const saved = !isWishlisted(product.id); toggleWishlist(product.id); notify('success', saved ? 'Added to your wishlist.' : 'Removed from your wishlist.', saved ? 'Saved for later' : 'Wishlist updated'); }} aria-label={isWishlisted(product.id) ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={isWishlisted(product.id)} className={`absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border shadow-md backdrop-blur transition hover:scale-110 ${isWishlisted(product.id) ? 'border-rose-200 bg-rose-500 text-white' : 'border-white/80 bg-white/95 text-rose-500 hover:bg-rose-50'}`}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill={isWishlisted(product.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
        </button>
      </div>
      <div className="p-4">
        <Link href={`/product/${product.id}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600">{normalizeProductMainCategory(product.category)}</span>
          {product.subcategory && <span className="ml-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">{product.subcategory}</span>}
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{(product.condition || 'new') === 'spare-part' ? 'Spare part' : product.condition || 'New'}</span>
          {product.location && <p className="mt-1 truncate text-xs text-slate-500">⌖ {product.location}</p>}
          <h3 className="mt-1 line-clamp-1 font-semibold text-slate-900">{product.title}</h3>
          {product.giveaway_announcement && <p className="mt-1 line-clamp-1 text-xs font-medium text-emerald-700">{product.giveaway_announcement}</p>}
          {product.giveaway && <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600">Giveaway item</p>}
          <div className="mt-2 flex items-end gap-2">
            <p className="text-lg font-extrabold text-slate-950">{product.size_prices?.length ? `From ₦${displayedPrice.toLocaleString()}` : `₦${displayedPrice.toLocaleString()}`}</p>
            {discounted && <p className="text-xs text-slate-400 line-through">₦{displayedCompare!.toLocaleString()}</p>}
          </div>
          <p className={`mt-1 text-xs ${unavailable ? 'text-red-600' : 'text-emerald-600'}`}>{unavailable ? 'Unavailable' : `${product.available_quantity ?? 0} available`}</p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600"><span aria-hidden="true">♥</span> {product.likes_count || 0} likes</p>
        </Link>
        {!compact && (<div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={unavailable} onClick={() => { const firstSize = product.size_prices?.[0]; const chosen = firstSize ? { ...product, price: firstSize.price, compare_at_price: firstSize.compare_at_price ?? product.compare_at_price } : product; const added = addToCart(chosen, 1, firstSize?.size); notify(added ? 'success' : 'warning', added ? `${product.title}${firstSize ? ` (${firstSize.size})` : ''} added to your cart.` : 'This item is unavailable or you already have the maximum available quantity in your cart.', added ? 'Added to cart' : 'Quantity limit reached'); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800 transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l2.2 11.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Add to cart</span></button>
            <button disabled={unavailable} onClick={() => { const firstSize = product.size_prices?.[0]; const chosen = firstSize ? { ...product, price: firstSize.price, compare_at_price: firstSize.compare_at_price ?? product.compare_at_price } : product; buyNow(chosen, 1, firstSize?.size); }} className="rounded-lg bg-slate-950 px-2 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">Buy now</button>
          </div>)}
      </div>
    </article>);
}
