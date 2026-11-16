import { Suspense } from 'react';
import Storefront from './components/Storefront';
import { readJson } from '../../lib/json-store';
import { Product } from './components/types/store';
import { getBannerSettings } from '../../lib/banners';
import { getBrandSettings } from '../../lib/branding';
import { getOwnerAbout } from '../../lib/about';
export default function PublicStorefront() { return <Suspense fallback={<main className="min-h-screen p-8 text-center"><p className="font-semibold">Loading storefront...</p></main>}><StorefrontContent /></Suspense>; }
async function StorefrontContent() {
    const [products, orders, analytics, vendors, bannerSettings, brand, ownerAbout] = await Promise.all([
        readJson<Product[]>('products.json', []),
        readJson<any[]>('orders.json', []),
        readJson<any[]>('analytics.json', []),
        readJson<any[]>('vendors.json', []),
        getBannerSettings(),
        getBrandSettings(),
        getOwnerAbout(),
    ]);
    const sold = new Map<string, number>();
    orders.filter(o => o.status === 'Sold').forEach(o => o.items.forEach((i: any) => sold.set(i.product_id, (sold.get(i.product_id) || 0) + i.quantity)));
    const enriched = products.map(p => ({ ...p, vendor_business_name: vendors.find(v => v.vendor_id === p.vendor_id)?.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendors.find(v => v.vendor_id === p.vendor_id)?.whatsapp_number || p.vendor_whatsapp || '' }));
    const topSelling = enriched.filter(p => (sold.get(p.id) || 0) > 0).sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0));
    const trending = enriched.map(p => ({ p, score: analytics.filter(a => a.product_id === p.id && ['view', 'like', 'enquiry'].includes(a.type)).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.p);
    return (
        <>
            <Storefront
                products={enriched}
                topSellingProducts={topSelling}
                trendingProducts={trending}
                currentYear={new Date().getFullYear()}
                bannerSettings={bannerSettings}
                ownerAbout={ownerAbout}
            />
        </>
    );
}
