'use client';
import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import ProductCard from './ProductCard';
import { Product } from './types/store';
function ProductRail({ title, subtitle, products }: {
    title: string;
    subtitle: string;
    products: Product[];
}) {
    if (!products.length)
        return null;
    return (<section className="mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">{subtitle}</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2></div>
        <Link href="#all-products" className="shrink-0 text-sm font-semibold text-slate-600 hover:text-violet-700">Explore all →</Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">{products.map(p => <ProductCard key={p.id} product={p} compact/>)}</div>
    </section>);
}
export default function Storefront({ products, topSellingProducts = [], trendingProducts = [], currentYear }: {
    products: Product[];
    topSellingProducts?: Product[];
    trendingProducts?: Product[];
    currentYear: number;
}) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [sort, setSort] = useState('featured');
    const [condition, setCondition] = useState('all');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [maxPrice, setMaxPrice] = useState('');
    const categoryOptions = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))], [products]);
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        const max = maxPrice.trim() ? Number(maxPrice) : Infinity;
        const result = products.filter(p => {
            const matchesCategory = category === 'All' || p.category.toLowerCase() === category.toLowerCase();
            const matchesSearch = !term || [p.title, p.description, p.category, p.vendor_business_name || '', p.location || '', p.condition || 'new', ...(p.tags || [])].join(' ').toLowerCase().includes(term);
            const matchesCondition = condition === 'all' || (p.condition || 'new') === condition;
            const matchesAvailability = !availableOnly || (p.is_available !== false && (p.available_quantity ?? 0) > 0);
            const matchesPrice = Number.isFinite(max) ? p.price <= max : true;
            return matchesCategory && matchesSearch && matchesCondition && matchesAvailability && matchesPrice;
        });
        return result.sort((a, b) => {
            if (sort === 'price-low')
                return a.price - b.price;
            if (sort === 'price-high')
                return b.price - a.price;
            if (sort === 'name')
                return a.title.localeCompare(b.title);
            return 0;
        });
    }, [products, query, category, sort, condition, availableOnly, maxPrice]);
    const latest = products.filter(p => p.is_latest).slice().reverse();
    const topSelling = topSellingProducts.length ? topSellingProducts : products.filter(p => p.is_top_selling);
    const groups = Array.from(new Set(products.map(p => p.category))).filter(Boolean);
    const moveToResults = () => {
        requestAnimationFrame(() => {
            document.getElementById('all-products')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };
    const handleSearch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        moveToResults();
    };
    const handleCategoryChange = (value: string) => {
        setCategory(value);
        moveToResults();
    };
    return (<main className="mx-auto max-w-7xl px-4 pb-20 pt-5 sm:px-6">
      <form onSubmit={handleSearch} className="sticky top-[58px] z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search the store</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products, brands, sellers…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white"/></label>
          <div className="flex flex-wrap gap-2"><select aria-label="Filter category" value={category} onChange={e => handleCategoryChange(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-40"><option value="All">All categories</option>{categoryOptions.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}</select><select aria-label="Filter condition" value={condition} onChange={e => setCondition(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-36"><option value="all">Any condition</option><option value="new">New</option><option value="used">Used</option><option value="spare-part">Spare parts</option></select><select aria-label="Sort products" value={sort} onChange={e => setSort(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-44"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name A–Z</option></select></div>
        </div>
      </form>
      <section aria-label="Shop categories" className="sticky top-[172px] z-10 sm:top-[120px] -mx-4 border-b border-slate-100 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"><div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">{categoryOptions.map(c => <button key={c} onClick={() => handleCategoryChange(c)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${category === c ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-700'}`}>{c}</button>)}</div></section>

      {products.some(p => p.giveaway) && (<section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">Giveaway announcement</p>
          <div className="mt-1 space-y-1">
            {products.filter(p => p.giveaway).slice(0, 3).map(p => <p key={p.id} className="text-sm font-semibold">{p.giveaway_announcement || `${p.title} is currently featured as a giveaway.`}</p>)}
          </div>
        </section>)}

      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div className="absolute -right-16 -top-28 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl"/>
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.25em] text-violet-300">The Fussion edit</p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Good finds.<br /><span className="text-violet-300">All in one place.</span></h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">Discover standout tech, fashion and everyday essentials from trusted sellers.</p>
          <a href="#all-products" className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-violet-100">Explore products <span className="ml-2">→</span></a>
        </div>
      </section>

      <div id="latest"><ProductRail title="Latest drops" subtitle="Fresh on Fussion" products={latest}/></div>
      <ProductRail title="Top sellers" subtitle="Based on completed sales" products={topSelling}/>
      <ProductRail title="Trending now" subtitle="Recent shopper interest" products={trendingProducts}/>


      {groups.map(group => <ProductRail key={group} title={group} subtitle="Curated for you" products={products.filter(p => p.category === group).slice(0, 8)}/>)}

      <section id="all-products" className="mt-16 scroll-mt-28">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">The collection</p><h2 className="mt-1 text-3xl font-black text-slate-950">Explore products</h2></div>
          <span className="text-sm text-slate-500">{filtered.length} items</span>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300"/> In stock only</label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">Max price <input value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Any" className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"/></label>
          <button type="button" onClick={() => { setQuery(''); setCategory('All'); setSort('featured'); setCondition('all'); setAvailableOnly(false); setMaxPrice(''); }} className="ml-auto rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:border-slate-400">Clear filters</button>
        </div>
        {filtered.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{filtered.map(p => <ProductCard key={p.id} product={p}/>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">No products match your search. Try another keyword or category.</div>}
      </section>
      <section className="mt-16 rounded-3xl bg-violet-50 p-6 ring-1 ring-violet-100 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Sell on Fussion</p><h2 className="mt-1 text-2xl font-black text-slate-950">Have products customers will love?</h2><p className="mt-2 text-sm text-slate-600">Apply as a vendor and send your application directly to our admin on WhatsApp.</p></div><Link href="/vendor/register" className="mt-5 inline-flex shrink-0 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 sm:mt-0">Become a seller →</Link></section>

      <footer className="mt-20 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">© {currentYear} Fussion. Discover something good.</footer>
    </main>);
}
