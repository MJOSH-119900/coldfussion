import { Suspense } from 'react';
import Storefront from './components/Storefront';
import { readJson } from '../../lib/json-store';
import { Product } from './components/types/store';
import { getBannerSettings } from '../../lib/banners';
import { getBrandSettings } from '../../lib/branding';
import { getOwnerAbout } from '../../lib/about';
import { isVendorAccessActive } from '../../lib/vendor-onboarding';
import { getFairProductsAction } from './components/public-actions';
export default function PublicStorefront() { return <Suspense fallback={<main className="min-h-screen p-8 text-center"><p className="font-semibold">Loading storefront...</p></main>}><StorefrontContent /></Suspense>; }
async function StorefrontContent() {
    const [products, orders, analytics, vendors, bannerSettings, brand, ownerAbout, fairPage] = await Promise.all([
        readJson<Product[]>('products.json', []),
        readJson<any[]>('orders.json', []),
        readJson<any[]>('analytics.json', []),
        readJson<any[]>('vendors.json', []),
        getBannerSettings(),
        getBrandSettings(),
        getOwnerAbout(),
        getFairProductsAction({ page_limit: 20, page_offset: 0 }),
    ]);
    const sold = new Map<string, number>();
    orders.filter(o => o.status === 'Sold').forEach(o => o.items.forEach((i: any) => sold.set(i.product_id, (sold.get(i.product_id) || 0) + i.quantity)));
    const now = Date.now();
    const activeVendorIds = new Set(vendors.filter(vendor => fairPage.success
        ? ['approved', 'active'].includes(String(vendor.status || '')) && vendor.subscription_status === 'active' && Date.parse(String(vendor.subscription_expires_at || '')) > now
        : isVendorAccessActive(vendor)).map(vendor => vendor.vendor_id));
    const vendorsById = new Map(vendors.map(vendor => [vendor.vendor_id, vendor]));
    const rawEnriched = products.filter(product => activeVendorIds.has(product.vendor_id)).map(product => {
        const vendor = vendorsById.get(product.vendor_id);
        return { ...product, vendor_business_name: vendor?.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendor?.whatsapp_number || product.vendor_whatsapp || '' };
    });
    const boostWinners = new Map<string, { id: string; expiresAt: number }>();
    for (const product of rawEnriched) {
        const expiresAt = Date.parse(product.featured_until || '');
        if (!product.is_featured || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
        const currentWinner = boostWinners.get(product.vendor_id);
        if (!currentWinner || expiresAt > currentWinner.expiresAt)
            boostWinners.set(product.vendor_id, { id: product.id, expiresAt });
    }
    const enriched = rawEnriched.map(product => ({ ...product, is_featured: boostWinners.get(product.vendor_id)?.id === product.id }));
    const fairProducts = fairPage.success ? fairPage.products : enriched;
    const topSelling = enriched.filter(p => (sold.get(p.id) || 0) > 0).sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0));
    const trending = enriched.map(p => ({ p, score: analytics.filter(a => a.product_id === p.id && ['view', 'like', 'enquiry'].includes(a.type)).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.p);
    return (
        <>
            <Storefront
                products={enriched}
                initialFeedProducts={fairProducts}
                brandOptions={[...new Set(enriched.map(product => product.brand || 'Unbranded'))].sort((a, b) => a.localeCompare(b))}
                fairRpcReady={fairPage.success}
                topSellingProducts={topSelling}
                trendingProducts={trending}
                currentYear={new Date().getFullYear()}
                bannerSettings={bannerSettings}
                ownerAbout={ownerAbout}
            />
        </>
    );
}
