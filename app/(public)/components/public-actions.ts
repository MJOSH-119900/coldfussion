'use server';
import { readJson } from '../../../lib/json-store';
import { Product } from './types/store';
/** Public storefront read only. No admin/vendor session is required. */
export async function getPublicProductsAction() {
    const [products, vendors] = await Promise.all([readJson<Product[]>('products.json', []), readJson<any[]>('vendors.json', [])]);
    return products.map(p => { const vendor = vendors.find(v => v.vendor_id === p.vendor_id); return { ...p, vendor_business_name: vendor?.business_name || 'Fussion seller', vendor_whatsapp: vendor?.whatsapp_number || p.vendor_whatsapp || '' }; });
}
