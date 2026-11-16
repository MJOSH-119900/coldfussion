'use server';
import { readJson } from '../../../lib/json-store';
import { Product } from './types/store';
import { getBrandSettings } from '../../../lib/branding';
import { submitCustomerInquiry, submitProductFeedback } from '../../../lib/customer-content';
/** Public storefront read only. No admin/vendor session is required. */
export async function getPublicProductsAction() {
    const [products, vendors, brand] = await Promise.all([readJson<Product[]>('products.json', []), readJson<any[]>('vendors.json', []), getBrandSettings()]);
    return products.map(p => { const vendor = vendors.find(v => v.vendor_id === p.vendor_id); return { ...p, vendor_business_name: vendor?.business_name || `${brand.companyName} seller`, vendor_whatsapp: vendor?.whatsapp_number || p.vendor_whatsapp || '' }; });
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
