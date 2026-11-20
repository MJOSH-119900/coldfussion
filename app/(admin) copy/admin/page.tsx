'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Product } from '../../(public)/components/types/store';
import ProductForm from './components/ProductForm';
import { deleteProductAction, getProductsAction } from './actions';

const SESSION = { role: 'admin' as const, vendor_id: 'vendor_alpha' };
const nav = ['Overview', 'Products', 'Giveaways'];

export default function DashboardPortal() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [section, setSection] = useState('Products');
  const [isPending, startTransition] = useTransition();
  useEffect(() => { void getProductsAction().then(setAllProducts); }, []);
  const filteredProducts = useMemo(() => SESSION.role === 'admin' ? allProducts : allProducts.filter(p => p.vendor_id === SESSION.vendor_id), [allProducts]);

  const refresh = (savedProduct: Product) => {
    setAllProducts(current => {
      const exists = current.some(p => p.id === savedProduct.id);
      return exists ? current.map(p => p.id === savedProduct.id ? savedProduct : p) : [...current, savedProduct];
    });
    setEditingProduct(undefined);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this product? This removes it from the storefront.')) return;
    startTransition(async () => {
      const result = await deleteProductAction(id);
      if (!result.success) { alert('Delete failed'); return; }
      setAllProducts(prev => prev.filter(p => p.id !== id));
      if (editingProduct?.id === id) setEditingProduct(undefined);
    });
  };

  const giveawayCount = filteredProducts.filter(p => p.giveaway).length;
  const totalAvailable = filteredProducts.reduce((sum, p) => sum + (p.available_quantity || 0), 0);

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-5 text-white md:flex md:flex-col">
        <div className="mb-8"><p className="text-2xl font-black">fussion<span className="text-violet-400">.</span></p><p className="mt-1 text-xs text-slate-400">Admin control panel</p></div>
        <nav className="space-y-1">{nav.map(item => <button key={item} onClick={() => setSection(item)} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ${section === item ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>{item}</button>)}</nav>
        <Link href="/" className="mt-auto rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 hover:bg-slate-800">View storefront</Link>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Admin</p><h1 className="mt-1 text-3xl font-black">{section}</h1><p className="mt-1 text-sm text-slate-500">Manage products and storefront announcements. No private account data is displayed here.</p></div><Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-slate-200">Storefront ↗</Link></header>

        {section === 'Overview' && <div className="grid gap-4 sm:grid-cols-3"><Stat title="Products" value={filteredProducts.length}/><Stat title="Available units" value={totalAvailable}/><Stat title="Giveaways" value={giveawayCount}/></div>}

        {section === 'Giveaways' && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-black text-emerald-900">Giveaway announcements</h2><p className="mt-1 text-sm text-emerald-800">Toggle a product's giveaway flag from the product editor. The announcement is then shown on the storefront and product page.</p><div className="mt-4 grid gap-3">{filteredProducts.filter(p => p.giveaway).map(p => <div key={p.id} className="rounded-xl bg-white p-4 ring-1 ring-emerald-200"><p className="font-bold">{p.title}</p><p className="mt-1 text-sm text-slate-600">{p.giveaway_announcement || 'Giveaway item announced.'}</p></div>)}{!giveawayCount && <p className="text-sm text-emerald-700">No giveaway items announced yet.</p>}</div></div>}

        {section === 'Products' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">Products ({filteredProducts.length})</h2><p className="text-xs text-slate-500">Create, edit or delete storefront products.</p></div><button onClick={() => setEditingProduct(undefined)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">+ New product</button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-400"><th className="px-3 py-3">Product</th><th className="px-3 py-3">Availability</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Flags</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>{filteredProducts.map(p => <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-4"><div className="flex items-center gap-3"><img src={p.images?.[0]} alt="" className="h-11 w-11 rounded-lg object-cover"/><div><p className="font-bold">{p.title}</p><p className="text-xs text-slate-400">{p.category}</p></div></div></td><td className="px-3 py-4"><span className={p.is_available ? 'text-emerald-600' : 'text-red-600'}>{p.is_available ? `${p.available_quantity || 0} available` : 'Unavailable'}</span></td><td className="px-3 py-4"><span className="font-black">₦{p.price.toLocaleString()}</span>{p.compare_at_price && <span className="ml-2 text-xs text-slate-400 line-through">₦{p.compare_at_price.toLocaleString()}</span>}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-1">{p.giveaway && <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Giveaway</span>}{p.is_latest && <span className="rounded bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">Latest</span>}{p.is_top_selling && <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Top seller</span>}</div></td><td className="px-3 py-4"><div className="flex justify-end gap-2"><button onClick={() => setEditingProduct(p)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:border-violet-400">Edit</button><button disabled={isPending} onClick={() => handleDelete(p.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">Delete</button></div></td></tr>)}</tbody></table></div>
          </section>
          <ProductForm currentVendorId={SESSION.vendor_id} editProduct={editingProduct} onSuccess={refresh}/>
        </div>}
      </main>
    </div>
  </div>;
}

function Stat({ title, value }: { title: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-black">{value.toLocaleString()}</p></div>; }
