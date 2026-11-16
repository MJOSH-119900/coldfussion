import { randomUUID } from 'crypto';
import type { CustomerInquiry, ProductFeedback, Product } from '../app/(public)/components/types/store';
import { readJson, updateJson } from './json-store';

const INQUIRY_LIMIT = 2000;
const FEEDBACK_LIMIT = 5000;
const FEEDBACK_PER_PRODUCT_LIMIT = 10;
const INQUIRY_CATEGORIES: CustomerInquiry['category'][] = ['general', 'product', 'delivery', 'report_vendor', 'other'];

function getWhatsAppDigits(value: unknown) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export async function submitCustomerInquiry(input: {
    whatsapp: unknown;
    category: unknown;
    message: unknown;
}) {
    const whatsapp = getWhatsAppDigits(input.whatsapp);
    const category = input.category;
    const message = typeof input.message === 'string' ? input.message.trim() : '';

    if (whatsapp.length < 10 || whatsapp.length > 15)
        throw new Error('Enter a WhatsApp number with country code, using 10 to 15 digits.');
    if (typeof category !== 'string' || !INQUIRY_CATEGORIES.includes(category as CustomerInquiry['category']))
        throw new Error('Choose a valid enquiry topic.');
    if (message.length < 10 || message.length > 1500)
        throw new Error('Write your message using 10 to 1,500 characters.');

    const inquiry: CustomerInquiry = {
        id: randomUUID(),
        whatsapp,
        category: category as CustomerInquiry['category'],
        message,
        created_at: new Date().toISOString(),
        status: 'new',
    };
    await updateJson<CustomerInquiry[]>('customer_inquiries.json', current => [
        ...(Array.isArray(current) ? current : []),
        inquiry,
    ].slice(-INQUIRY_LIMIT), []);

    const settings = await readJson<Record<string, unknown>>('site_settings.json', {});
    const adminWhatsApp = getWhatsAppDigits(settings.admin_whatsapp);
    const whatsappUrl = adminWhatsApp.length >= 10 && adminWhatsApp.length <= 15
        ? `https://wa.me/${adminWhatsApp}?text=${encodeURIComponent([
            'Store help enquiry',
            `Topic: ${category.replace('_', ' ')}`,
            `Customer WhatsApp: +${whatsapp}`,
            '',
            message,
        ].join('\n'))}`
        : undefined;

    return { inquiry, whatsappUrl };
}

export async function submitProductFeedback(input: {
    productId: unknown;
    name: unknown;
    rating: unknown;
    message: unknown;
}) {
    const productId = typeof input.productId === 'string' ? input.productId.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const rating = Number(input.rating);
    const message = typeof input.message === 'string' ? input.message.trim() : '';

    if (!productId || productId.length > 100)
        throw new Error('This product could not be identified.');
    if (name.length > 80)
        throw new Error('Your display name must be 80 characters or fewer.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw new Error('Choose a rating from 1 to 5 stars.');
    if (message.length < 5 || message.length > 1000)
        throw new Error('Write feedback using 5 to 1,000 characters.');

    const products = await readJson<Product[]>('products.json', []);
    const product = Array.isArray(products) ? products.find(item => item.id === productId) : undefined;
    if (!product)
        throw new Error('This product is no longer available.');

    const feedback: ProductFeedback = {
        id: randomUUID(),
        product_id: product.id,
        product_title: product.title,
        name: name || 'Shopper',
        rating,
        message,
        created_at: new Date().toISOString(),
        status: 'pending',
    };
    await updateJson<ProductFeedback[]>('product_feedback.json', current => {
        const entries = [...(Array.isArray(current) ? current : []), feedback];
        const latestForProduct = entries
            .filter(item => item.product_id === product.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .slice(-FEEDBACK_PER_PRODUCT_LIMIT);
        return [
            ...entries.filter(item => item.product_id !== product.id),
            ...latestForProduct,
        ].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-FEEDBACK_LIMIT);
    }, []);
    return feedback;
}

export async function getPublishedProductFeedback(productId: string) {
    const entries = await readJson<ProductFeedback[]>('product_feedback.json', []);
    return (Array.isArray(entries) ? entries : [])
        .filter(item => item.product_id === productId && item.status === 'approved')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, FEEDBACK_PER_PRODUCT_LIMIT);
}

export async function getAdminCustomerContent() {
    const [inquiries, feedback] = await Promise.all([
        readJson<CustomerInquiry[]>('customer_inquiries.json', []),
        readJson<ProductFeedback[]>('product_feedback.json', []),
    ]);
    return {
        inquiries: (Array.isArray(inquiries) ? inquiries : []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
        feedback: (Array.isArray(feedback) ? feedback : []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
}

export async function getAdminCustomerContentCount() {
    const { inquiries, feedback } = await getAdminCustomerContent();
    return inquiries.filter(item => item.status === 'new').length +
        feedback.filter(item => item.status === 'pending').length;
}

export async function markCustomerInquiryRead(id: string) {
    let updated = false;
    await updateJson<CustomerInquiry[]>('customer_inquiries.json', current => {
        if (!Array.isArray(current))
            return [];
        return current.map(item => {
            if (item.id !== id)
                return item;
            updated = true;
            return { ...item, status: 'read' };
        });
    }, []);
    return updated;
}

export async function moderateProductFeedback(id: string, status: 'approved' | 'rejected') {
    let updated = false;
    await updateJson<ProductFeedback[]>('product_feedback.json', current => {
        if (!Array.isArray(current))
            return [];
        return current.map(item => {
            if (item.id !== id)
                return item;
            updated = true;
            return { ...item, status };
        });
    }, []);
    return updated;
}

export async function removeProductFeedback(id: string) {
    let removed = false;
    await updateJson<ProductFeedback[]>('product_feedback.json', current => {
        if (!Array.isArray(current))
            return [];
        return current.filter(item => {
            if (item.id !== id)
                return true;
            removed = true;
            return false;
        });
    }, []);
    return removed;
}
