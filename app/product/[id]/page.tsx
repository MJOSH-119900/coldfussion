import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ProductDetailsClient from './ProductDetailsClient';
import { readJson } from '../../../lib/json-store';
import { Product } from '../../(public)/components/types/store';
import { getBrandSettings } from '../../../lib/branding';
import { getPublishedProductFeedback } from '../../../lib/customer-content';
import { isVendorSubscriptionActive } from '../../../lib/vendor-onboarding';

export default async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    return <Suspense fallback={<main className="min-h-screen p-8 text-center"><p className="font-semibold">Loading product...</p></main>}><Content params={params}/></Suspense>;
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [products, vendors, analytics, brand, feedback] = await Promise.all([
        readJson<Product[]>('products.json', []),
        readJson<any[]>('vendors.json', []),
        readJson<any[]>('analytics.json', []),
        getBrandSettings(),
        getPublishedProductFeedback(id),
    ]);
    const product = products.find(item => item.id === id);
    if (!product) notFound();
    const vendor = vendors.find(item => item.vendor_id === product.vendor_id);
    if (!vendor || !isVendorSubscriptionActive(vendor)) notFound();
    const related = product.related_products_mode === 'manual'
        ? products.filter(item => item.vendor_id === vendor.vendor_id && product.related_product_ids?.includes(item.id))
        : product.related_products_mode === 'random'
            ? products.filter(item => item.id !== id && vendors.some(candidate => candidate.vendor_id === item.vendor_id && isVendorSubscriptionActive(candidate))).sort(() => Math.random() - .5).slice(0, 4)
            : products.filter(item => item.id !== id && item.category === product.category && vendors.some(candidate => candidate.vendor_id === item.vendor_id && isVendorSubscriptionActive(candidate))).slice(0, 4);
    return <ProductDetailsClient product={{ ...product, vendor_business_name: vendor.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendor.whatsapp_number || product.vendor_whatsapp || '' }} related={related} feedback={feedback}/>;
}
