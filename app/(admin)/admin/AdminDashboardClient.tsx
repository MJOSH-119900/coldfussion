'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BannerSettings, Order, OwnerAbout, Product, VendorAdminOverview } from '../../(public)/components/types/store';
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
    getProductVendorContextAction,
    getVendorRequestsAction,
    getVendorsAction,
    deleteVendorAction,
    revokeVendorProductAction,
    rejectVendorRequestAction,
    saveAdminWhatsAppAction,
    getVendorApplicationSettingsAction,
    saveVendorApplicationSettingsAction,
    updateVendorStatusAction,
    getSubAdminsAction,
    inviteSubAdminAction,
    revokeSubAdminAction,
    deleteSubAdminAction,
    extendVendorAccessAction,
    resendVendorSetupEmailAction,
    generateVendorWhatsAppSetupLinkAction,
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
import VendorUpgradeRequestsManager from './components/VendorUpgradeRequestsManager';
import { getProductSubcategories, isValidProductCategoryPair, normalizeSelectedProductSubcategory, OTHER_SUBCATEGORY_PREFIX, PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';
import { DEFAULT_VENDOR_ONBOARDING_SETTINGS, type VendorOnboardingSettings } from '../../../lib/vendor-onboarding';

const VENDOR_LIST_PAGE_SIZE = 20;
const navGroups = [
    { label: 'Dashboard', items: ['Overview'] },
    { label: 'Store management', items: ['Vendors', 'Vendor Add-ons', 'Products', 'Vendor Product Requests', 'Orders', 'Giveaways'] },
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
    const [productDetails, setProductDetails] = useState<Product | null>(null);
    const [productVendorContext, setProductVendorContext] = useState<Awaited<ReturnType<typeof getProductVendorContextAction>> | null>(null);
    const [productDetailsLoading, setProductDetailsLoading] = useState(false);
    const [openProductMenuId, setOpenProductMenuId] = useState('');
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
    const [sectionRestored, setSectionRestored] = useState(false);
    useEffect(() => {
        try {
            const savedSection = window.sessionStorage.getItem('admin-dashboard-section');
            const availableSections = navGroups.flatMap(group => group.items).filter(item => item !== 'Sub-admins' || isSuperAdmin);
            if (savedSection && availableSections.includes(savedSection)) setSection(savedSection);
        } catch { /* Keep the default section when browser storage is unavailable. */ }
        setSectionRestored(true);
    }, [isSuperAdmin]);
    useEffect(() => {
        if (sectionRestored) {
            try { window.sessionStorage.setItem('admin-dashboard-section', section); }
            catch { /* Dashboard navigation still works without browser storage. */ }
        }
    }, [section, sectionRestored]);
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
    const openProductDetails = async (product: Product) => {
        setProductDetails(product);
        setProductVendorContext(null);
        setProductDetailsLoading(true);
        setOpenProductMenuId('');
        try {
            const context = await getProductVendorContextAction(product.id);
            setProductVendorContext(context);
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not load the vendor context.', 'Product details');
        } finally {
            setProductDetailsLoading(false);
        }
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
            {section === 'Vendor Add-ons' && <VendorUpgradeRequestsManager />}
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
                  <table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-400"><th className="px-3 py-3">Product</th><th className="px-3 py-3">Availability</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Flags</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody key={safePage} className="product-page-in">{productsLoading && paginatedProducts.length === 0 ? Array.from({length: 5}, (_, index) => <tr key={`loading-${index}`} aria-hidden="true" className="border-b border-slate-100"><td className="px-3 py-4"><div className="flex items-center gap-3"><div className="h-11 w-11 animate-pulse rounded-lg bg-slate-200"/><div className="space-y-2"><div className="h-3 w-36 animate-pulse rounded bg-slate-200"/><div className="h-2 w-24 animate-pulse rounded bg-slate-100"/></div></div></td><td className="px-3 py-4"><div className="h-3 w-24 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="h-3 w-20 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="h-5 w-16 animate-pulse rounded bg-slate-100"/></td><td className="px-3 py-4"><div className="ml-auto h-7 w-20 animate-pulse rounded bg-slate-100"/></td></tr>) : paginatedProducts.map(p => <tr key={p.id} className="border-b border-slate-100 transition-colors duration-200 hover:bg-slate-50"><td className="px-3 py-4"><div className="flex items-center gap-3"><img src={p.images?.[0]} alt="" loading="lazy" className="h-11 w-11 rounded-lg object-cover"/><div><p className="font-bold">{p.title}</p><p className="text-xs text-slate-400">{p.category} · ♥ {p.likes_count || 0} likes{p.size_prices?.length ? ` · ${p.size_prices.length} sizes` : ''}</p></div></div></td><td className="px-3 py-4"><span className={p.is_available ? 'text-emerald-600' : 'text-red-600'}>{p.is_available ? `${p.available_quantity || 0} available` : 'Unavailable'}</span></td><td className="px-3 py-4"><span className="font-black">₦{p.size_prices?.length ? `From ₦${Math.min(...p.size_prices.map(v => v.price)).toLocaleString()}` : `₦${p.price.toLocaleString()}`}</span>{p.compare_at_price && <span className="ml-2 text-xs text-slate-400 line-through">₦{p.compare_at_price.toLocaleString()}</span>}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-1">{p.giveaway && <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Giveaway</span>}{p.is_latest && <span className="rounded bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">Latest</span>}{p.is_top_selling && <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Top seller</span>}</div></td><td className="px-3 py-4"><div className="relative flex justify-end"><button type="button" aria-label={`Open actions for ${p.title}`} aria-expanded={openProductMenuId === p.id} onClick={() => setOpenProductMenuId(current => current === p.id ? '' : p.id)} className="rounded-lg border px-2.5 py-1.5 text-lg font-black leading-none hover:border-violet-400">⋮</button>{openProductMenuId === p.id && <div className="absolute right-0 top-9 z-20 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"><button type="button" onClick={() => void openProductDetails(p)} className="w-full rounded-md px-3 py-2 text-left text-xs font-bold hover:bg-slate-50">View product and vendor details</button><button type="button" onClick={() => { setEditingProduct(p); setOpenProductMenuId(''); }} className="w-full rounded-md px-3 py-2 text-left text-xs font-bold hover:bg-slate-50">Edit product</button><button type="button" disabled={isPending} onClick={() => { setOpenProductMenuId(''); void handleDelete(p.id); }} className="w-full rounded-md px-3 py-2 text-left text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-40">Delete product</button></div>}</div></td></tr>)}</tbody></table>
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
      {productDetails && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Product and vendor details">
        <button type="button" aria-label="Close product details" onClick={() => setProductDetails(null)} className="absolute inset-0 cursor-default"/>
        <section className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">Product details</p><h2 className="mt-1 text-2xl font-black text-slate-950">{productDetails.title}</h2><p className="mt-1 font-mono text-xs text-slate-500">{productDetails.id}</p></div><button type="button" onClick={() => setProductDetails(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:border-violet-400">Close</button></div>
          <div className="mt-5 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]"><img src={productDetails.images?.[0]} alt="" className="h-44 w-full rounded-xl bg-slate-100 object-cover"/><div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="font-semibold">Category:</span> {productDetails.category} / {productDetails.subcategory || '—'}</p><p><span className="font-semibold">Price:</span> ₦{productDetails.price.toLocaleString()}</p><p><span className="font-semibold">Availability:</span> {productDetails.is_available ? `${productDetails.available_quantity || 0} available` : 'Unavailable'}</p><p><span className="font-semibold">Condition:</span> {productDetails.condition || 'Not specified'}</p><p className="sm:col-span-2"><span className="font-semibold">Description:</span> {productDetails.description || '—'}</p></div></div>
          <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="text-lg font-black text-slate-950">Vendor and catalog</h3>{productDetailsLoading && <p className="mt-3 text-sm text-slate-500">Loading vendor details…</p>}{!productDetailsLoading && productVendorContext?.success && <><div className="mt-3 rounded-xl bg-violet-50 p-4 text-sm"><p className="font-bold text-violet-950">{productVendorContext.vendor?.business_name || 'Vendor profile unavailable'}</p>{productVendorContext.vendor && <p className="mt-1 text-slate-700">{productVendorContext.vendor.vendor_id} · {productVendorContext.vendor.owner_name || 'No owner name'} · {productVendorContext.vendor.email || 'No email'} · {productVendorContext.vendor.status || 'No status'}</p>}</div><div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{productVendorContext.products.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.title}</p><p className="text-xs text-slate-500">{item.category} / {item.subcategory || '—'} · ₦{item.price.toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{item.is_available ? `${item.available_quantity || 0} available` : 'Unavailable'}</span></div>)}{!productVendorContext.products.length && <p className="p-4 text-sm text-slate-500">This vendor has no catalog products.</p>}</div></>}{!productDetailsLoading && productVendorContext && !productVendorContext.success && <p className="mt-3 text-sm text-red-700">{productVendorContext.error}</p>}</div>
        </section>
      </div>}
    </div>);
}
type VendorApplicationSummary = {
    request_id: string;
    status: string;
    business_name?: string;
    owner_name?: string;
    email?: string;
    whatsapp_number?: string;
    product_main_category?: string;
    product_subcategory?: string;
    requested_brand?: string;
    business_address?: string;
    created_at?: string;
    business_description?: string;
    logo?: string;
    username?: string;
    verification_doc_type?: string;
    verification_document_url?: string;
    payment_receipt_url?: string;
    payment_required?: boolean;
    payment_amount?: number;
    payment_instructions?: string;
    payment_status?: string;
    review_due_at?: string;
    access_days?: number;
};

function VendorSection() {
    const { brand } = useBranding();
    const { notify } = useToast();
    const [requests, setRequests] = useState<VendorApplicationSummary[]>([]);
    const [vendors, setVendors] = useState<VendorAdminOverview[]>([]);
    const [applicationId, setApplicationId] = useState('');
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState('');
    const [approvalMainCategory, setApprovalMainCategory] = useState('');
    const [approvalSubcategory, setApprovalSubcategory] = useState('');
    const [approvalCustomSubcategory, setApprovalCustomSubcategory] = useState('');
    const [approvalBrand, setApprovalBrand] = useState('');
    const [adminWhatsApp, setAdminWhatsApp] = useState('');
    const [savingWhatsApp, setSavingWhatsApp] = useState(false);
    const [whatsAppMessage, setWhatsAppMessage] = useState('');
    const [onboardingSettings, setOnboardingSettings] = useState<VendorOnboardingSettings>(DEFAULT_VENDOR_ONBOARDING_SETTINGS);
    const [savingOnboardingSettings, setSavingOnboardingSettings] = useState(false);
    const [onboardingSettingsMessage, setOnboardingSettingsMessage] = useState('');
    const [approvalAccessDays, setApprovalAccessDays] = useState('');
    const [paymentAuthorized, setPaymentAuthorized] = useState(false);
    const [resendingRequestId, setResendingRequestId] = useState('');
    const [generatingSetupLinkRequestId, setGeneratingSetupLinkRequestId] = useState('');
    const [oneTimeSetupLink, setOneTimeSetupLink] = useState('');
    const [setupLinkWhatsappUrl, setSetupLinkWhatsappUrl] = useState('');
    const [applicationQuery, setApplicationQuery] = useState('');
    const [applicationPage, setApplicationPage] = useState(1);
    const [expandedApplicationId, setExpandedApplicationId] = useState('');
    const [vendorQuery, setVendorQuery] = useState('');
    const [vendorPage, setVendorPage] = useState(1);
    const [expandedVendorId, setExpandedVendorId] = useState('');
    const [revocationTarget, setRevocationTarget] = useState<{ vendorId: string; productId: string } | null>(null);
    const [revocationReason, setRevocationReason] = useState('');
    const [revoking, setRevoking] = useState(false);
    const reload = useCallback(() => Promise.all([getVendorRequestsAction(), getVendorsAction(), getAdminWhatsAppAction(), getVendorApplicationSettingsAction()]).then(([r, v, phone, settings]) => { setRequests(r); setVendors(v); setAdminWhatsApp(phone); setOnboardingSettings(settings); }), []);
    useEffect(() => {
        void reload().catch(error => console.error('Could not load vendor applications:', error));
        const interval = window.setInterval(() => {
            void reload().catch(error => console.error('Could not refresh vendor applications:', error));
        }, 15000);
        return () => window.clearInterval(interval);
    }, [reload]);
    const approvalSubcategories = getProductSubcategories(approvalMainCategory);
    const normalizedApprovalSubcategory = normalizeSelectedProductSubcategory(approvalSubcategory, approvalCustomSubcategory) ||
        (approvalSubcategory === 'Other' && !approvalCustomSubcategory.trim() ? 'Other' : '');
    const selectApplication = (request: VendorApplicationSummary) => {
        setOneTimeSetupLink('');
        setSetupLinkWhatsappUrl('');
        const requestedSubcategory = String(request.product_subcategory || 'Other');
        const custom = requestedSubcategory.startsWith(OTHER_SUBCATEGORY_PREFIX)
            ? requestedSubcategory.slice(OTHER_SUBCATEGORY_PREFIX.length)
            : '';
        setApplicationId(request.request_id);
        setApprovalMainCategory(String(request.product_main_category || 'Other Categories'));
        setApprovalSubcategory(custom ? 'Other' : requestedSubcategory);
        setApprovalCustomSubcategory(custom);
        setApprovalBrand(request.requested_brand || 'Unbranded');
        setApprovalAccessDays(String(onboardingSettings.default_access_days || ''));
        setPaymentAuthorized(request.payment_status === 'not_required');
        setMessage('');
    };
    const saveWhatsApp = async () => {
        setSavingWhatsApp(true); setWhatsAppMessage('');
        try {
            const result = await saveAdminWhatsAppAction(adminWhatsApp);
            if (!result.success) { setWhatsAppMessage(result.error || 'Could not save the WhatsApp number.'); return; }
            setAdminWhatsApp(result.phone || '');
            setWhatsAppMessage(result.phone ? 'Admin WhatsApp number saved. New vendor applications will open a pre-filled WhatsApp message to this number.' : 'Admin WhatsApp number cleared. Applications will still be saved for review.');
        } finally { setSavingWhatsApp(false); }
    };
    const saveOnboarding = async () => {
        setSavingOnboardingSettings(true);
        setOnboardingSettingsMessage('');
        try {
            const result = await saveVendorApplicationSettingsAction(onboardingSettings);
            if (!result.success) {
                setOnboardingSettingsMessage(result.error || 'Could not save vendor application settings.');
                return;
            }
            setOnboardingSettings(result.settings || onboardingSettings);
            setOnboardingSettingsMessage('Vendor payment and access settings saved.');
        } catch (error) {
            setOnboardingSettingsMessage(error instanceof Error ? error.message : 'Could not save vendor application settings.');
        } finally {
            setSavingOnboardingSettings(false);
        }
    };
    const decide = async (action: 'approve' | 'reject') => {
        setWorking(true);
        setMessage('');
        try {
            const id = applicationId.trim();
            if (action === 'approve' && (!normalizedApprovalSubcategory || !isValidProductCategoryPair(approvalMainCategory, normalizedApprovalSubcategory))) {
                setMessage('Choose a valid approved main category and subcategory.');
                return;
            }
            const result = action === 'approve'
                ? await approveVendorRequestAction(id, approvalMainCategory, normalizedApprovalSubcategory || undefined, Number(approvalAccessDays), paymentAuthorized, approvalBrand)
                : await rejectVendorRequestAction(id);
            if (!result.success) {
                setMessage(result.error || 'Unable to process this application.');
                return;
            }
            const approvedVendorId = 'vendor' in result &&
                typeof result.vendor === 'object' &&
                result.vendor !== null &&
                'vendor_id' in result.vendor &&
                typeof result.vendor.vendor_id === 'string'
                ? result.vendor.vendor_id
                : 'created';
            setMessage(action === 'approve' ? `Application approved. Vendor ID: ${approvedVendorId}` : 'Application rejected.');
            setApplicationId('');
            setApprovalMainCategory('');
            setApprovalSubcategory('');
            setApprovalCustomSubcategory('');
            setApprovalBrand('');
            await reload();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to process this application.');
        } finally {
            setWorking(false);
        }
    };
    const resendSetupEmail = async (request: VendorApplicationSummary) => {
        setResendingRequestId(request.request_id);
        try {
            const result = await resendVendorSetupEmailAction(request.request_id);
            if (!result.success) {
                notify('error', result.error || 'Could not resend the setup email.', 'Setup email');
                return;
            }
            notify('success', `A new seller setup link was sent to ${request.email}.`, 'Setup email sent');
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not resend the setup email.', 'Setup email');
        } finally {
            setResendingRequestId('');
        }
    };
    const generateWhatsAppSetupLink = async (request: VendorApplicationSummary) => {
        setGeneratingSetupLinkRequestId(request.request_id);
        setOneTimeSetupLink('');
        setSetupLinkWhatsappUrl('');
        try {
            const result = await generateVendorWhatsAppSetupLinkAction(request.request_id);
            if (!result.success) {
                notify('error', result.error || 'Could not generate a one-time setup link.', 'Setup link');
                return;
            }
            setOneTimeSetupLink(result.setupLink);
            const phone = String(request.whatsapp_number || '').replace(/\D/g, '');
            if (phone.length >= 10) {
                const message = [
                    `Hello ${request.owner_name || request.username || 'there'},`,
                    `The admin has authorized a one-time account setup link for your ${brand.companyName} vendor application (${request.request_id}).`,
                    'Open this secure link to set your account password. It can only be used once:',
                    result.setupLink,
                    'Please do not forward this link.',
                ].join('\n\n');
                setSetupLinkWhatsappUrl(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
            }
            notify('success', 'One-time link generated. Share it privately with the applicant.', 'Setup link ready');
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not generate a one-time setup link.', 'Setup link');
        } finally {
            setGeneratingSetupLinkRequestId('');
        }
    };
    const copyOneTimeSetupLink = async () => {
        try {
            await navigator.clipboard.writeText(oneTimeSetupLink);
            notify('success', 'The one-time setup link was copied.', 'Link copied');
        } catch {
            notify('error', 'Clipboard access is unavailable. Select and copy the link from the field.', 'Could not copy link');
        }
    };
    const revokeProduct = async (vendor: VendorAdminOverview, productId: string) => {
        if (!revocationReason.trim()) {
            notify('error', 'Add a reason before revoking this product.', 'Reason required');
            return;
        }
        setRevoking(true);
        try {
            const result = await revokeVendorProductAction(productId, revocationReason);
            if (!result.success) throw new Error(result.error || 'Could not revoke this product.');
            notify('success', `${vendor.business_name} was notified and the product was removed.`, 'Product revoked');
            setRevocationTarget(null);
            setRevocationReason('');
            await reload();
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not revoke this product.', 'Revocation failed');
        } finally {
            setRevoking(false);
        }
    };
    const pending = requests.filter(r => r.status === 'pending');
    const normalizedApplicationQuery = applicationQuery.trim().toLowerCase();
    const filteredPending = pending.filter(request => [request.request_id, request.business_name, request.owner_name, request.email, request.whatsapp_number]
        .some(value => String(value || '').toLowerCase().includes(normalizedApplicationQuery)));
    const applicationPageCount = Math.max(1, Math.ceil(filteredPending.length / VENDOR_LIST_PAGE_SIZE));
    const currentApplicationPage = Math.min(applicationPage, applicationPageCount);
    const visiblePending = filteredPending.slice((currentApplicationPage - 1) * VENDOR_LIST_PAGE_SIZE, currentApplicationPage * VENDOR_LIST_PAGE_SIZE);
    const normalizedVendorQuery = vendorQuery.trim().toLowerCase();
    const filteredVendors = vendors.filter(vendor => [vendor.vendor_id, vendor.business_name, vendor.username, vendor.email, vendor.status]
        .some(value => String(value || '').toLowerCase().includes(normalizedVendorQuery)));
    const vendorPageCount = Math.max(1, Math.ceil(filteredVendors.length / VENDOR_LIST_PAGE_SIZE));
    const currentVendorPage = Math.min(vendorPage, vendorPageCount);
    const visibleVendors = filteredVendors.slice((currentVendorPage - 1) * VENDOR_LIST_PAGE_SIZE, currentVendorPage * VENDOR_LIST_PAGE_SIZE);
    const selectedApplication = requests.find(request => request.request_id.toUpperCase() === applicationId.trim().toUpperCase());
    return <div className="space-y-4">
    <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Vendor verification WhatsApp</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Set the official {brand.companyName} admin WhatsApp number. After registration, vendors will be offered a pre-filled message containing their application details so you can verify them before approving or rejecting the application.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${adminWhatsApp ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{adminWhatsApp ? 'Configured' : 'Not configured'}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-sm font-semibold text-slate-700">Admin WhatsApp number (include country code)<input value={adminWhatsApp} onChange={e => setAdminWhatsApp(e.target.value)} placeholder="2348012345678" inputMode="tel" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"/><span className="mt-1 block text-xs font-normal text-slate-400">Digits only is recommended. Example for Nigeria: 2348012345678.</span></label><button type="button" disabled={savingWhatsApp} onClick={saveWhatsApp} className="self-end rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{savingWhatsApp ? 'Saving…' : 'Save WhatsApp'}</button></div>
      {whatsAppMessage && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{whatsAppMessage}</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-black">Vendor payment and trial access</h2>
      <p className="mt-1 text-sm text-slate-500">To collect the ₦1,000 base monthly subscription at registration, enable payment, set the amount to ₦1,000, enter the transfer details, and use 30 access days. You can still verify each receipt and assign access days during approval.</p>
      <label className="mt-4 flex items-center gap-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={onboardingSettings.payment_enabled} onChange={event => setOnboardingSettings(current => ({ ...current, payment_enabled: event.target.checked }))}/>Require payment receipt with new applications</label>
      {onboardingSettings.payment_enabled && <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Application payment (₦)<input type="number" min="1" step="1" value={onboardingSettings.payment_amount || ''} onChange={event => setOnboardingSettings(current => ({ ...current, payment_amount: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3"/></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Payment destination and instructions<textarea rows={3} maxLength={2000} value={onboardingSettings.payment_instructions} onChange={event => setOnboardingSettings(current => ({ ...current, payment_instructions: event.target.value }))} placeholder="Bank/payment details and reference instructions" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3"/></label>
      </div>}
      <label className="mt-4 block max-w-xs text-sm font-semibold text-slate-700">Default access days (optional)<input type="number" min="0" max="3650" step="1" value={onboardingSettings.default_access_days || ''} onChange={event => setOnboardingSettings(current => ({ ...current, default_access_days: Number(event.target.value) || 0 }))} placeholder="Set per applicant if blank" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3"/></label>
      <button type="button" disabled={savingOnboardingSettings} onClick={() => void saveOnboarding()} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingOnboardingSettings ? 'Saving…' : 'Save payment settings'}</button>
      {onboardingSettingsMessage && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{onboardingSettingsMessage}</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Vendor applications</h2><p className="mt-1 text-sm text-slate-500">Review the saved application details, then approve or reject each applicant.</p></div><Link href="/vendor/register" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Registration page</Link></div>
      <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4">
        <label className="block text-sm font-bold text-slate-800">Vendor application / registration ID<input value={applicationId} onChange={e => { setApplicationId(e.target.value.toUpperCase()); setApprovalMainCategory(''); setApprovalSubcategory(''); setApprovalCustomSubcategory(''); }} placeholder="e.g. VREQ0001" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-violet-500"/></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-800">Approved first-product main category
            <select required value={approvalMainCategory} onChange={event => { setApprovalMainCategory(event.target.value); setApprovalSubcategory(''); setApprovalCustomSubcategory(''); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
              <option value="" disabled>Select a main category</option>
              {PRODUCT_MAIN_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-800">Approved first-product subcategory
            <select required value={approvalSubcategory} onChange={event => { setApprovalSubcategory(event.target.value); setApprovalCustomSubcategory(''); }} disabled={!approvalMainCategory} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 disabled:cursor-not-allowed disabled:opacity-60">
              <option value="" disabled>Select a subcategory</option>
              {approvalSubcategories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {approvalSubcategory === 'Other' && <label className="text-sm font-bold text-slate-800 sm:col-span-2">Specify the approved subcategory
            <input required maxLength={100} value={approvalCustomSubcategory} onChange={event => setApprovalCustomSubcategory(event.target.value)} placeholder="For example, handmade baskets" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/>
          </label>}
        </div>
        <p className="mt-2 text-xs text-slate-600">This category pair becomes the vendor’s initial product permission. You can adjust it before approval.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={working || !applicationId.trim()} onClick={() => decide('approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{working ? 'Processing…' : 'Approve application'}</button><button disabled={working || !applicationId.trim()} onClick={() => decide('reject')} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-600 disabled:opacity-50">Reject application</button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-800">Access days (trial or paid period)
            <input required type="number" min="1" max="3650" step="1" value={approvalAccessDays} onChange={event => setApprovalAccessDays(event.target.value)} placeholder="Enter number of days" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/>
          </label>
          <label className="text-sm font-bold text-slate-800">Base plan brand
            <input required maxLength={80} value={approvalBrand} onChange={event => setApprovalBrand(event.target.value)} placeholder="Brand name or Unbranded" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/>
          </label>
          {selectedApplication?.payment_required && <label className="flex items-center gap-3 self-end rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
            <input type="checkbox" checked={paymentAuthorized} onChange={event => setPaymentAuthorized(event.target.checked)}/>
            Receipt/payment verified and authorized
          </label>}
        </div>
        {selectedApplication?.payment_required && <p className="mt-3 text-sm text-slate-600">Application payment: ₦{Number(selectedApplication.payment_amount || 0).toLocaleString()} · {selectedApplication.payment_instructions}</p>}
        {selectedApplication && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-bold">Applicant: {selectedApplication.username || 'No username'} · Verification: {selectedApplication.verification_doc_type || 'Not provided'}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            {selectedApplication.verification_document_url && <a href={selectedApplication.verification_document_url} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700">View CAC / NIN document ↗</a>}
            {selectedApplication.payment_receipt_url && <a href={selectedApplication.payment_receipt_url} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700">View payment receipt ↗</a>}
          </div>
          <button type="button" disabled={resendingRequestId === selectedApplication.request_id} onClick={() => void resendSetupEmail(selectedApplication)} className="mt-3 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">{resendingRequestId === selectedApplication.request_id ? 'Sending…' : 'Resend setup email'}</button>
          <button type="button" disabled={generatingSetupLinkRequestId === selectedApplication.request_id} onClick={() => void generateWhatsAppSetupLink(selectedApplication)} className="ml-2 mt-3 rounded-lg border border-green-200 px-3 py-2 text-xs font-bold text-green-800 hover:bg-green-50 disabled:opacity-50">{generatingSetupLinkRequestId === selectedApplication.request_id ? 'Generating…' : 'Generate one-time WhatsApp setup link'}</button>
          <p className="mt-2 text-xs text-slate-500">Use this admin-authorized alternative if email delivery is blocked. The vendor can set a password while the application is pending; dashboard access remains unavailable until you approve them.</p>
          {oneTimeSetupLink && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="font-bold text-amber-950">One-time account setup link</p>
            <p className="mt-1 text-xs leading-5 text-amber-900">Share this privately with the applicant. It expires in 30 minutes and is consumed only when they submit the password form, so WhatsApp link previews won’t use it. Generating another link invalidates this one.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input aria-label="One-time vendor setup link" readOnly value={oneTimeSetupLink} className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs"/>
              <button type="button" onClick={() => void copyOneTimeSetupLink()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Copy link</button>
              {setupLinkWhatsappUrl && <a href={setupLinkWhatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white">Open vendor WhatsApp</a>}
            </div>
            {!setupLinkWhatsappUrl && <p className="mt-2 text-xs text-amber-900">No valid WhatsApp number was saved, so copy the link and send it through a verified private channel.</p>}
          </div>}
          {selectedApplication.review_due_at && <p className="mt-2 text-xs text-slate-500">Review target: {new Date(selectedApplication.review_due_at).toLocaleString()}</p>}
        </div>}
        {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <label className="w-full max-w-md text-sm font-semibold text-slate-700">Search applications
            <input value={applicationQuery} onChange={event => { setApplicationQuery(event.target.value); setApplicationPage(1); }} placeholder="Business, owner, email, phone, or application ID" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/>
          </label>
          <p className="text-sm text-slate-500">{filteredPending.length} pending application{filteredPending.length === 1 ? '' : 's'}</p>
        </div>
        <div className="divide-y divide-slate-100">
          {visiblePending.map(request => {
            const expanded = expandedApplicationId === request.request_id;
            return <article key={request.request_id} className="py-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate font-bold text-slate-900">{request.business_name || 'Unnamed business'}</p><p className="truncate text-xs text-slate-500">{request.owner_name || 'No owner name'} · {request.email || 'No email'}</p></div>
                <div className="text-xs text-slate-500"><p className="font-mono font-semibold text-slate-700">{request.request_id}</p><p>Submitted {request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</p></div>
                <div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" onClick={() => setExpandedApplicationId(expanded ? '' : request.request_id)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:border-violet-400">{expanded ? 'Hide details' : 'View details'}</button><button type="button" onClick={() => selectApplication(request)} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50">Review</button></div>
              </div>
              {expanded && <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2"><p><span className="font-semibold">Phone:</span> {request.whatsapp_number || '—'}</p><p><span className="font-semibold">Category:</span> {request.product_main_category || 'Other Categories'} / {request.product_subcategory || 'Other'}</p><p className="sm:col-span-2"><span className="font-semibold">Address:</span> {request.business_address || '—'}</p><p className="sm:col-span-2"><span className="font-semibold">Description:</span> {request.business_description || '—'}</p></div>}
            </article>;
          })}
          {!visiblePending.length && <p className="py-8 text-center text-sm text-slate-500">No pending vendor applications match this search.</p>}
        </div>
        {filteredPending.length > VENDOR_LIST_PAGE_SIZE && <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Page {currentApplicationPage} of {applicationPageCount}</p><div className="flex gap-2"><button type="button" disabled={currentApplicationPage === 1} onClick={() => setApplicationPage(currentApplicationPage - 1)} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Previous</button><button type="button" disabled={currentApplicationPage === applicationPageCount} onClick={() => setApplicationPage(currentApplicationPage + 1)} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button></div></div>}
      </div>
    </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><h2 className="text-xl font-black">Approved vendors</h2><p className="mt-1 text-sm text-slate-500">Expand a vendor only when you need its access or product audit details.</p></div><p className="text-sm text-slate-500">{filteredVendors.length} vendor{filteredVendors.length === 1 ? '' : 's'}</p></div>
        <label className="mt-4 block max-w-md text-sm font-semibold text-slate-700">Search vendors
          <input value={vendorQuery} onChange={event => { setVendorQuery(event.target.value); setVendorPage(1); }} placeholder="Business, username, email, vendor ID, or status" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/>
        </label>
        <div className="mt-3 divide-y divide-slate-100">
          {visibleVendors.map(vendor => {
            const expanded = expandedVendorId === vendor.vendor_id;
            return <article key={vendor.vendor_id} className="py-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate font-bold text-slate-900">{vendor.business_name}</p><p className="truncate text-xs text-slate-500">{vendor.vendor_id} · {vendor.email}</p></div>
                <div className="flex items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-bold ${vendor.status === 'active' || vendor.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : vendor.status === 'expired' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{vendor.status}</span><span className="text-slate-500">{vendor.products.length} product{vendor.products.length === 1 ? '' : 's'}</span></div>
                <div className="flex flex-wrap gap-2 sm:justify-end"><button type="button" onClick={() => setExpandedVendorId(expanded ? '' : vendor.vendor_id)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:border-violet-400">{expanded ? 'Hide details' : 'View details'}</button><button type="button" onClick={async () => { const next = vendor.status === 'suspended' ? 'active' : 'suspended'; const result = await updateVendorStatusAction(vendor.vendor_id, next); if (result.success) await reload(); else notify('error', result.error || 'Could not update vendor status.', 'Vendor update failed'); }} className="rounded-lg border px-3 py-2 text-xs font-bold">{vendor.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button></div>
              </div>
              {expanded && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-violet-900">Approved category: {vendor.approved_main_category || 'Not set'} / {vendor.approved_subcategory || 'Not set'}</p><button type="button" onClick={async () => { if (!window.confirm(`Permanently delete ${vendor.business_name} and its vendor account? Their products will also be removed; existing orders stay for records.`)) return; const result = await deleteVendorAction(vendor.vendor_id); if (!result.success) { notify('error', result.error || 'Could not delete vendor.', 'Vendor deletion failed'); return; } notify('success', `${vendor.business_name} and its vendor account were deleted.`, 'Vendor deleted'); await reload(); }} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">Delete vendor</button></div>
                {vendor.access_expires_at && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{vendor.status === 'expired' ? 'Access expired' : 'Access expires'} · {new Date(vendor.access_expires_at).toLocaleString()}</span><button type="button" onClick={async () => { const value = window.prompt('How many access days should be added?', '30'); if (value === null) return; const result = await extendVendorAccessAction(vendor.vendor_id, Number(value)); if (!result.success) { notify('error', result.error || 'Could not extend vendor access.', 'Access update failed'); return; } notify('success', `Added ${value} access days for ${vendor.business_name}.`, 'Access extended'); await reload(); }} className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-800">Add access days</button></div>}
                <div className="mt-3 space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Published product category audit ({vendor.products.length})</p>{vendor.products.map(product => { const revocationOpen = revocationTarget?.vendorId === vendor.vendor_id && revocationTarget.productId === product.id; const permissionLabel = product.permission_status === 'initial' ? 'Initial category match' : product.permission_status === 'approved-request' ? `Approved request${product.permission_request_id ? ` ${product.permission_request_id}` : ''}` : 'No matching approval'; return <div key={product.id} className="rounded-lg border border-slate-100 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{product.title}</p><p className="mt-1 text-xs text-slate-600">{product.category} / {product.subcategory || 'No subcategory'}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${product.permission_status === 'unmatched' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{permissionLabel}</span><button type="button" onClick={() => { setRevocationTarget(revocationOpen ? null : { vendorId: vendor.vendor_id, productId: product.id }); setRevocationReason(''); }} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Revoke / remove</button></div></div>{revocationOpen && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3"><p className="text-xs text-slate-600">This removes the listing and records the reason in the vendor’s product-access history.</p><textarea required maxLength={2000} rows={2} value={revocationReason} onChange={event => setRevocationReason(event.target.value)} placeholder="Reason for revoking this product" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/><div className="flex gap-2"><button type="button" disabled={revoking} onClick={() => void revokeProduct(vendor, product.id)} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{revoking ? 'Revoking…' : 'Confirm revocation'}</button><button type="button" disabled={revoking} onClick={() => setRevocationTarget(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button></div></div>}</div>; })}{!vendor.products.length && <p className="text-sm text-slate-500">No products published yet.</p>}</div>
              </div>}
            </article>;
          })}
          {!visibleVendors.length && <p className="py-8 text-center text-sm text-slate-500">No vendors match this search.</p>}
        </div>
        {filteredVendors.length > VENDOR_LIST_PAGE_SIZE && <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Page {currentVendorPage} of {vendorPageCount}</p><div className="flex gap-2"><button type="button" disabled={currentVendorPage === 1} onClick={() => setVendorPage(currentVendorPage - 1)} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Previous</button><button type="button" disabled={currentVendorPage === vendorPageCount} onClick={() => setVendorPage(currentVendorPage + 1)} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button></div></div>}
      </div>
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



