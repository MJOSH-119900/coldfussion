import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ProductDetailsClient from './ProductDetailsClient';
import { readJson } from '../../../lib/json-store';
import { Product } from '../../(public)/components/types/store';
import { getBrandSettings } from '../../../lib/branding';
import { getPublishedProductFeedback } from '../../../lib/customer-content';
export default async function ProductDetailsPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { return <Suspense fallback={<main className="min-h-screen p-8 text-center"><p className="font-semibold">Loading product...</p></main>}><Content params={params}/></Suspense>; }
async function Content({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; const [products, vendors, analytics, brand, feedback] = await Promise.all([readJson<Product[]>('products.json', []), readJson<any[]>('vendors.json', []), readJson<any[]>('analytics.json', []), getBrandSettings(), getPublishedProductFeedback(id)]); const product = products.find(p => p.id === id); if (!product)
    notFound(); const related = product.related_products_mode === 'manual' ? products.filter(p => product.related_product_ids?.includes(p.id)) : product.related_products_mode === 'random' ? products.filter(p => p.id !== id).sort(() => Math.random() - .5).slice(0, 4) : products.filter(p => p.id !== id && p.category === product.category).slice(0, 4); const vendor = vendors.find(v => v.vendor_id === product.vendor_id); return <ProductDetailsClient product={{ ...product, vendor_business_name: vendor?.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendor?.whatsapp_number || product.vendor_whatsapp || '' }} related={related} feedback={feedback}/>; }
