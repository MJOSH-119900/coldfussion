'use server';
import { readJson } from '../../../lib/json-store';
import { Product } from './types/store';
import { getBrandSettings } from '../../../lib/branding';
import { submitCustomerInquiry, submitProductFeedback } from '../../../lib/customer-content';
import { isVendorSubscriptionActive } from '../../../lib/vendor-onboarding';
import { createSupabaseServerClient } from '../../../server/supabase';

export type FairProductFilters = {
    filter_category?: string | null;
    filter_brand?: string | null;
    search_query?: string | null;
    page_limit?: number;
    page_offset?: number;
};

/** Public, paginated product discovery through the fair-ranking Postgres RPC. */
export async function getFairProductsAction(filters: FairProductFilters = {}) {
    const pageLimit = Math.min(100, Math.max(1, Math.floor(Number(filters.page_limit) || 20)));
    const pageOffset = Math.min(100000, Math.max(0, Math.floor(Number(filters.page_offset) || 0)));
    const category = String(filters.filter_category || '').trim().slice(0, 100) || null;
    const brand = String(filters.filter_brand || '').trim().slice(0, 100) || null;
    const search = String(filters.search_query || '').trim().slice(0, 120) || null;
    try {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('get_fair_products', {
            filter_category: category,
            filter_brand: brand,
            search_query: search,
            page_limit: pageLimit,
            page_offset: pageOffset,
        });
        if (error) return { success: false as const, error: 'Fair product discovery is not available yet.' };
        const products: Product[] = (data || []).map((raw: Record<string, unknown>) => ({
            id: String(raw.id || ''),
            vendor_id: String(raw.vendor_id || ''),
            title: String(raw.title || ''),
            description: String(raw.description || ''),
            price: Number(raw.price || 0),
            compare_at_price: raw.compare_at_price == null ? undefined : Number(raw.compare_at_price),
            size_prices: Array.isArray(raw.size_prices) ? raw.size_prices as Product['size_prices'] : undefined,
            giveaway: Boolean(raw.giveaway),
            giveaway_announcement: raw.giveaway_announcement == null ? undefined : String(raw.giveaway_announcement),
            available_quantity: Number(raw.available_quantity || 0),
            is_available: Boolean(raw.is_available),
            images: Array.isArray(raw.images) ? raw.images.map(String) : [],
            category: String(raw.category || 'Other'),
            subcategory: raw.subcategory == null ? undefined : String(raw.subcategory),
            brand: raw.brand == null ? 'Unbranded' : String(raw.brand),
            tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
            likes_count: Number(raw.likes_count || 0),
            vendor_whatsapp: String(raw.whatsapp_number || raw.vendor_whatsapp || ''),
            vendor_business_name: String(raw.store_name || raw.vendor_business_name || ''),
            location: raw.location == null ? undefined : String(raw.location),
            condition: raw.condition == null ? undefined : String(raw.condition) as Product['condition'],
            detail_gallery_enabled: Boolean(raw.detail_gallery_enabled),
            is_latest: Boolean(raw.is_latest),
            is_top_selling: Boolean(raw.is_top_selling),
            is_featured: Boolean(raw.is_featured),
            featured_until: raw.featured_until == null ? undefined : String(raw.featured_until),
            created_at: raw.created_at == null ? undefined : String(raw.created_at),
            vendor_item_rank: raw.vendor_item_rank == null ? undefined : Number(raw.vendor_item_rank),
            related_products_mode: raw.related_products_mode == null ? undefined : String(raw.related_products_mode) as Product['related_products_mode'],
            related_product_ids: Array.isArray(raw.related_product_ids) ? raw.related_product_ids.map(String) : [],
        }));
        return { success: true as const, products, has_more: products.length === pageLimit };
    } catch (error) {
        console.error('Could not load fair product discovery:', error);
        return { success: false as const, error: 'Fair product discovery is not available yet.' };
    }
}

/** Public storefront read only. No admin/vendor session is required. */
export async function getPublicProductsAction() {
    const [products, vendors, brand] = await Promise.all([readJson<Product[]>('products.json', []), readJson<any[]>('vendors.json', []), getBrandSettings()]);
    const activeVendorIds = new Set(vendors.filter(isVendorSubscriptionActive).map(vendor => vendor.vendor_id));
    return products.filter(product => activeVendorIds.has(product.vendor_id)).map(p => { const vendor = vendors.find(v => v.vendor_id === p.vendor_id); return { ...p, vendor_business_name: vendor?.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendor?.whatsapp_number || p.vendor_whatsapp || '' }; });
}

export async function submitCustomerInquiryAction(formData: FormData) {
    try {
        const result = await submitCustomerInquiry({
            whatsapp: formData.get('whatsapp'),
            category: formData.get('category'),
            message: formData.get('message'),
        });
        return { success: true, whatsappUrl: result.whatsappUrl };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not save your enquiry.' };
    }
}

export async function submitProductFeedbackAction(formData: FormData) {
    try {
        await submitProductFeedback({
            productId: formData.get('product_id'),
            name: formData.get('name'),
            rating: formData.get('rating'),
            message: formData.get('message'),
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not submit product feedback.' };
    }
}
