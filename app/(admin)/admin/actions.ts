'use server';
import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSession, requireAdmin, hashPassword, hashLookup } from '../../../lib/auth';
import { nextId, readJson, updateJson, writeJson } from '../../../lib/json-store';
import { Product } from '../../(public)/components/types/store';
import { deleteMusicTrack, getMusicTracks, getMusicSettings, saveMusicTrack, setMusicEnabled } from '../../../lib/music';
const UPLOAD_DIR = path.resolve('./public/uploads');
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export async function getProductsAction() { await requireAdmin(); return readJson<Product[]>('products.json', []); }
export async function saveProductAction(formData: FormData, vendorId: string, productId?: string) {
    const session = await getSession();
    if (!session)
        return { success: false, error: 'Unauthorized' };
    if (session.role !== 'admin' && session.role !== 'vendor')
        return { success: false, error: 'Unauthorized' };
    if (session.role === 'vendor' && session.vendorId !== vendorId)
        return { success: false, error: 'You cannot use another vendor account.' };
    const products = await readJson<Product[]>('products.json', []);
    const existing = productId ? products.find(p => p.id === productId) : undefined;
    if (productId && !existing)
        return { success: false, error: 'Product not found' };
    if (session.role === 'vendor' && existing && existing.vendor_id !== session.vendorId)
        return { success: false, error: 'You cannot edit another vendor’s product.' };
    const uploadedFiles = formData.getAll('image_files').filter((v): v is File => v instanceof File && v.size > 0);
    if (uploadedFiles.length > 7) return { success: false, error: 'Upload a maximum of 7 product photos at a time.' };
    const uploadedImages: string[] = [];
    if (uploadedFiles.length) {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        for (const file of uploadedFiles) {
            if (file.size > 12 * 1024 * 1024) return { success: false, error: `“${file.name}” is larger than 12 MB. Resize the image and upload it again.` };
            const ext = path.extname(file.name).toLowerCase();
            const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
            if (!allowed.has(ext)) return { success: false, error: `Unsupported picture “${file.name}”. Use JPG, JPEG, PNG, WEBP, GIF or AVIF.` };
            const bytes = Buffer.from(await file.arrayBuffer());
            const isJpeg = (ext === '.jpg' || ext === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
            const isPng = ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
            const isWebp = ext === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
            const isGif = ext === '.gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
            const isAvif = ext === '.avif' && bytes.subarray(4, 12).toString().includes('ftypavif');
            if (!(isJpeg || isPng || isWebp || isGif || isAvif)) return { success: false, error: `“${file.name}” is not a valid ${ext.slice(1).toUpperCase()} picture. Upload an original JPG, PNG, WEBP, GIF or AVIF image.` };
            const name = `${vendorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
            await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
            uploadedImages.push(`/uploads/${name}`);
        }
    }
    const price = Number(formData.get('price') || 0);
    if (!Number.isFinite(price) || price < 0) return { success: false, error: 'Enter a valid product price.' };
    const compareRaw = String(formData.get('compare_at_price') ?? '').trim();
    const compare = compareRaw && Number(compareRaw) > price ? Number(compareRaw) : undefined;
    const owner = existing?.vendor_id || (session.role === 'admin' ? vendorId : session.vendorId);
    if (!owner) return { success: false, error: 'Vendor account is not linked to a valid vendor profile.' };
    const sizePricesText = String(formData.get('size_prices_text') || '');
    const sizeLines = sizePricesText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const size_prices = sizeLines.map(line => {
        const match = line.match(/^(.+?)\s*(?:=|:)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/);
        return match ? { size: match[1].trim(), price: Number(match[2]) } : null;
    }).filter((v): v is { size: string; price: number } => Boolean(v && v.size && Number.isFinite(v.price) && v.price >= 0));
    if (sizeLines.length && (size_prices.length !== sizeLines.length || size_prices.length > 20)) return { success: false, error: 'Check size pricing: use one valid “Size = Price” entry per line, with no more than 20 sizes.' };
    if (new Set(size_prices.map(v => v.size.toLowerCase())).size !== size_prices.length) return { success: false, error: 'Each size can only be listed once.' };
    const isAdmin = session.role === 'admin';
    const product: Product = { id: existing?.id || `prod-${Date.now()}`, vendor_id: owner, title: String(formData.get('title') || '').trim(), description: String(formData.get('description') || '').trim(), price, compare_at_price: compare, size_prices: size_prices.length ? size_prices : undefined, available_quantity: Math.max(0, Number(formData.get('available_quantity') || 0)), is_available: formData.get('is_available') === 'true' && Number(formData.get('available_quantity') || 0) > 0, giveaway: formData.get('giveaway') === 'true', giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined, images: (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 7), category: String(formData.get('category') || 'Other').trim(), tags: String(formData.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), likes_count: existing?.likes_count || 0, vendor_whatsapp: String(formData.get('vendor_whatsapp') || '').trim(), location: String(formData.get('location') || '').trim(), condition: (String(formData.get('condition') || 'new') as Product['condition']), detail_gallery_enabled: formData.get('detail_gallery_enabled') === 'true', is_latest: formData.get('is_latest') === 'true', is_top_selling: isAdmin ? formData.get('is_top_selling') === 'true' : existing?.is_top_selling || false, related_products_mode: (String(formData.get('related_products_mode') || 'category') as Product['related_products_mode']), related_product_ids: formData.getAll('related_product_ids').map(String).filter(Boolean).slice(0, 4) };
    await writeJson('products.json', productId ? products.map(p => p.id === productId ? product : p) : [...products, product]);
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/product/${product.id}`);
    return { success: true, product };
}
export async function deleteProductAction(id: string) { const session = await getSession(); if (!session)
    return { success: false, error: 'Unauthorized' }; const products = await readJson<Product[]>('products.json', []); const target = products.find(p => p.id === id); if (!target)
    return { success: false, error: 'Product not found' }; if (session.role === 'vendor' && target.vendor_id !== session.vendorId)
    return { success: false, error: 'You cannot delete another vendor product' }; if (target?.images?.[0]?.startsWith('/uploads/')) {
    try {
        await fs.unlink(path.join(path.resolve('./public'), target.images[0]));
    }
    catch { }
} await writeJson('products.json', products.filter(p => p.id !== id)); revalidatePath('/'); revalidatePath('/admin'); return { success: true }; }
export async function createVendorFromRequestAction(requestId: string) {
    await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false, error: 'Enter the exact application ID, for example VREQ0001.' };
    const requests = await readJson<any[]>('vendor_requests.json', []);
    const request = requests.find(r => String(r.request_id).toUpperCase().replace('-', '') === normalizedId);
    if (!request)
        return { success: false, error: 'Application ID not found.' };
    if (request.status !== 'pending')
        return { success: false, error: `This application is already ${request.status}.` };
    const email = String(request.email).trim().toLowerCase();
    const users = await readJson<Record<string, any>>('users_auth.json', {});
    if (users[email] || users[hashLookup(email)])
        return { success: false, error: 'An account already exists for this email.' };
    const passwordHash = String(request.password_hash || '');
    if (!/^scrypt:[^:]+:[a-f0-9]+$/i.test(passwordHash))
        return { success: false, error: 'Application has no valid hashed password. Ask the applicant to apply again.' };
    const vendorId = await nextId('VEN', 4, 'vendor');
    const vendor = { vendor_id: vendorId, business_name: request.business_name, owner_name: request.owner_name, email, whatsapp_number: request.whatsapp_number, business_address: request.business_address, business_category: request.business_category, business_description: request.business_description, logo: request.logo || '', status: 'approved', created_at: new Date().toISOString() };
    await writeJson('vendors.json', [...(await readJson<any[]>('vendors.json', [])), vendor]);
    users[email] = { role: 'vendor', vendor_id: vendorId, password: passwordHash, status: 'active', created_at: new Date().toISOString() };
    await writeJson('users_auth.json', users);
    await writeJson('vendor_requests.json', requests.map(r => r.request_id === request.request_id ? { ...r, status: 'approved', vendor_id: vendorId, approved_at: new Date().toISOString(), password_hash: undefined } : r));
    revalidatePath('/admin');
    revalidatePath('/vendor/login');
    return { success: true, vendor };
}
export async function approveVendorRequestAction(requestId: string) { return createVendorFromRequestAction(requestId); }
export async function rejectVendorRequestAction(requestId: string) {
    await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false, error: 'Enter the exact application ID, for example VREQ0001.' };
    const requests = await readJson<any[]>('vendor_requests.json', []);
    const request = requests.find(r => String(r.request_id).toUpperCase().replace('-', '') === normalizedId);
    if (!request)
        return { success: false, error: 'Application ID not found.' };
    if (request.status !== 'pending')
        return { success: false, error: `This application is already ${request.status}.` };
    const rejectionId = await nextId('REJ', 4, 'vendorRequestRejection');
    await writeJson('vendor_requests.json', requests.map(r => r.request_id === request.request_id ? { ...r, status: 'rejected', rejected_at: new Date().toISOString(), rejection_id: rejectionId, password_hash: undefined } : r));
    revalidatePath('/admin');
    return { success: true };
}
export async function updateVendorStatusAction(vendorId: string, status: 'approved' | 'suspended' | 'active') { await requireAdmin(); const vendors = await readJson<any[]>('vendors.json', []); if (!vendors.some(v => v.vendor_id === vendorId))
    return { success: false, error: 'Vendor not found' }; await writeJson('vendors.json', vendors.map(v => v.vendor_id === vendorId ? { ...v, status } : v)); return { success: true }; }
export async function registerVendorAction(data: FormData) {
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('password_confirmation') || '');
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    if (!validEmail(email) || password.length < 10)
        return { success: false, error: 'Use a valid email and a password of at least 10 characters.' };
    const vendors = await readJson<any[]>('vendors.json', []);
    const requests = await readJson<any[]>('vendor_requests.json', []);
    const users = await readJson<Record<string, any>>('users_auth.json', {});
    if (users[email] || vendors.some(v => v.email === email) || requests.some(r => r.email === email && r.status === 'pending'))
        return { success: false, error: 'This email is already registered or pending approval.' };
    const requestId = await nextId('VREQ', 4, 'vendorRequest');
    const passwordHash = await hashPassword(password);
    const logoFile = data.get('business_logo');
    let logo = '';
    if (logoFile instanceof File && logoFile.size > 0) {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const ext = path.extname(logoFile.name).toLowerCase();
        const safe = /^\.(jpg|jpeg|png|webp)$/.test(ext) ? ext : '.jpg';
        const fileName = `vendor-${requestId}-${Date.now()}${safe}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await logoFile.arrayBuffer()));
        logo = `/uploads/${fileName}`;
    }
    const request = { request_id: requestId, status: 'pending', business_name: String(data.get('business_name') || '').trim(), owner_name: String(data.get('owner_name') || '').trim(), email, whatsapp_number: String(data.get('whatsapp_number') || '').trim(), business_address: String(data.get('business_address') || '').trim(), business_category: String(data.get('business_category') || '').trim(), business_description: String(data.get('business_description') || '').trim(), logo, password_hash: passwordHash, created_at: new Date().toISOString() };
    await writeJson('vendor_requests.json', [...requests, request]);
    const siteSettings = await readJson<{ admin_whatsapp?: string }>('site_settings.json', { admin_whatsapp: '' });
    const adminWhatsApp = String(siteSettings.admin_whatsapp || '').replace(/\D/g, '');
    const message = ['Fussion vendor application', `Application: ${requestId}`, `Business: ${request.business_name}`, `Owner: ${request.owner_name}`, `Email: ${request.email}`, `WhatsApp: ${request.whatsapp_number}`, `Category: ${request.business_category}`, `Address: ${request.business_address}`, `Description: ${request.business_description}`, '', 'Please review this application in the Fussion Admin Dashboard and approve or reject it.'].join('\n');
    const whatsappUrl = adminWhatsApp.length >= 10 && adminWhatsApp.length <= 15 ? `https://wa.me/${adminWhatsApp}?text=${encodeURIComponent(message)}` : undefined;
    return { success: true, requestId, whatsappUrl, whatsappConfigured: Boolean(whatsappUrl) };
}
export async function getAdminWhatsAppAction() {
    await requireAdmin();
    const settings = await readJson<{ admin_whatsapp?: string }>('site_settings.json', { admin_whatsapp: '' });
    return settings.admin_whatsapp || '';
}
export async function saveAdminWhatsAppAction(phone: string) {
    await requireAdmin();
    const normalized = String(phone || '').replace(/\D/g, '');
    if (normalized && (normalized.length < 10 || normalized.length > 15)) {
        return { success: false, error: 'Enter the WhatsApp number with country code, using 10 to 15 digits. Example: 2348012345678.' };
    }
    await writeJson('site_settings.json', { ...(await readJson<Record<string, unknown>>('site_settings.json', {})), admin_whatsapp: normalized });
    revalidatePath('/admin');
    revalidatePath('/vendor/register');
    return { success: true, phone: normalized };
}
export async function getVendorProductsAction() { const session = await getSession(); if (!session || session.role !== 'vendor')
    return []; const products = await readJson<Product[]>('products.json', []); return products.filter(p => p.vendor_id === session.vendorId); }
export async function getVendorRequestsAction() { await requireAdmin(); return readJson<any[]>('vendor_requests.json', []); }
export async function getVendorsAction() { await requireAdmin(); return readJson<any[]>('vendors.json', []); }
export async function getMarketplaceStatsAction() { await requireAdmin(); const [products, vendors, orders, analytics] = await Promise.all([readJson<Product[]>('products.json', []), readJson<any[]>('vendors.json', []), readJson<any[]>('orders.json', []), readJson<any[]>('analytics.json', [])]); const sold = orders.filter(o => o.status === 'Sold'); return { vendors: vendors.length, activeVendors: vendors.filter(v => v.status === 'approved' || v.status === 'active').length, pendingVendors: (await readJson<any[]>('vendor_requests.json', [])).filter(v => v.status === 'pending').length, products: products.length, orders: orders.length, pendingOrders: orders.filter(o => ['Pending', 'Acknowledged', 'Processing', 'Completing'].includes(o.status)).length, completedSales: sold.length, revenue: sold.reduce((s, o) => s + o.total, 0), views: analytics.filter(a => a.type === 'view').length }; }


export async function getMusicTracksAction() {
    await requireAdmin();
    return getMusicTracks();
}

export async function getMusicSettingsAction() {
    await requireAdmin();
    return getMusicSettings();
}

export async function setMusicPlaybackAction(enabled: boolean) {
    await requireAdmin();
    const settings = await setMusicEnabled(enabled);
    revalidatePath('/');
    revalidatePath('/admin');
    return { success: true, settings };
}

export async function uploadMusicTrackAction(formData: FormData) {
    await requireAdmin();

    try {
        const file = formData.get('audio_file');
        const title = String(formData.get('title') || '');

        if (!(file instanceof File)) {
            return { success: false, error: 'Choose an audio file.' };
        }

        const track = await saveMusicTrack(file, title);
        revalidatePath('/');
        revalidatePath('/admin');

        return { success: true, track };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not upload the song.',
        };
    }
}

export async function deleteMusicTrackAction(trackId: string) {
    await requireAdmin();

    try {
        await deleteMusicTrack(trackId);
        revalidatePath('/');
        revalidatePath('/admin');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not remove the song.',
        };
    }
}
