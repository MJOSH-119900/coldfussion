'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ProductCard from './ProductCard';
import GiveawayPopup from './GiveawayPopup';
import AboutPortraitPlaceholder from './AboutPortraitPlaceholder';
import { useBranding } from './BrandingProvider';
import { BannerSettings, OwnerAbout, Product } from './types/store';
import { matchesStorefrontCategory, matchesStorefrontSubcategory, normalizeProductMainCategory, PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';
import { getFairProductsAction } from './public-actions';
function ProductRail({ title, subtitle, products }: {
    title: string;
    subtitle: string;
    products: Product[];
}) {
    if (!products.length)
        return null;
    const vendorQueues = new Map<string, Product[]>();
    for (const product of products) {
        const queue = vendorQueues.get(product.vendor_id) || [];
        queue.push(product);
        vendorQueues.set(product.vendor_id, queue);
    }
    const balanced: Product[] = [];
    for (let round = 0; ; round++) {
        let added = false;
        for (const queue of vendorQueues.values()) {
            if (queue[round]) { balanced.push(queue[round]); added = true; }
        }
        if (!added) break;
    }
    return (<section className="mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">{subtitle}</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2></div>
        <Link href="#all-products" className="shrink-0 text-sm font-semibold text-slate-600 hover:text-violet-700">Explore all →</Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">{balanced.slice(0, 8).map(p => <ProductCard key={p.id} product={p} compact/>)}</div>
    </section>);
}
export default function Storefront({ products, initialFeedProducts = products, brandOptions = [], fairRpcReady = false, topSellingProducts = [], trendingProducts = [], currentYear, bannerSettings, ownerAbout }: {
    products: Product[];
    initialFeedProducts?: Product[];
    brandOptions?: string[];
    fairRpcReady?: boolean;
    topSellingProducts?: Product[];
    trendingProducts?: Product[];
    currentYear: number;
    bannerSettings: BannerSettings;
    ownerAbout: OwnerAbout;
}) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [subcategory, setSubcategory] = useState('All');
    const [openCategory, setOpenCategory] = useState<string | null>(null);
    const [sort, setSort] = useState('featured');
    const [condition, setCondition] = useState('all');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [maxPrice, setMaxPrice] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const { brand } = useBranding();
    const [activeBanner, setActiveBanner] = useState(0);
    const [featuredNow, setFeaturedNow] = useState(0);
    const [feedProducts, setFeedProducts] = useState(initialFeedProducts);
    const [feedLoading, setFeedLoading] = useState(false);
    const [feedError, setFeedError] = useState('');
    const [hasMore, setHasMore] = useState(fairRpcReady && initialFeedProducts.length === 20);
    const requestSequence = useRef(0);
    const initializedRpc = useRef(false);
    const banners = bannerSettings.slides;
    const intervalMultiplier = bannerSettings.intervalUnit === 'days' ? 86400000 : bannerSettings.intervalUnit === 'hours' ? 3600000 : 1000;
    const rotationMs = bannerSettings.intervalValue * intervalMultiplier;
    useEffect(() => {
        setFeaturedNow(Date.now());
        const timer = window.setInterval(() => setFeaturedNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        if (!fairRpcReady) return;
        if (!initializedRpc.current) { initializedRpc.current = true; return; }
        const requestId = ++requestSequence.current;
        const timer = window.setTimeout(() => {
            setFeedLoading(true);
            setFeedError('');
            void getFairProductsAction({
                filter_category: category === 'All' ? null : category,
                filter_brand: brandFilter === 'All' ? null : brandFilter,
                search_query: query,
                page_limit: 20,
                page_offset: 0,
            }).then(result => {
                if (requestId !== requestSequence.current) return;
                if (!result.success) { setFeedError(result.error); setHasMore(false); return; }
                setFeedProducts(result.products);
                setHasMore(result.has_more);
            }).catch(error => {
                if (requestId === requestSequence.current) setFeedError(error instanceof Error ? error.message : 'Could not load products.');
            }).finally(() => { if (requestId === requestSequence.current) setFeedLoading(false); });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [category, brandFilter, query, fairRpcReady]);
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
    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const product of products) {
            if (product.category) {
                const mainCategory = normalizeProductMainCategory(product.category);
                counts.set(mainCategory, (counts.get(mainCategory) || 0) + 1);
            }
        }
        return counts;
    }, [products]);
    const categoryOptions = useMemo(() => {
        const additionalCategories = Array.from(new Set(products
            .map(product => normalizeProductMainCategory(product.category))
            .filter(category => category && !PRODUCT_MAIN_CATEGORIES.includes(category as typeof PRODUCT_MAIN_CATEGORIES[number]))))
            .sort((a, b) => a.localeCompare(b));
        return ['All', ...PRODUCT_MAIN_CATEGORIES, ...additionalCategories];
    }, [products]);
    const subcategoriesByCategory = useMemo(() => {
        const counts = new Map<string, Map<string, number>>();
        for (const product of products) {
            const parent = normalizeProductMainCategory(product.category);
            const child = product.subcategory?.trim();
            if (!parent || !child) continue;
            const subcategories = counts.get(parent) || new Map<string, number>();
            subcategories.set(child, (subcategories.get(child) || 0) + 1);
            counts.set(parent, subcategories);
        }
        const options = new Map<string, { name: string; count: number }[]>();
        for (const [parent, children] of counts) {
            options.set(parent, Array.from(children, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));
        }
        return options;
    }, [products]);
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        const max = maxPrice.trim() ? Number(maxPrice) : Infinity;
        const result = feedProducts.filter(p => {
            const matchesCategory = matchesStorefrontCategory(p.category, category);
            const matchesBrand = brandFilter === 'All' || (p.brand || 'Unbranded') === brandFilter;
            const matchesSubcategory = matchesStorefrontSubcategory(p.subcategory, subcategory);
            const matchesSearch = !term || [p.title, p.description, p.category, p.subcategory || '', p.brand || '', p.vendor_business_name || '', p.location || '', p.condition || 'new', ...(p.tags || [])].join(' ').toLowerCase().includes(term);
            const matchesCondition = condition === 'all' || (p.condition || 'new') === condition;
            const matchesAvailability = !availableOnly || (p.available_quantity ?? 0) > 0;
            const matchesPrice = Number.isFinite(max) ? p.price <= max : true;
            return matchesCategory && matchesBrand && matchesSubcategory && matchesSearch && matchesCondition && matchesAvailability && matchesPrice;
        });
        return result.sort((a, b) => {
            if (a.vendor_item_rank !== undefined && b.vendor_item_rank !== undefined && a.vendor_item_rank !== b.vendor_item_rank)
                return a.vendor_item_rank - b.vendor_item_rank;
            const aFeatured = Boolean(featuredNow && a.is_featured && a.featured_until && Date.parse(a.featured_until) > featuredNow);
            const bFeatured = Boolean(featuredNow && b.is_featured && b.featured_until && Date.parse(b.featured_until) > featuredNow);
            if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
            if (sort === 'price-low')
                return a.price - b.price;
            if (sort === 'price-high')
                return b.price - a.price;
            if (sort === 'name')
                return a.title.localeCompare(b.title);
            return 0;
        });
    }, [feedProducts, query, category, brandFilter, subcategory, sort, condition, availableOnly, maxPrice, featuredNow]);
    const latest = products.slice(-8).reverse();
    const topSelling = topSellingProducts.length ? topSellingProducts : products.filter(p => p.is_top_selling);
    const groups = Array.from(new Set(products.map(p => normalizeProductMainCategory(p.category)))).filter(Boolean);
    const activeFilterCount = [
        category !== 'All',
        brandFilter !== 'All',
        subcategory !== 'All',
        condition !== 'all',
        sort !== 'featured',
        availableOnly,
        Boolean(maxPrice.trim()),
    ].filter(Boolean).length;
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
        setFiltersOpen(false);
        moveToResults();
    };
    const handleCategoryChange = (value: string) => {
        setCategory(value);
        setSubcategory('All');
        setOpenCategory(null);
        setFiltersOpen(false);
        moveToResults();
    };
    const loadMoreProducts = async () => {
        if (!fairRpcReady || feedLoading || !hasMore) return;
        const requestId = ++requestSequence.current;
        setFeedLoading(true);
        setFeedError('');
        try {
            const result = await getFairProductsAction({
                filter_category: category === 'All' ? null : category,
                filter_brand: brandFilter === 'All' ? null : brandFilter,
                search_query: query,
                page_limit: 20,
                page_offset: feedProducts.length,
            });
            if (requestId !== requestSequence.current) return;
            if (!result.success) { setFeedError(result.error); setHasMore(false); return; }
            setFeedProducts(current => {
                const existing = new Set(current.map(product => product.id));
                return [...current, ...result.products.filter(product => !existing.has(product.id))];
            });
            setHasMore(result.has_more);
        } catch (error) {
            if (requestId === requestSequence.current) setFeedError(error instanceof Error ? error.message : 'Could not load more products.');
        } finally {
            if (requestId === requestSequence.current) setFeedLoading(false);
        }
    };
    const handleCategoryTabClick = (value: string) => {
        setCategory(value);
        setSubcategory('All');
        setOpenCategory(subcategoriesByCategory.has(value) ? value : null);
        moveToResults();
    };
    const handleSubcategoryChange = (parent: string, value: string) => {
        setCategory(parent);
        setSubcategory(value);
        setOpenCategory(parent);
        moveToResults();
    };
    return (<main className="mx-auto max-w-7xl px-4 pb-20 pt-5 sm:px-6">
      <form onSubmit={handleSearch} className="sticky top-16 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Search the store</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products, brands, sellers…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-violet-500 focus:bg-white"/></label>
            <button type="button" aria-expanded={filtersOpen} aria-controls="storefront-filter-controls" onClick={() => setFiltersOpen(open => !open)} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:border-violet-300 hover:text-violet-700 sm:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4"/></svg>
              Filters{activeFilterCount > 0 ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-100 px-1 text-[10px] text-violet-800">{activeFilterCount}</span> : null}
            </button>
          </div>
          <div id="storefront-filter-controls" className={`${filtersOpen ? 'grid' : 'hidden'} grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end`}>
            <select aria-label="Filter category" value={category} onChange={e => handleCategoryChange(e.target.value)} className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold sm:w-40"><option value="All">All categories</option>{categoryOptions.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Filter brand" value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold sm:w-40"><option value="All">All brands</option>{brandOptions.map(value => <option key={value} value={value}>{value}</option>)}</select>
            <select aria-label="Filter condition" value={condition} onChange={e => setCondition(e.target.value)} className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold sm:w-36"><option value="all">Any condition</option><option value="new">New</option><option value="used">Used</option><option value="spare-part">Spare parts</option></select>
            <select aria-label="Sort products" value={sort} onChange={e => setSort(e.target.value)} className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold sm:w-44"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name A–Z</option></select>
            <label className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 sm:px-3"><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} className="h-4 w-4 shrink-0 rounded border-slate-300"/> In stock only</label>
            <label className="flex h-10 min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 sm:gap-2 sm:px-3"><span className="shrink-0">Max price</span><input value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Any" className="h-8 w-14 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 sm:w-24 sm:px-3"/></label>
            <button type="button" onClick={() => { setQuery(''); setCategory('All'); setBrandFilter('All'); setSubcategory('All'); setOpenCategory(null); setSort('featured'); setCondition('all'); setAvailableOnly(false); setMaxPrice(''); setFiltersOpen(false); }} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:border-slate-400">Clear filters</button>
          </div>
        </div>
      </form>
      <section
        aria-labelledby="shop-categories-heading"
        onMouseLeave={() => setOpenCategory(null)}
        onBlurCapture={event => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpenCategory(null);
        }}
        onKeyDown={event => {
            if (event.key === 'Escape') setOpenCategory(null);
        }}
        className="relative -mx-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 px-4 py-4 sm:-mx-6 sm:px-6 xl:sticky xl:top-[126px] xl:z-10"
      >
        <div className="relative mx-auto max-w-7xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="shop-categories-heading" className="text-sm font-extrabold text-slate-950">Shop by category</h2>
              <p className="mt-0.5 text-xs text-slate-500">Find your next favorite.</p>
            </div>
            {categoryOptions.length > 2
                ? <span className="shrink-0 text-xs font-semibold text-violet-700 lg:hidden">Swipe to explore <span aria-hidden="true">→</span></span>
                : null}
            <span className="hidden shrink-0 text-xs font-semibold text-slate-500 lg:inline">{categoryOptions.length - 1} {categoryOptions.length === 2 ? 'category' : 'categories'}</span>
          </div>
          <div role="group" aria-label="Filter by category" className="flex snap-x gap-2 overflow-x-auto pb-1 scroll-smooth lg:flex-wrap lg:overflow-visible">
            {categoryOptions.map(c => {
                const count = c === 'All' ? products.length : categoryCounts.get(c) || 0;
                const selected = category === c;
                const subcategories = subcategoriesByCategory.get(c) || [];
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={selected}
                    aria-expanded={subcategories.length ? openCategory === c : undefined}
                    aria-controls={openCategory === c && subcategories.length ? 'subcategory-menu' : undefined}
                    onMouseEnter={() => setOpenCategory(subcategories.length ? c : null)}
                    onFocus={() => {
                        if (subcategories.length) setOpenCategory(c);
                    }}
                    onClick={() => handleCategoryTabClick(c)}
                    className={`inline-flex h-11 max-w-[14rem] shrink-0 snap-start items-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${selected ? 'border-violet-700 bg-violet-700 text-white shadow-sm shadow-violet-900/15' : 'border-slate-200 bg-white/90 text-slate-700 hover:border-violet-300 hover:bg-white hover:text-violet-700'}`}
                  >
                    <span className="max-w-[9rem] truncate">{c}</span>
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold ${selected ? 'bg-white/15 text-white' : 'bg-violet-50 text-violet-700'}`}>{count}</span>
                  </button>
                );
            })}
          </div>
          {openCategory && subcategoriesByCategory.get(openCategory)?.length ? (
            <div id="subcategory-menu" className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-violet-100 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Browse {openCategory}</p>
                <button type="button" aria-pressed={subcategory === 'All'} onClick={() => handleSubcategoryChange(openCategory, 'All')} className="text-xs font-bold text-violet-700 hover:text-violet-900">All {openCategory}</button>
              </div>
              <div role="group" aria-label={`${openCategory} subcategories`} className="flex flex-wrap gap-2">
                {subcategoriesByCategory.get(openCategory)?.map(option => (
                  <button key={option.name} type="button" aria-pressed={subcategory === option.name} onClick={() => handleSubcategoryChange(openCategory, option.name)} className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${subcategory === option.name ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800'}`}>
                    {option.name}<span className={`text-[10px] ${subcategory === option.name ? 'text-violet-100' : 'text-slate-400'}`}>{option.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

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
              <p className="text-xs font-bold uppercase tracking-[.25em] text-amber-300">Featured on {brand.companyName}</p>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">{banners[activeBanner]?.title}</h1>
              {banners[activeBanner]?.description && <p className="mt-4 max-w-lg text-sm leading-6 text-slate-200 sm:text-base">{banners[activeBanner].description}</p>}
              {banners[activeBanner]?.button_label && <a href={banners[activeBanner].button_url || '#all-products'} className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-100">{banners[activeBanner].button_label} <span className="ml-2">→</span></a>}
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
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Good finds.<br /><span className="bg-gradient-to-r from-rose-300 to-cyan-200 bg-clip-text text-transparent">All in one place.</span></h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">Discover standout tech, fashion and everyday essentials from trusted sellers.</p>
            <a href="#all-products" className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-violet-100">Explore products <span className="ml-2">→</span></a>
          </div>
        </section>
      )}

      <div id="latest"><ProductRail title="Latest drops" subtitle={`Fresh on ${brand.companyName}`} products={latest}/></div>
      <ProductRail title="Top sellers" subtitle="Based on completed sales" products={topSelling}/>
      <ProductRail title="Trending now" subtitle="Recent shopper interest" products={trendingProducts}/>


      {groups.map(group => <ProductRail key={group} title={group} subtitle="Curated for you" products={products.filter(p => normalizeProductMainCategory(p.category) === group)}/>)}

      <section id="all-products" className="mt-16 scroll-mt-36">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">The collection</p><h2 className="mt-1 text-3xl font-black text-slate-950">Explore products</h2></div>
          <span className="text-sm text-slate-500">{filtered.length} items{feedLoading ? ' · Loading…' : ''}</span>
        </div>
        {feedError && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{feedError}</p>}
        {filtered.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{filtered.map(p => <ProductCard key={p.id} product={p}/>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">{feedLoading ? 'Loading products…' : 'No products match your search. Try another keyword or category.'}</div>}
        {fairRpcReady && hasMore && <div className="mt-7 text-center"><button type="button" onClick={() => void loadMoreProducts()} disabled={feedLoading} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 shadow-sm hover:border-violet-400 hover:text-violet-800 disabled:cursor-wait disabled:opacity-60">{feedLoading ? 'Loading products…' : 'Load more products'}</button></div>}
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
