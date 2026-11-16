'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getVendorOrdersAction,
  getVendorProfileAction,
  getVendorStatsAction,
  updateOrderStatus,
  updateVendorWhatsAppAction,
} from '../../../lib/marketplace';
import { getVendorProductsAction } from '../../(admin)/admin/actions';
import { Order, Product } from '../../(public)/components/types/store';
import ProductForm from '../../(admin)/admin/components/ProductForm';
import { useToast } from '../../components/ToastProvider';
import { logoutAction } from '../../actions/auth';
import { useBranding } from '../../(public)/components/BrandingProvider';
import AccountPasswordSecurity from '../../components/PasswordSecurity';
import UpgradeAnnouncement from '../../(public)/components/UpgradeAnnouncement';

const sections = [
  { id: 'Overview', label: 'Overview', icon: '▦' },
  { id: 'Products', label: 'My products', icon: '□' },
  { id: 'Giveaways', label: 'Giveaways', icon: '✦' },
  { id: 'Orders', label: 'Orders', icon: '⇄' },
  { id: 'Profile', label: 'Store profile', icon: '⚙' },
  { id: 'Security', label: 'Security', icon: '⌑' },
] as const;
const sectionGroups = [
  { label: 'Workspace', items: [sections[0], sections[1], sections[2], sections[3]] },
  { label: 'Store settings', items: [sections[4]] },
  { label: 'Account', items: [sections[5]] },
];
type Section = typeof sections[number]['id'];

export default function VendorDashboard({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const { brand } = useBranding();
  const [section, setSection] = useState<Section>('Overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product>();
  const [whatsapp, setWhatsapp] = useState('');
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [statsResult, ordersResult, productsResult, profile] = await Promise.all([
      getVendorStatsAction(), getVendorOrdersAction(), getVendorProductsAction(), getVendorProfileAction(),
    ]);
    setStats(statsResult);
    setOrders(ordersResult);
    setProducts(productsResult);
    setWhatsapp(profile?.whatsapp_number || '');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  async function logout() {
    await logoutAction();
    router.push('/vendor/login');
    router.refresh();
  }

  async function saveWhatsApp() {
    setSavingWhatsApp(true);
    const result = await updateVendorWhatsAppAction(whatsapp);
    setSavingWhatsApp(false);
    if (!result.success) {
      notify('error', result.error || 'Could not update WhatsApp number', 'Profile update');
      return;
    }
    notify('success', 'Your customer WhatsApp number has been updated.', 'Profile saved');
  }

  async function changeOrderStatus(orderId: string, status: Order['status'], successMessage: string, title: string) {
    const result = await updateOrderStatus(orderId, status);
    if (!result.success) {
      notify('error', result.error || 'Unable to update order', 'Order update');
      return;
    }
    notify('success', successMessage, title);
    await refresh();
  }

  const statCards = stats ? [
    ['Products', stats.products], ['Inventory', stats.inventory], ['Enquiries', stats.enquiries],
    ['Pending orders', stats.pending], ['Acknowledged / Processing', stats.confirmed],
    ['Completed sales', stats.sold], ['Revenue', `₦${Number(stats.revenue || 0).toLocaleString()}`],
  ] : [];
  const selectSection = (nextSection: Section) => {
    setSection(nextSection);
    setMobileMenuOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="flex h-screen min-h-0">
        <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 p-5 text-white md:flex">
          <div className="mb-8 shrink-0">
            <div className="flex items-center gap-2">{brand.logo && <img src={brand.logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain"/>}<p className="text-2xl font-black">{brand.companyName}<span className="text-violet-400">.</span></p></div>
            <p className="mt-1 text-xs text-slate-400">Vendor workspace</p>
          </div>
          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Vendor dashboard navigation">
            {sectionGroups.map(group => <div key={group.label}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{group.label}</p>
              <div className="space-y-1">{group.items.map(item => (
                <button key={item.id} onClick={() => selectSection(item.id)} aria-current={section === item.id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${section === item.id ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                  <span className="w-5 text-center text-base">{item.icon}</span>{item.label}
                </button>
              ))}</div>
            </div>)}
          </nav>
          <div className="mt-auto space-y-2">
            <Link href="/" className="block rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">View storefront</Link>
            <button type="button" onClick={logout} className="block w-full rounded-xl border border-red-900/60 px-4 py-3 text-center text-sm font-semibold text-red-300 hover:bg-red-950">Log out</button>
          </div>
        </aside>

        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto">
          <UpgradeAnnouncement />
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
            <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open vendor navigation" aria-expanded={mobileMenuOpen} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Vendor workspace</p>
                  <h1 className="mt-1 text-2xl font-black sm:text-3xl">{section}</h1>
                  <p className="mt-1 hidden text-sm text-slate-500 sm:block">Manage your listings, customer orders and store contact details.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/" className="hidden rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200 sm:inline-flex">Storefront ↗</Link>
                <button type="button" onClick={() => void refresh()} className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold shadow-sm sm:inline-flex">Refresh</button>
                <button type="button" onClick={logout} className="hidden rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 sm:inline-flex">Log out</button>
              </div>
            </div>
          </header>
          {mobileMenuOpen && <div className="fixed inset-0 z-50 bg-slate-950/50 md:hidden">
            <aside role="dialog" aria-modal="true" aria-label="Vendor navigation" className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col bg-slate-950 p-5 text-white shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2">{brand.logo && <img src={brand.logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain"/>}<p className="text-xl font-black">{brand.companyName}<span className="text-violet-400">.</span></p></div><p className="mt-1 text-xs text-slate-400">Vendor workspace</p></div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close vendor navigation" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18"/></svg>
                </button>
              </div>
              <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Vendor dashboard navigation">
                {sectionGroups.map(group => <div key={group.label}>
                  <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">{group.label}</p>
                  <div className="space-y-1">{group.items.map(item => (
                    <button key={item.id} onClick={() => selectSection(item.id)} aria-current={section === item.id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${section === item.id ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                      <span className="w-5 text-center text-base">{item.icon}</span>{item.label}
                    </button>
                  ))}</div>
                </div>)}
              </nav>
              <div className="mt-auto space-y-2 border-t border-slate-800 pt-4">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">View storefront</Link>
                <button type="button" onClick={() => { setMobileMenuOpen(false); void refresh(); }} className="block w-full rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">Refresh dashboard</button>
                <button type="button" onClick={logout} className="block w-full rounded-xl border border-red-900/60 px-4 py-3 text-center text-sm font-semibold text-red-300 hover:bg-red-950">Log out</button>
              </div>
            </aside>
            <button type="button" aria-label="Close vendor navigation" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 z-0 cursor-default"/>
          </div>}

          <div className="p-4 sm:p-8">
            {section === 'Overview' && <>
              <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700">Photo tip</p>
                  <h2 className="mt-1 text-lg font-black text-slate-950">Great photos help products get noticed</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Post clear, well-lit pictures of the actual item. A clean background and a few useful angles help customers feel confident and can attract more buyers.</p>
                </div>
                <button type="button" onClick={() => { setSection('Products'); setEditing(undefined); }} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Add product photos</button>
              </section>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}
              </div>
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Recent products</h2><p className="mt-1 text-sm text-slate-500">Your current storefront listings</p></div><button onClick={() => setSection('Products')} className="text-sm font-bold text-violet-700">Manage products →</button></div>
                  <div className="mt-4 space-y-3">{products.slice(0, 5).map(product => <div key={product.id} className="flex items-center gap-3"><img src={product.images?.[0]} alt="" className="h-12 w-12 rounded-lg object-cover"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{product.title}</p><p className="text-xs text-slate-500">♥ {product.likes_count || 0} likes · {product.available_quantity ?? 0} in stock</p></div><span className="text-xs font-bold">₦{product.price.toLocaleString()}</span></div>)}{!products.length && <p className="py-6 text-center text-sm text-slate-500">No products published yet.</p>}</div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Recent orders</h2><p className="mt-1 text-sm text-slate-500">Track buyer requests and sales</p></div><button onClick={() => setSection('Orders')} className="text-sm font-bold text-violet-700">View orders →</button></div>
                  <div className="mt-4 space-y-3">{orders.slice(0, 5).map(order => <div key={order.order_id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{order.order_id}</p><p className="text-xs text-slate-500">{order.customer_name || 'Customer'} · {new Date(order.created_at).toLocaleDateString()}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{order.status}</span></div>)}{!orders.length && <p className="py-6 text-center text-sm text-slate-500">No marketplace orders yet.</p>}</div>
                </section>
              </div>
            </>}

            {section === 'Giveaways' && <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div><h2 className="text-xl font-black text-emerald-900">My giveaway announcements</h2><p className="mt-1 text-sm text-slate-500">Shoppers see these as clickable storefront announcements and in a limited-time giveaway pop-up.</p></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{products.filter(product => product.giveaway).map(product => <article key={product.id} className="overflow-hidden rounded-xl border border-emerald-100">
                {product.images?.[0] && <img src={product.images[0]} alt="" className="h-40 w-full object-cover"/>}
                <div className="p-4"><p className="font-black">{product.title}</p><p className="mt-1 text-sm text-slate-600">{product.giveaway_announcement || `${product.title} is currently featured as a giveaway.`}</p><div className="mt-3 flex gap-2"><Link href={`/product/${product.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-violet-400">View product</Link><button type="button" onClick={() => { setSection('Products'); setEditing(product); }} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">Edit</button></div></div>
              </article>)}{!products.some(product => product.giveaway) && <p className="py-8 text-center text-sm text-slate-500 md:col-span-2">No giveaways yet. Mark one of your products as a giveaway from My products.</p>}</div>
            </section>}

            {section === 'Products' && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">My products ({products.length})</h2><p className="mt-1 text-sm text-slate-500">Published products appear in the admin product catalogue.</p></div><button onClick={() => setEditing(undefined)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">+ Add product</button></div>
                <div className="mt-4 space-y-2">{products.map(product => <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><img src={product.images?.[0]} className="h-12 w-12 rounded-lg object-cover" alt=""/><div className="min-w-0"><p className="truncate font-bold">{product.title}</p><p className="text-xs text-slate-500">{product.category} · ♥ {product.likes_count || 0} likes · {product.condition === 'spare-part' ? 'Spare part' : product.condition || 'New'} · {product.location || 'Location not set'} · ₦{product.size_prices?.length ? `From ${Math.min(...product.size_prices.map(v => v.price)).toLocaleString()}` : product.price.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Stock: {product.available_quantity ?? 0} · {product.is_available === false ? 'Unavailable' : 'Available'}</p></div></div><button onClick={() => setEditing(product)} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold hover:border-violet-400">Edit</button></div>)}{!products.length && <p className="py-8 text-center text-sm text-slate-500">No products yet. Use Add product to publish your first listing.</p>}</div>
              </section>
              <div className="min-w-0 xl:sticky xl:top-28 xl:self-start"><ProductForm key={editing?.id || 'new-product'} currentVendorId={vendorId} editProduct={editing} products={products} onSuccess={async () => { setEditing(undefined); await refresh(); }} onCancel={() => setEditing(undefined)}/></div>
            </div>}

            {section === 'Orders' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Orders</h2><p className="mt-1 text-sm text-slate-500">WhatsApp handoffs and order progress</p></div><span className="text-sm text-slate-500">{orders.length} order(s)</span></div><div className="mt-4 space-y-3">{orders.map(order => <div key={order.order_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{order.order_id}</p><p className="text-xs text-slate-500">Checkout: {order.checkout_id || '—'} · {new Date(order.created_at).toLocaleString()} · {order.customer_name || 'Customer'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{order.status}</span></div><div className="mt-3 space-y-1 text-sm">{order.items.map((item, index) => <p key={`${item.product_id}-${index}`}>{item.product_name}{item.selected_size ? ` (${item.selected_size})` : ''} × {item.quantity} — ₦{item.subtotal.toLocaleString()}</p>)}</div><p className="mt-2 font-black">₦{order.total.toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2">{order.status === 'Pending' && <button onClick={() => changeOrderStatus(order.order_id, 'Acknowledged', 'You acknowledged this order.', 'Order acknowledged')} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white">Acknowledge order</button>}{order.status === 'Acknowledged' && <button onClick={() => changeOrderStatus(order.order_id, 'Processing', 'Order moved to processing.', 'Order updated')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Start processing</button>}{order.status === 'Processing' && <button onClick={() => changeOrderStatus(order.order_id, 'Completing', 'Completed sale recorded and inventory deducted.', 'Sale completed')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Confirm completed sale</button>}{['Pending', 'Acknowledged', 'Processing'].includes(order.status) && <><button onClick={() => changeOrderStatus(order.order_id, 'Rejected', 'Order rejected.', 'Order updated')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Reject</button><button onClick={() => changeOrderStatus(order.order_id, 'Cancelled', 'Order cancelled.', 'Order updated')} className="rounded-lg border px-3 py-2 text-xs font-bold">Cancel</button></>}</div></div>)}{!orders.length && <p className="py-10 text-center text-sm text-slate-500">No marketplace orders yet.</p>}</div></section>}

            {section === 'Profile' && <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Store contact details</h2><p className="mt-1 text-sm text-slate-500">Customers use this WhatsApp number to contact you about products, availability and payment.</p><label className="mt-5 block text-sm font-bold text-slate-700">Customer WhatsApp number<input value={whatsapp} onChange={event => setWhatsapp(event.target.value)} inputMode="tel" placeholder="2348012345678" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"/></label><p className="mt-2 text-xs text-slate-500">Include your country code, e.g. 2348012345678.</p><button disabled={savingWhatsApp} onClick={saveWhatsApp} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingWhatsApp ? 'Saving…' : 'Save WhatsApp number'}</button></section>}
            {section === 'Security' && <AccountPasswordSecurity role="vendor" />}
            {loading && <p className="mt-6 text-center text-sm text-slate-500">Loading your vendor workspace…</p>}
          </div>
        </main>
      </div>
    </div>
  );
}
