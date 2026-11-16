import { notFound } from 'next/navigation';
import { readJson } from '../../../lib/json-store';
import { Product } from '../../(public)/components/types/store';
import ProductCard from '../../(public)/components/ProductCard';
import { getBrandSettings } from '../../../lib/branding';
export default async function VendorStorefront({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; const [vendors, products, brand] = await Promise.all([readJson<any[]>('vendors.json', []), readJson<Product[]>('products.json', []), getBrandSettings()]); const vendor = vendors.find(v => v.vendor_id === id && ['approved', 'active'].includes(v.status)); if (!vendor)
    notFound(); const own = products.filter(p => p.vendor_id === id && p.is_available); return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><div className="rounded-3xl bg-slate-950 p-7 text-white sm:p-10">{brand.logo && <img src={brand.logo} alt="" className="mb-3 h-12 max-w-40 rounded bg-white object-contain p-1"/>}<p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">{brand.companyName} seller</p><h1 className="mt-2 text-3xl font-black">{vendor.business_name}</h1><p className="mt-2 max-w-2xl text-slate-300">{vendor.business_description || `Discover products from this ${brand.companyName} seller.`}</p></div><section className="mt-10"><h2 className="text-2xl font-black">Products</h2>{own.length ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{own.map(p => <ProductCard key={p.id} product={{ ...p, vendor_business_name: vendor.business_name }}/>)}</div> : <p className="mt-5 rounded-2xl border border-dashed p-10 text-center text-slate-500">No active products yet.</p>}</section></main>; }
