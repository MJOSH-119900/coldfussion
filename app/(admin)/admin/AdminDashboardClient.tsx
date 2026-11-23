'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BannerSettings, Order, OwnerAbout, Product } from '../../(public)/components/types/store';
import ProductForm from './components/ProductForm';
import {
    approveVendorRequestAction,
    deleteProductAction,
    getMarketplaceStatsAction,
    getAdminWhatsAppAction,
    getBannerSettingsAction,
    getAdminCustomerContentCountAction,
    getMusicTracksAction,
    getOwnerAboutAction,
    getProductsAction,
    getVendorRequestsAction,
    getVendorsAction,
    rejectVendorRequestAction,
    saveAdminWhatsAppAction,
    updateVendorStatusAction,
    getSubAdminsAction,
    inviteSubAdminAction,
    revokeSubAdminAction,
    deleteSubAdminAction,
} from './actions';
import { logoutAction } from '../../actions/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '../../components/ToastProvider';
import { getAdminOrdersAction } from '../../../lib/marketplace';
import MusicManager from './components/MusicManager';
import BannerManager from './components/BannerManager';
import BrandManager from './components/BrandManager';
import AboutManager from './components/AboutManager';
import CustomerInboxManager from './components/CustomerInboxManager';
import UpgradeAnnouncementManager from './components/UpgradeAnnouncementManager';
import BackupManager from './components/BackupManager';
import AccountPasswordSecurity from '../../components/PasswordSecurity';
import { useBranding } from '../../(public)/components/BrandingProvider';
import VendorProductRequestsManager from './components/VendorProductRequestsManager';
const navGroups = [
    { label: 'Dashboard', items: ['Overview'] },
    { label: 'Store management', items: ['Vendors', 'Products', 'Vendor Product Requests', 'Orders', 'Giveaways'] },
    { label: 'Insights', items: ['Analytics', 'Reports'] },
    { label: 'Storefront', items: ['Banners', 'Branding', 'About', 'Music', 'Upgrade notice'] },
    { label: 'Customer care', items: ['Inbox'] },
    { label: 'Administration', items: ['Backups', 'Security', 'Sub-admins'] },
];
const PAGE_SIZE = 8;
export default function DashboardPortal({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [marketplace, setMarketplace] = useState<any>(null);
    const [musicTracks, setMusicTracks] = useState<Awaited<ReturnType<typeof getMusicTracksAction>>>([]);
    const [bannerSettings, setBannerSettings] = useState<BannerSettings>({ slides: [], intervalValue: 5, intervalUnit: 'seconds' });
    const [ownerAbout, setOwnerAbout] = useState<OwnerAbout>();
    const [inboxCount, setInboxCount] = useState(0);
    const [productsLoading, setProductsLoading] = useState(true);
    const [editingProduct, setEditingProduct] = useState<Product | undefined>();
    const [section, setSection] = useState('Products');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All');
    const [availability, setAvailability] = useState('All');
    const [page, setPage] = useState(1);
    const [isPending, startTransition] = useTransition();
    const { notify, confirm } = useToast();
    const router = useRouter();
    const { brand } = useBranding();
    const [subAdmins, setSubAdmins] = useState<Array<{id:string;email:string;created_at:string}>>([]);
    const [subAdminEmail, setSubAdminEmail] = useState('');
    const [subAdminMessage, setSubAdminMessage] = useState('');
    const [subAdminBusy, setSubAdminBusy] = useState(false);
    useEffect(() => { if (isSuperAdmin) void getSubAdminsAction().then(setSubAdmins).catch(error => setSubAdminMessage(error instanceof Error ? error.message : 'Could not load sub-admins.')); }, [isSuperAdmin]);
    const knownReceiptConfirmations = useRef<Set<string> | null>(null);
    useEffect(() => {
        let active = true;
        Promise.all([getProductsAction(), getMarketplaceStatsAction(), getMusicTracksAction(), getBannerSettingsAction(), getOwnerAboutAction()]).then(([products, stats, tracks, banners, about]) => {
            if (active) {
                setAllProducts(products);
                setMarketplace(stats);
                setMusicTracks(tracks);
                setBannerSettings(banners);
                setOwnerAbout(about);
            }
        }).catch(error => {
            console.error('Could not load products', error);
            notify('error', error instanceof Error ? error.message : 'Could not load the product catalog.', 'Catalog loading failed');
        }).finally(() => {
            if (active)
                setProductsLoading(false);
        });
        return () => { active = false; };
    }, [notify]);
    useEffect(() => {
        let active = true;
        const refreshInboxCount = () => {
            void getAdminCustomerContentCountAction().then(count => {
                if (active)
                    setInboxCount(count);
            }).catch(error => console.error('Could not refresh customer inbox count', error));
        };
        refreshInboxCount();
        const interval = window.setInterval(refreshInboxCount, 30000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);
    useEffect(() => {
        let active = true;
        let checking = false;
        const checkCustomerReceipts = async () => {
            if (checking) return;
            checking = true;
            try {
                const orders = await getAdminOrdersAction();
                if (!active) return;
                const confirmed = orders.filter(order => order.customer_received_at);
                const currentIds = new Set(confirmed.map(order => order.order_id));
                const previousIds = knownReceiptConfirmations.current;
                if (previousIds) {
                    for (const order of confirmed) {
                        if (!previousIds.has(order.order_id)) {
                            notify('success', `Customer confirmed receipt for order ${order.order_id}.`, 'Receipt confirmed');
                        }
                    }
                }
                knownReceiptConfirmations.current = currentIds;
            } catch (error) {
                console.error('Could not check customer receipt confirmations', error);
            } finally {
                checking = false;
            }
        };
        void checkCustomerReceipts();
        const interval = window.setInterval(() => { void checkCustomerReceipts(); }, 30000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [notify]);
    const filteredProducts = useMemo(() => allProducts, [allProducts]);
    const categories = useMemo(() => Array.from(new Set(filteredProducts.map(p => p.category).filter(Boolean))).sort(), [filteredProducts]);
    const searchedProducts = useMemo(() => {
        const term = query.trim().toLowerCase();
        return filteredProducts.filter(p => {
            const matchesSearch = !term || [p.title, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(term);
            const matchesCategory = category === 'All' || p.category === category;
            const matchesAvailability = availability === 'All' || (availability === 'Available' ? p.is_available && (p.available_quantity || 0) > 0 : !p.is_available || (p.available_quantity || 0) <= 0);
            return matchesSearch && matchesCategory && matchesAvailability;
        });
    }, [filteredProducts, query, category, availability]);
    const totalPages = Math.max(1, Math.ceil(searchedProducts.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paginatedProducts = searchedProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const updateFilters = (setter: (value: string) => void, value: string) => {
        setter(value);
        setPage(1);
    };
    const goToProductPage = (nextPage: number) => {
        setPage(nextPage);
        document.getElementById('admin-products-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const refresh = (savedProduct: Product) => {
        setAllProducts(current => {
            const exists = current.some(p => p.id === savedProduct.id);
            return exists ? current.map(p => p.id === savedProduct.id ? savedProduct : p) : [...current, savedProduct];
        });
        setEditingProduct(undefined);
        setPage(1);
    };
    const handleDelete = async (id: string) => {
        const accepted = await confirm({ title: 'Delete this product?', message: 'This removes the product from the storefront. This action cannot be undone.', confirmText: 'Delete product', cancelText: 'Keep product', danger: true });
        if (!accepted)
            return;
        startTransition(async () => {
            try {
                const result = await deleteProductAction(id);
                if (!result.success) {
                    notify('error', 'The delete action did not complete.', 'Product not deleted');
                    return;
                }
                setAllProducts(prev => prev.filter(p => p.id !== id));
                if (editingProduct?.id === id)
                    setEditingProduct(undefined);
                setPage(current => Math.min(current, Math.max(1, Math.ceil((searchedProducts.length - 1) / PAGE_SIZE))));
                notify('success', 'The product has been removed from your catalog.', 'Product deleted');
            }
            catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not delete product.', 'Delete failed');
            }
        });
    };
    const giveawayCount = filteredProducts.filter(p => p.giveaway).length;
    const totalAvailable = filteredProducts.reduce((sum, p) => sum + (p.available_quantity || 0), 0);
    const selectSection = (item: string) => {
        setSection(item);
        setPage(1);
        setMobileMenuOpen(false);
    };
    const logout = async () => {
        await logoutAction();
        router.push('/admin/login');
        router.refresh();
    };
    return (<div className="h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex h-screen min-h-0">
        <aside className="hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-5 text-white md:flex md:flex-col">
          <div className="mb-8 shrink-0"><div className="flex items-center gap-2">{brand.logo && <img src={brand.logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain"/>}<p className="text-2xl font-black">{brand.companyName}<span className="text-violet-400">.</span></p></div><p className="mt-1 text-xs text-slate-400">Admin control panel</p></div>
          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Admin dashboard navigation">{navGroups.map(group => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{group.label}</p><div className="space-y-1">{group.items.filter(item => item !== 'Sub-admins' || isSuperAdmin).map(item => <button key={item} onClick={() => selectSection(item)} aria-current={section === item ? 'page' : undefined} className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${section === item ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><span className="flex items-center justify-between gap-2"><span>{item}</span>{item === 'Inbox' && inboxCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{inboxCount}</span>}</span></button>)}</div></div>)}</nav>
          <div className="mt-auto space-y-2">
            <Link href="/" className="block shrink-0 rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">View storefront</Link>
            <button type="button" onClick={logout} className="block w-full rounded-xl border border-red-900/60 px-4 py-3 text-center text-sm font-semibold text-red-300 hover:bg-red-950">Log out</button>
          </div>
        </aside>

        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
            <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open admin navigation" aria-expanded={mobileMenuOpen} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
                </button>
                <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Admin</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{section}</h1><p className="mt-1 hidden text-sm text-slate-500 sm:block">Manage products and storefront announcements. No private account data is displayed here.</p></div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/" className="hidden rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200 sm:inline-flex">Storefront ↗</Link>
                <button type="button" onClick={logout} className="hidden rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 sm:inline-flex">Log out</button>
              </div>
            </div>
          </header>
          {mobileMenuOpen && <div className="fixed inset-0 z-50 bg-slate-950/50 md:hidden">
            <aside role="dialog" aria-modal="true" aria-label="Admin navigation" className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col bg-slate-950 p-5 text-white shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2">{brand.logo && <img src={brand.logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain"/>}<p className="text-xl font-black">{brand.companyName}<span className="text-violet-400">.</span></p></div><p className="mt-1 text-xs text-slate-400">Admin control panel</p></div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close admin navigation" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18"/></svg>
                </button>
              </div>
              <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Admin dashboard navigation">{navGroups.map(group => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{group.label}</p><div className="space-y-1">{group.items.filter(item => item !== 'Sub-admins' || isSuperAdmin).map(item => <button key={item} onClick={() => selectSection(item)} aria-current={section === item ? 'page' : undefined} className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${section === item ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><span className="flex items-center justify-between gap-2"><span>{item}</span>{item === 'Inbox' && inboxCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{inboxCount}</span>}</span></button>)}</div></div>)}</nav>
              <div className="mt-auto space-y-2 border-t border-slate-800 pt-4">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">View storefront</Link>
                <button type="button" onClick={logout} className="block w-full rounded-xl border border-red-900/60 px-4 py-3 text-center text-sm font-semibold text-red-300 hover:bg-red-950">Log out</button>
              </div>
            </aside>
            <button type="button" aria-label="Close admin navigation" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 z-0 cursor-default"/>
          </div>}

          <div className="p-4 sm:p-8">
            {section === 'Overview' && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat title="Products" value={filteredProducts.length}/><Stat title="Available units" value={totalAvailable}/><Stat title="Giveaways" value={giveawayCount}/><Stat title="Completed sales" value={marketplace?.completedSales || 0}/><Stat title="Revenue" value={marketplace?.revenue || 0}/></div>}

            {section === 'Vendors' && <VendorSection />}
            {section === 'Vendor Product Requests' && <VendorProductRequestsManager />}
            {section === 'Orders' && <OrdersSection />}
            {section === 'Analytics' && <AnalyticsSection products={allProducts}/>}
            {section === 'Reports' && <ReportsSection />}

            {section === 'Giveaways' && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-black text-emerald-900">Giveaway announcements</h2><p className="mt-1 text-sm text-emerald-800">Manage giveaway listings from the product editor. Shoppers see clickable announcements and a limited-time giveaway pop-up.</p><div className="mt-4 grid gap-3">{filteredProducts.filter(p => p.giveaway).map(p => <article key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-emerald-200"><div><p className="font-bold">{p.title}</p><p className="mt-1 text-sm text-slate-600">{p.giveaway_announcement || 'Giveaway item announced.'}</p></div><div className="flex gap-2"><Link href={`/product/${p.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-violet-400">View product</Link><button type="button" onClick={() => { setSection('Products'); setEditingProduct(p); }} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">Edit</button></div></article>)}{!giveawayCount && <p className="text-sm text-emerald-700">No giveaway items announced yet.</p>}</div></div>}

            {section === 'Music' && <MusicManager initialTracks={musicTracks} />}

            {section === 'Upgrade notice' && <UpgradeAnnouncementManager />}

            {section === 'Backups' && <BackupManager />}

            {section === 'Banners' && <BannerManager initialSettings={bannerSettings} />}

            {section === 'Branding' && <BrandManager initialBrand={brand} />}

            {section === 'About' && (ownerAbout ? <AboutManager initialProfile={ownerAbout} /> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading About profile…</p>)}

            {section === 'Inbox' && <CustomerInboxManager onInboxCountChange={setInboxCount} />}

            {section === 'Security' && <AccountPasswordSecurity role="admin" />}
            {section === 'Sub-admins' && isSuperAdmin && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black">Sub-admin accounts</h2><p className="mt-1 text-sm text-slate-600">Create a sub-admin account by email. They receive a link to set a password, then sign in at the admin login to use the admin dashboard. The original setup-token account remains the super admin.</p><form className="mt-5 flex flex-wrap gap-2" onSubmit={async event => { event.preventDefault(); setSubAdminBusy(true); const result = await inviteSubAdminAction(subAdminEmail); setSubAdminBusy(false); setSubAdminMessage(result.success ? 'Sub-admin account created. An account setup link has been sent by email.' : result.error || 'Could not create sub-admin.'); if (result.success) { setSubAdminEmail(''); void getSubAdminsAction().then(setSubAdmins); } }}><input type="email" required value={subAdminEmail} onChange={event => setSubAdminEmail(event.target.value)} placeholder="subadmin@example.com" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"/><button disabled={subAdminBusy} className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-50">{subAdminBusy ? 'Sending…' : 'Invite sub-admin'}</button></form>{subAdminMessage && <p role="status" className="mt-3 text-sm text-slate-700">{subAdminMessage}</p>}<div className="mt-5 divide-y divide-slate-100">{subAdmins.map(user => <article key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold">{user.email}</p><p className="text-xs text-slate-500">Sub-admin</p></div><div className="flex gap-2"><button type="button" onClick={async () => { const result = await revokeSubAdminAction(user.id); setSubAdminMessage(result.success ? 'Sub-admin access revoked.' : result.error || 'Could not revoke access.'); if (result.success) void getSubAdminsAction().then(setSubAdmins); }} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800">Revoke</button><button type="button" onClick={async () => { if (!window.confirm(`Permanently delete ${user.email}?`)) return; const result = await deleteSubAdminAction(user.id); setSubAdminMessage(result.success ? 'Sub-admin deleted.' : result.error || 'Could not delete account.'); if (result.success) void getSubAdminsAction().then(setSubAdmins); }} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800">Delete</button></div></article>)}{!subAdmins.length && <p className="py-4 text-sm text-slate-500">No active sub-admins.</p>}</div></section>}

            {section === 'Products' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="font-black">Products ({searchedProducts.length})</h2><p className="text-xs text-slate-500">Search, filter, paginate and manage storefront products.</p>{productsLoading && <p className="mt-1 text-xs font-semibold text-violet-600">Loading current catalog…</p>}</div>
                    <div className="flex gap-2"><button onClick={async () => { setProductsLoading(true); try { setAllProducts(await getProductsAction()); } finally { setProductsLoading(false); } }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Refresh</button><button onClick={() => { setEditingProduct(undefined); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">+ New product</button></div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px]">
                    <div className="relative"><input value={query} onChange={e => updateFilters(setQuery, e.target.value)} placeholder="Search products, category or tags..." className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" aria-label="Search products"/></div>
                    <select value={category} onChange={e => updateFilters(setCategory, e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500" aria-label="Filter by category"><option value="All">All categories</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    <select value={availability} onChange={e => updateFilters(setAvailability, e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500" aria-label="Filter by availability"><option value="All">All availability</option><option value="Available">Available</option><option value="Unavailable">Unavailable</option></select>
                  </div>
                </div>

                <div id="admin-products-list" className="overflow-x-auto" aria-busy={productsLoading}>
                  <table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-400"><th className="px-3 py-3">Product</th><th className="px-3 py-3">Availability</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Flags</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody key={safePage} className="product-page-in">{productsLoading && paginatedProducts.length === 0 ? Array.from({length: 5}, (_, index) => <tr key={`loading-${index}`} aria-hidden="true" className="border-b border-slate-100"><td className="px-3 py-4"><div className="flex items-center gap-3"><div className="h-11 w-11 animate-pulse rounded-lg bg-slate-200"/><div className="space-y-2"><div className="h-3 w-36 animate-pulse rounded bg-slate-200"/><div className="h-2 w-24 animate-pulse rounded bg-slate-100"/></div></div></td><td className="px-3 py-4"><div className="h-3 w-24 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="h-3 w-20 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="h-5 w-16 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="ml-auto h-7 w-20 animate-pulse rounded bg-slate-100"/></td></tr>) : paginatedProducts.map(p => <tr key={p.id} className="border-b border-slate-100 transition-colors duration-200 hover:bg-slate-50"><td className="px-3 py-4"><div className="flex items-center gap-3"><img src={p.images?.[0]} alt="" loading="lazy" className="h-11 w-11 rounded-lg object-cover"/><div><p className="font-bold">{p.title}</p><p className="text-xs text-slate-400">{p.category} · ♥ {p.likes_count || 0} likes{p.size_prices?.length ? ` · ${p.size_prices.length} sizes` : ''}</p></div></div></td><td className="px-3 py-4"><span className={p.is_available ? 'text-emerald-600' : 'text-red-600'}>{p.is_available ? `${p.available_quantity || 0} available` : 'Unavailable'}</span></td><td className="px-3 py-4"><span className="font-black">₦{p.size_prices?.length ? `From ₦${Math.min(...p.size_prices.map(v => v.price)).toLocaleString()}` : `₦${p.price.toLocaleString()}`}</span>{p.compare_at_price && <span className="ml-2 text-xs text-slate-400 line-through">₦{p.compare_at_price.toLocaleString()}</span>}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-1">{p.giveaway && <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Giveaway</span>}{p.is_latest && <span className="rounded bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">Latest</span>}{p.is_top_selling && <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Top seller</span>}</div></td><td className="px-3 py-4"><div className="flex justify-end gap-2"><button onClick={() => setEditingProduct(p)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:border-violet-400">Edit</button><button disabled={isPending} onClick={() => handleDelete(p.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">Delete</button></div></td></tr>)}</tbody></table>
                  {paginatedProducts.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No products match your search/filter.</div>}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6">
                  <p className="text-xs text-slate-500">Showing {searchedProducts.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}-{Math.min(safePage * PAGE_SIZE, searchedProducts.length)} of {searchedProducts.length}</p>
                  <div className="flex items-center gap-1"><button disabled={safePage === 1} onClick={() => goToProductPage(Math.max(1, safePage - 1))} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Previous</button>{Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, safePage - 3), safePage + 2).map(n => <button key={n} onClick={() => goToProductPage(n)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${n === safePage ? 'bg-violet-600 text-white' : 'border hover:border-violet-400'}`}>{n}</button>)}<button disabled={safePage === totalPages} onClick={() => goToProductPage(Math.min(totalPages, safePage + 1))} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>
                </div>
              </section>

              <div className="min-w-0 xl:sticky xl:top-28 xl:self-start">
                <ProductForm key={editingProduct ? `${editingProduct.id}-${editingProduct.price}-${editingProduct.compare_at_price ?? "none"}` : "new-product"} currentVendorId="admin" isAdmin editProduct={editingProduct} products={filteredProducts} onSuccess={refresh} onCancel={() => setEditingProduct(undefined)}/>
              </div>
            </div>}
          </div>
        </main>
      </div>
    </div>);
}
function VendorSection() {
    const { brand } = useBranding();
    const [requests, setRequests] = useState<any[]>([]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [applicationId, setApplicationId] = useState('');
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState('');
    const [adminWhatsApp, setAdminWhatsApp] = useState('');
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [whatsAppMessage, setWhatsAppMessage] = useState('');
    const reload = () => Promise.all([getVendorRequestsAction(), getVendorsAction(), getAdminWhatsAppAction()]).then(([r, v, phone]) => { setRequests(r); setVendors(v); setAdminWhatsApp(phone); });
    useEffect(() => { reload(); }, []);
    const saveWhatsApp = async () => {
        setSavingWhatsApp(true); setWhatsAppMessage('');
        try {
            const result = await saveAdminWhatsAppAction(adminWhatsApp);
            if (!result.success) { setWhatsAppMessage(result.error || 'Could not save the WhatsApp number.'); return; }
            setAdminWhatsApp(result.phone || '');
            setWhatsAppMessage(result.phone ? 'Admin WhatsApp number saved. New vendor applications will open a pre-filled WhatsApp message to this number.' : 'Admin WhatsApp number cleared. Applications will still be saved for review.');
        } finally { setSavingWhatsApp(false); }
    };
    const decide = async (action: 'approve' | 'reject') => { setWorking(true); setMessage(''); const id = applicationId.trim(); const result = action === 'approve' ? await approveVendorRequestAction(id) : await rejectVendorRequestAction(id); setWorking(false); if (!result.success) {
        setMessage(result.error || 'Unable to process this application.');
        return;
    } setMessage(action === 'approve' ? `Application approved. Vendor ID: ${'vendor' in result ? (result.vendor as { vendor_id: string }).vendor_id : 'created'}` : 'Application rejected.'); setApplicationId(''); await reload(); };
    const pending = requests.filter(r => r.status === 'pending');
    return <div className="space-y-4">
    <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Vendor verification WhatsApp</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Set the official {brand.companyName} admin WhatsApp number. After registration, vendors will be offered a pre-filled message containing their application details so you can verify them before approving or rejecting the application.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${adminWhatsApp ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{adminWhatsApp ? 'Configured' : 'Not configured'}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-sm font-semibold text-slate-700">Admin WhatsApp number (include country code)<input value={adminWhatsApp} onChange={e => setAdminWhatsApp(e.target.value)} placeholder="2348012345678" inputMode="tel" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"/><span className="mt-1 block text-xs font-normal text-slate-400">Digits only is recommended. Example for Nigeria: 2348012345678.</span></label><button type="button" disabled={savingWhatsApp} onClick={saveWhatsApp} className="self-end rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{savingWhatsApp ? 'Saving…' : 'Save WhatsApp'}</button></div>
      {whatsAppMessage && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{whatsAppMessage}</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Vendor applications</h2><p className="mt-1 text-sm text-slate-500">Review the saved application details, then approve or reject each applicant.</p></div><Link href="/vendor/register" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Registration page</Link></div>
      <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4"><label className="block text-sm font-bold text-slate-800">Vendor application / registration ID<input value={applicationId} onChange={e => setApplicationId(e.target.value.toUpperCase())} placeholder="e.g. VREQ0001" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-violet-500"/></label><div className="mt-3 flex flex-wrap gap-2"><button disabled={working || !applicationId.trim()} onClick={() => decide('approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{working ? 'Processing…' : 'Approve application'}</button><button disabled={working || !applicationId.trim()} onClick={() => decide('reject')} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-600 disabled:opacity-50">Reject application</button></div>{message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}</div>
      <div className="mt-5 space-y-3">{pending.map(r => <div key={r.request_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{r.business_name}</p><span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold">{r.request_id}</span></div><p className="mt-1 text-sm text-slate-500">{r.owner_name} · {r.email} · {r.whatsapp_number}</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="font-semibold text-slate-700">First product category:</span> {r.product_main_category || 'Other Categories'} / {r.product_subcategory || 'Other'}</p><p><span className="font-semibold text-slate-700">Address:</span> {r.business_address || '—'}</p><p><span className="font-semibold text-slate-700">Submitted:</span> {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</p><p><span className="font-semibold text-slate-700">Status:</span> <span className="font-semibold text-amber-700">Pending verification</span></p></div><p className="mt-2 text-sm leading-6">{r.business_description}</p>{r.logo && <a href={r.logo} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-violet-700">View business logo ↗</a>}<button onClick={() => setApplicationId(r.request_id)} className="mt-3 rounded-lg border px-3 py-2 text-xs font-bold hover:border-violet-400">Select for approval / rejection</button></div>)}{!pending.length && <p className="py-8 text-center text-sm text-slate-500">No pending vendor applications.</p>}</div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-black">Approved vendors</h2><div className="mt-4 space-y-2">{vendors.map(v => <div key={v.vendor_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-bold">{v.business_name}</p><p className="text-xs text-slate-500">{v.vendor_id} · {v.email} · {v.status}</p></div><button onClick={async () => { const next = v.status === 'suspended' ? 'active' : 'suspended'; const x = await updateVendorStatusAction(v.vendor_id, next); if (x.success)
        reload(); }} className="rounded-lg border px-3 py-2 text-xs font-bold">{v.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button></div>)}{!vendors.length && <p className="text-sm text-slate-500">No vendors approved yet.</p>}</div></div>
  </div>;
}
function OrdersSection() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const { notify } = useToast();
    const refreshOrders = useCallback(async () => {
        try {
            setOrders(await getAdminOrdersAction());
        } catch (error) {
            console.error('Could not refresh marketplace orders', error);
            notify('error', error instanceof Error ? error.message : 'Could not refresh marketplace orders.', 'Order refresh failed');
        } finally {
            setLoading(false);
        }
    }, [notify]);
    useEffect(() => {
        let active = true;
        const pollOrders = () => {
            void getAdminOrdersAction().then(orders => {
                if (active) setOrders(orders);
            }).catch(error => {
                if (active) {
                    console.error('Could not refresh marketplace orders', error);
                    notify('error', error instanceof Error ? error.message : 'Could not refresh marketplace orders.', 'Order refresh failed');
                }
            }).finally(() => {
                if (active) setLoading(false);
            });
        };
        pollOrders();
        const interval = window.setInterval(pollOrders, 30000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [notify]);
    return <div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Marketplace orders</h2><p className="mt-1 text-sm text-slate-500">Track vendor progress and customer receipt confirmations.</p></div><button onClick={() => { setLoading(true); void refreshOrders(); }} className="rounded-lg border px-3 py-2 text-xs font-bold">Refresh</button></div>{loading ? <p className="py-8 text-sm text-slate-500">Loading orders…</p> : <div className="mt-5 space-y-3">{orders.slice().reverse().map(order => <div key={order.order_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">{order.order_id}</p><p className="text-xs text-slate-500">Checkout: {order.checkout_id || '—'} · Vendor: {order.vendor_id} · {new Date(order.created_at).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{order.status}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{order.items.length} line item(s) · {order.customer_name || 'Customer'}</span><strong>₦{Number(order.total || 0).toLocaleString()}</strong></div>{order.receipt_confirmation_sent_at && !order.customer_received_at && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Receipt confirmation link sent · awaiting customer</p>}{order.customer_received_at && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Customer confirmed receipt · {new Date(order.customer_received_at).toLocaleString()}</p>}</div>)}{!orders.length && <p className="py-8 text-center text-sm text-slate-500">No orders have been created yet.</p>}</div>}</div>;
}
function ReportsSection() { return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-black">CSV reports</h2><p className="mt-1 text-sm text-slate-500">Exports never include passwords, authentication hashes or private credentials.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['vendors', 'Vendors'], ['products', 'Products'], ['orders', 'Orders'], ['sales', 'Completed sales'], ['analytics', 'Product analytics']].map(([type, label]) => <a key={type} href={`/api/admin/export?type=${type}`} className="rounded-xl border border-slate-200 p-4 text-sm font-bold hover:border-violet-400 hover:text-violet-700">Download {label} CSV →</a>)}</div></div>; }
function AnalyticsSection({ products }: {
    products: Product[];
}) { const ranked = products.filter(p => (p.likes_count || 0) > 0).sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 8); return <div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Product engagement</h2><a href="/api/admin/export?type=analytics" className="rounded-lg border px-3 py-2 text-xs font-bold">Export analytics CSV</a></div><div className="mt-4 space-y-2">{ranked.map(p => <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-semibold">{p.title}</span><span className="font-black">{p.likes_count} likes</span></div>)}{!ranked.length && <p className="text-sm text-slate-500">No engagement recorded yet.</p>}</div></div>; }
function Stat({ title, value }: {
    title: string;
    value: number;
}) { return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-black">{value.toLocaleString()}</p></div>; }



