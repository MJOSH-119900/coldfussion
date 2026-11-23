'use server';
import { readJson, updateJson, nextId } from './json-store';
import { CartItem, Order, OrderItem, Product } from '../app/(public)/components/types/store';
import type { OrderReceiptConfirmation } from '../app/(public)/components/types/store';
import { requireAdmin, requireVendor } from './auth';
import { revalidatePath } from 'next/cache';
import { createOrderReceiptToken, hashOrderReceiptToken, isOrderReceiptConfirmationExpired, matchesOrderReceiptToken } from './order-receipt-tokens';

function withoutReceiptTokenHash(order: Order): Order {
    const safeOrder = { ...order };
    delete safeOrder.receipt_confirmation_token_hash;
    return safeOrder;
}

export async function createWhatsAppOrders(items: CartItem[], customerName?: string, customerPhone?: string, checkoutId?: string) {
    if (!items.length)
        return { success: false, error: 'Cart is empty' };
    if (checkoutId) {
        const existing = await readJson<Order[]>('orders.json', []);
        const matches = existing.filter(o => o.checkout_id === checkoutId);
        if (matches.length)
            return { success: true, orders: matches.map(withoutReceiptTokenHash), duplicate: true };
    }
    const grouped = new Map<string, CartItem[]>();
    for (const item of items) {
        const arr = grouped.get(item.vendor_id) || [];
        arr.push(item);
        grouped.set(item.vendor_id, arr);
    }
    const products = await readJson<Product[]>('products.json', []);
    const vendors = await readJson<any[]>('vendors.json', []);
    const orders: Order[] = [];
    for (const [vendorId, group] of grouped) {
        const vendor = vendors.find(v => v.vendor_id === vendorId);
        const number = String(vendor?.whatsapp_number || group[0]?.vendor_whatsapp || '').replace(/\D/g, '');
        if (number.length < 10 || number.length > 15)
            return { success: false, error: `The seller for ${group[0]?.title || 'an item'} has not configured a valid WhatsApp number. Please contact the seller or try again later.` };
    }
    for (const [vendorId, group] of grouped) {
        const fresh = group.map(i => products.find(p => p.id === i.id)).filter(Boolean) as Product[];
        if (fresh.length !== group.length)
            return { success: false, error: 'One or more products are no longer available.' };
        const requestedByProduct = new Map<string, number>();
        for (const item of group) requestedByProduct.set(item.id, (requestedByProduct.get(item.id) || 0) + item.quantity);
        for (const [productId, requested] of requestedByProduct) {
            const p = products.find(x => x.id === productId)!;
            if (!p.is_available || (p.available_quantity ?? 0) < requested)
                return { success: false, error: `Not enough stock for ${p.title}. Please update your cart.` };
        }
        for (const item of group) {
            const p = products.find(x => x.id === item.id)!;
            const variant = p.size_prices?.find(v => v.size === item.selected_size);
            if (p.size_prices?.length && !variant) return { success: false, error: `Choose a valid size for ${p.title} before checkout.` };
            const expectedPrice = variant?.price ?? p.price;
            if (Number(item.price) !== expectedPrice) return { success: false, error: `The price for ${p.title} has changed. Please refresh your cart and try again.` };
        }
        const order_id = await nextId('ORD', 6, 'order');
        const orderItems: OrderItem[] = group.map(item => { const p = products.find(x => x.id === item.id)!; const quantity = item.quantity; const unitPrice = p.size_prices?.find(v => v.size === item.selected_size)?.price ?? p.price; return { product_id: p.id, vendor_id: p.vendor_id, product_name: p.title, selected_size: item.selected_size, product_image: p.images?.[0], unit_price: unitPrice, quantity, subtotal: unitPrice * quantity }; });
        const vendor = vendors.find(v => v.vendor_id === vendorId);
        const vendorNumber = String(vendor?.whatsapp_number || group[0]?.vendor_whatsapp || '').replace(/\D/g, '');
        const order: Order = { order_id, checkout_id: checkoutId, vendor_id: vendorId, vendor_whatsapp: vendorNumber, items: orderItems, customer_name: customerName?.trim() || undefined, customer_phone: customerPhone?.trim() || undefined, total: orderItems.reduce((s, i) => s + i.subtotal, 0), checkout_method: 'whatsapp', status: 'Pending', created_at: new Date().toISOString(), whatsapp_handoff_at: new Date().toISOString(), status_history: [{ status: 'Pending', at: new Date().toISOString(), actor: 'customer' }] };
        await updateJson<Order[]>('orders.json', list => [...list, order], []);
        orders.push(order);
    }
    return { success: true, orders: orders.map(withoutReceiptTokenHash) };
}

export async function createOrderReceiptConfirmationLinkAction(orderId: string) {
    const session = await requireVendor();
    const id = String(orderId || '').trim();
    const order = (await readJson<Order[]>('orders.json', [])).find(item => item.order_id === id);
    if (!order) return { success: false, error: 'Order not found.' };
    if (order.vendor_id !== session.vendorId) return { success: false, error: 'You cannot send a confirmation link for another vendor’s order.' };
    if (order.status !== 'Sold') return { success: false, error: 'Mark the order completed before requesting customer receipt confirmation.' };
    if (order.customer_received_at) return { success: false, error: 'The customer has already confirmed receipt.' };

    const { token, tokenHash } = createOrderReceiptToken();
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let updated = false;
    await updateJson<Order[]>('orders.json', current => {
        updated = false;
        return current.map(item => {
            if (item.order_id !== id || item.vendor_id !== session.vendorId ||
                item.status !== 'Sold' || item.customer_received_at) return item;
            updated = true;
            return {
                ...item,
                receipt_confirmation_token_hash: tokenHash,
                receipt_confirmation_expires_at: expiresAt,
                receipt_confirmation_sent_at: sentAt,
            };
        });
    }, []);
    if (!updated) return { success: false, error: 'The order changed before the link could be created. Refresh and try again.' };
    revalidatePath('/vendor/dashboard');
    revalidatePath('/admin');
    return { success: true, confirmationPath: `/order-confirmation/${token}`, expiresAt };
}

export async function getOrderReceiptConfirmationAction(token: string): Promise<OrderReceiptConfirmation | null> {
    const tokenHash = hashOrderReceiptToken(String(token || '').trim());
    if (!tokenHash) return null;
    const order = (await readJson<Order[]>('orders.json', [])).find(item =>
        matchesOrderReceiptToken(token, item.receipt_confirmation_token_hash));
    if (!order || order.status !== 'Sold' || !order.receipt_confirmation_sent_at || !order.receipt_confirmation_expires_at) {
        return null;
    }
    if (isOrderReceiptConfirmationExpired(order.receipt_confirmation_expires_at) && !order.customer_received_at) return null;
    return {
        order_id: order.order_id,
        items: order.items.map(item => ({ product_name: item.product_name, quantity: item.quantity })),
        total: order.total,
        expires_at: order.receipt_confirmation_expires_at,
        customer_received_at: order.customer_received_at,
    };
}

export async function confirmCustomerReceiptAction(token: string) {
    const normalizedToken = String(token || '').trim();
    if (!hashOrderReceiptToken(normalizedToken)) {
        return { success: false, error: 'This confirmation link is invalid or expired.' };
    }
    let outcome: 'invalid' | 'already-confirmed' | 'confirmed' = 'invalid';
    const confirmedAt = new Date().toISOString();
    await updateJson<Order[]>('orders.json', current => {
        outcome = 'invalid';
        return current.map(order => {
            if (!matchesOrderReceiptToken(normalizedToken, order.receipt_confirmation_token_hash)) return order;
            if (order.status !== 'Sold' || !order.receipt_confirmation_sent_at ||
                isOrderReceiptConfirmationExpired(order.receipt_confirmation_expires_at)) return order;
            if (order.customer_received_at) {
                outcome = 'already-confirmed';
                return order;
            }
            outcome = 'confirmed';
            return { ...order, customer_received_at: confirmedAt };
        });
    }, []);
    if (outcome === 'invalid') {
        return { success: false, error: 'This confirmation link is invalid or expired.' };
    }
    if (outcome === 'confirmed') {
        revalidatePath('/admin');
        revalidatePath('/vendor/dashboard');
    }
    return { success: true, alreadyConfirmed: outcome === 'already-confirmed' };
}
export async function updateOrderStatus(orderId: string, status: Order['status']) {
    const session = await (async () => { try {
        return await requireVendor();
    }
    catch {
        return await requireAdmin();
    } })();
    const orders = await readJson<Order[]>('orders.json', []);
    const order = orders.find(o => o.order_id === orderId);
    if (!order)
        return { success: false, error: 'Order not found' };
    if (session.role === 'vendor' && order.vendor_id !== session.vendorId)
        return { success: false, error: 'You cannot update this order' };
    const allowed: Record<Order['status'], Order['status'][]> = {
        Pending: session.role === 'admin' ? ['Rejected', 'Cancelled'] : ['Acknowledged', 'Rejected', 'Cancelled'],
        Acknowledged: session.role === 'admin' ? ['Rejected', 'Cancelled'] : ['Processing', 'Rejected', 'Cancelled'],
        Processing: session.role === 'admin' ? ['Rejected', 'Cancelled'] : ['Completing', 'Rejected', 'Cancelled'],
        Completing: [], Sold: [], Rejected: [], Cancelled: []
    };
    if (!allowed[order.status].includes(status))
        return { success: false, error: `Cannot change ${order.status} to ${status}` };
    const now = new Date().toISOString();
    if (status === 'Completing') {
        // Atomically claim the final sale transition so duplicate clicks/requests cannot deduct stock twice.
        let claimed = false;
        await updateJson<Order[]>('orders.json', list => list.map(o => {
            if (o.order_id !== orderId || o.status !== 'Processing')
                return o;
            claimed = true;
            return { ...o, status: 'Completing', status_history: [...(o.status_history || []), { status: 'Completing', at: now, actor: session.role }] };
        }), []);
        if (!claimed)
            return { success: false, error: 'This order is already being completed or has changed status. Refresh the dashboard.' };
        let stockError = '';
        await updateJson<Product[]>('products.json', products => {
            const quantities = new Map<string, number>();
            for (const item of order.items) quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
            for (const [productId, quantity] of quantities) {
                const p = products.find(x => x.id === productId);
                if (!p || !p.is_available || (p.available_quantity ?? 0) < quantity) {
                    stockError = `Insufficient stock for ${p?.title || productId}`;
                    return products;
                }
            }
            return products.map(p => { const quantity = quantities.get(p.id); return quantity ? { ...p, available_quantity: Math.max(0, (p.available_quantity ?? 0) - quantity), is_available: (p.available_quantity ?? 0) - quantity > 0 } : p; });
        }, []);
        if (stockError) {
            await updateJson<Order[]>('orders.json', list => list.map(o => o.order_id === orderId && o.status === 'Completing' ? { ...o, status: 'Processing', status_history: [...(o.status_history || []), { status: 'Processing', at: new Date().toISOString(), actor: 'system' }] } : o), []);
            return { success: false, error: stockError };
        }
        await updateJson<Order[]>('orders.json', list => list.map(o => o.order_id === orderId && o.status === 'Completing' ? { ...o, status: 'Sold', status_history: [...(o.status_history || []), { status: 'Sold', at: new Date().toISOString(), actor: session.role }] } : o), []);
    }
    else {
        let changed = false;
        await updateJson<Order[]>('orders.json', list => list.map(o => {
            if (o.order_id !== orderId || o.status !== order.status)
                return o;
            changed = true;
            return { ...o, status, status_history: [...(o.status_history || []), { status, at: now, actor: session.role }] };
        }), []);
        if (!changed)
            return { success: false, error: 'This order has already been updated. Refresh the dashboard.' };
    }
    revalidatePath('/');
    revalidatePath('/vendor/dashboard');
    revalidatePath('/admin');
    return { success: true };
}
export async function recordEngagement(type: 'view' | 'like' | 'unlike' | 'enquiry', productId: string, visitorId: string, orderId?: string) {
    const products = await readJson<Product[]>('products.json', []);
    const product = products.find(p => p.id === productId);
    if (!product || !visitorId.trim()) return { success: false };
    const now = new Date().toISOString();
    if (type === 'like' || type === 'unlike') {
        let changed = false;
        await updateJson<any[]>('likes.json', likes => {
            const alreadyLiked = likes.some(l => l.product_id === productId && l.visitor_id === visitorId);
            if (type === 'like' && !alreadyLiked) { changed = true; return [...likes, { product_id: productId, visitor_id: visitorId, created_at: now }]; }
            if (type === 'unlike' && alreadyLiked) { changed = true; return likes.filter(l => !(l.product_id === productId && l.visitor_id === visitorId)); }
            return likes;
        }, []);
        if (changed) await updateJson<Product[]>('products.json', ps => ps.map(p => p.id === productId ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (type === 'like' ? 1 : -1)) } : p), []);
        if (changed) await updateJson<any[]>('analytics.json', a => [...a, { event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, product_id: productId, vendor_id: product.vendor_id, visitor_id: visitorId, timestamp: now, order_id: orderId }], []);
        revalidatePath('/');
        revalidatePath(`/product/${productId}`);
        revalidatePath('/admin');
        return { success: true, duplicate: !changed };
    }
    if (type === 'view') {
        const analytics = await readJson<any[]>('analytics.json', []);
        if (analytics.some(a => a.type === 'view' && a.product_id === productId && a.visitor_id === visitorId)) return { success: true, duplicate: true };
    }
    await updateJson<any[]>('analytics.json', a => [...a, { event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, product_id: productId, vendor_id: product.vendor_id, visitor_id: visitorId, timestamp: now, order_id: orderId }], []);
    return { success: true };
}
export async function getVendorOrdersAction() { const session = await requireVendor(); return (await readJson<Order[]>('orders.json', [])).filter(o => o.vendor_id === session.vendorId).map(withoutReceiptTokenHash); }
export async function getVendorStatsAction() { const session = await requireVendor(); const [products, orders, analytics] = await Promise.all([readJson<Product[]>('products.json', []), readJson<Order[]>('orders.json', []), readJson<any[]>('analytics.json', [])]); const own = products.filter(p => p.vendor_id === session.vendorId), ord = orders.filter(o => o.vendor_id === session.vendorId), sold = ord.filter(o => o.status === 'Sold'); return { products: own.length, active: own.filter(p => p.is_available).length, inventory: own.reduce((s, p) => s + (p.available_quantity || 0), 0), enquiries: analytics.filter(a => a.vendor_id === session.vendorId && a.type === 'enquiry').length, pending: ord.filter(o => o.status === 'Pending').length, confirmed: ord.filter(o => o.status === 'Acknowledged' || o.status === 'Processing').length, sold: sold.length, revenue: sold.reduce((s, o) => s + o.total, 0) }; }
export async function getAdminOrdersAction() { await requireAdmin(); return (await readJson<Order[]>('orders.json', [])).map(withoutReceiptTokenHash); }
export async function getVendorProfileAction() { const session = await requireVendor(); const vendors = await readJson<any[]>('vendors.json', []); const vendor = vendors.find(v => v.vendor_id === session.vendorId); if (!vendor)
    return null; return { vendor_id: vendor.vendor_id, business_name: vendor.business_name, whatsapp_number: vendor.whatsapp_number || '' }; }
export async function updateVendorWhatsAppAction(number: string) { const session = await requireVendor(); const normalized = number.replace(/[^0-9]/g, ''); if (normalized.length < 10 || normalized.length > 15)
    return { success: false, error: 'Enter a valid WhatsApp number with country code.' }; let updated = false; await updateJson<any[]>('vendors.json', vendors => vendors.map(v => { if (v.vendor_id !== session.vendorId)
    return v; updated = true; return { ...v, whatsapp_number: normalized, updated_at: new Date().toISOString() }; }), []); if (!updated)
    return { success: false, error: 'Vendor profile not found.' }; revalidatePath('/'); revalidatePath('/vendor/dashboard'); return { success: true }; }
