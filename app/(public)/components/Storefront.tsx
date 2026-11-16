'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProductCard from './ProductCard';
import GiveawayPopup from './GiveawayPopup';
import AboutPortraitPlaceholder from './AboutPortraitPlaceholder';
import { useBranding } from './BrandingProvider';
import { BannerSettings, OwnerAbout, Product } from './types/store';
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
export default function Storefront({ products, topSellingProducts = [], trendingProducts = [], currentYear, bannerSettings, ownerAbout }: {
    products: Product[];
    topSellingProducts?: Product[];
    trendingProducts?: Product[];
    currentYear: number;
    bannerSettings: BannerSettings;
    ownerAbout: OwnerAbout;
}) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [sort, setSort] = useState('featured');
    const [condition, setCondition] = useState('all');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [maxPrice, setMaxPrice] = useState('');
    const { brand } = useBranding();
    const [activeBanner, setActiveBanner] = useState(0);
    const banners = bannerSettings.slides;
    const intervalMultiplier = bannerSettings.intervalUnit === 'days' ? 86400000 : bannerSettings.intervalUnit === 'hours' ? 3600000 : 1000;
    const rotationMs = bannerSettings.intervalValue * intervalMultiplier;
    useEffect(() => {
        if (banners.length < 2) return;
        let timeout: ReturnType<typeof setTimeout>;
        const rotate = () => {
            setActiveBanner(current => (current + 1) % banners.length);
            timeout = setTimeout(rotate, rotationMs);
        };
        timeout = setTimeout(rotate, rotationMs);
        return () => clearTimeout(timeout);
    }, [banners.length, rotationMs]);
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
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filter category" value={category} onChange={e => handleCategoryChange(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-40"><option value="All">All categories</option>{categoryOptions.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Filter condition" value={condition} onChange={e => setCondition(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-36"><option value="all">Any condition</option><option value="new">New</option><option value="used">Used</option><option value="spare-part">Spare parts</option></select>
            <select aria-label="Sort products" value={sort} onChange={e => setSort(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold sm:w-44"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name A–Z</option></select>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600"><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300"/> In stock only</label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">Max price <input value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Any" className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"/></label>
            <button type="button" onClick={() => { setQuery(''); setCategory('All'); setSort('featured'); setCondition('all'); setAvailableOnly(false); setMaxPrice(''); }} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-400">Clear filters</button>
          </div>
        </div>
      </form>
      <section aria-label="Shop categories" className="sticky top-[260px] z-10 lg:top-[120px] -mx-4 border-b border-slate-100 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"><div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">{categoryOptions.map(c => <button key={c} onClick={() => handleCategoryChange(c)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${category === c ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-700'}`}>{c}</button>)}</div></section>

      {products.some(p => p.giveaway) && (<section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">Giveaway announcement</p>
          <div className="mt-1 space-y-1">
            {products.filter(p => p.giveaway).map(p => <Link key={p.id} href={`/product/${p.id}`} className="block rounded-lg px-2 py-1 text-sm font-semibold hover:bg-emerald-100 hover:underline">{p.giveaway_announcement || `${p.title} is currently featured as a giveaway.`} <span aria-hidden="true">→</span></Link>)}
          </div>
        </section>)}

      {banners.length ? (
        <section aria-label="Featured banners" aria-roledescription="carousel" className="relative mt-2 overflow-hidden rounded-[2rem] bg-slate-950 text-white">
          <img src={banners[activeBanner]?.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-950/20" />
          <div className="relative flex min-h-[350px] items-center px-6 py-12 sm:min-h-[440px] sm:px-12 sm:py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[.25em] text-violet-300">Featured on {brand.companyName}</p>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">{banners[activeBanner]?.title}</h1>
              {banners[activeBanner]?.description && <p className="mt-4 max-w-lg text-sm leading-6 text-slate-200 sm:text-base">{banners[activeBanner].description}</p>}
              {banners[activeBanner]?.button_label && <a href={banners[activeBanner].button_url || '#all-products'} className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-violet-100">{banners[activeBanner].button_label} <span className="ml-2">→</span></a>}
            </div>
          </div>
          {banners.length > 1 && <div className="absolute bottom-5 right-6 flex items-center gap-2 sm:right-12" aria-label="Choose banner">
            {banners.map((banner, index) => <button key={banner.id} type="button" onClick={() => setActiveBanner(index)} aria-label={`Show banner ${index + 1}`} aria-current={activeBanner === index ? 'true' : undefined} className={`h-2.5 rounded-full transition-all ${activeBanner === index ? 'w-8 bg-white' : 'w-2.5 bg-white/50 hover:bg-white/80'}`} />)}
          </div>}
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white sm:px-12 sm:py-16">
          <div className="absolute -right-16 -top-28 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl"/>
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.25em] text-violet-300">The {brand.companyName} edit</p>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Good finds.<br /><span className="text-violet-300">All in one place.</span></h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">Discover standout tech, fashion and everyday essentials from trusted sellers.</p>
            <a href="#all-products" className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-violet-100">Explore products <span className="ml-2">→</span></a>
          </div>
        </section>
      )}

      <div id="latest"><ProductRail title="Latest drops" subtitle={`Fresh on ${brand.companyName}`} products={latest}/></div>
      <ProductRail title="Top sellers" subtitle="Based on completed sales" products={topSelling}/>
      <ProductRail title="Trending now" subtitle="Recent shopper interest" products={trendingProducts}/>


      {groups.map(group => <ProductRail key={group} title={group} subtitle="Curated for you" products={products.filter(p => p.category === group).slice(0, 8)}/>)}

      <section id="all-products" className="mt-16 scroll-mt-28">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">The collection</p><h2 className="mt-1 text-3xl font-black text-slate-950">Explore products</h2></div>
          <span className="text-sm text-slate-500">{filtered.length} items</span>
        </div>
        {filtered.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{filtered.map(p => <ProductCard key={p.id} product={p}/>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">No products match your search. Try another keyword or category.</div>}
      </section>
      <section className="mt-16 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(240px,.8fr)_1.2fr]">
        <div className="min-h-64 bg-slate-100 md:min-h-80">
          {ownerAbout.image
            ? <img src={ownerAbout.image} alt={`${ownerAbout.name}, owner of ${brand.companyName}`} className="h-full min-h-64 w-full object-cover md:min-h-80" />
            : <AboutPortraitPlaceholder className="h-full min-h-64 w-full md:min-h-80" />}
        </div>
        <div className="flex flex-col items-start justify-center p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Meet the owner</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">The person behind {brand.companyName}</h2>
          {ownerAbout.isDemo && <span className="mt-3 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Demo profile</span>}
          <p className="mt-3 font-semibold text-slate-700">{ownerAbout.name}{ownerAbout.title ? ` · ${ownerAbout.title}` : ''}</p>
          <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-7 text-slate-600">{ownerAbout.story}</p>
          {!!ownerAbout.hobbies.length && <div className="mt-4 flex flex-wrap gap-2">{ownerAbout.hobbies.slice(0, 3).map(hobby => <span key={hobby} className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">{hobby}</span>)}</div>}
          <Link href="/about" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700">Read the full story <span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="mt-16 rounded-3xl bg-violet-50 p-6 ring-1 ring-violet-100 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Sell on {brand.companyName}</p><h2 className="mt-1 text-2xl font-black text-slate-950">Have products customers will love?</h2><p className="mt-2 text-sm text-slate-600">Apply as a vendor and send your application directly to our admin on WhatsApp.</p></div><Link href="/vendor/register" className="mt-5 inline-flex shrink-0 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 sm:mt-0">Become a seller →</Link></section>

      <GiveawayPopup products={products} />
      <footer className="mt-20 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-200 pt-8 text-sm text-slate-500"><span>© {currentYear} {brand.companyName}. Discover something good.</span><Link href="/about" className="font-semibold text-slate-600 hover:text-violet-700">About us</Link><Link href="/faq" className="font-semibold text-slate-600 hover:text-violet-700">Help &amp; safety</Link></footer>
    </main>);
}
