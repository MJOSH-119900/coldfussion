'use server';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSession, requireAdmin, requireVendor } from '../../../lib/auth';
import { nextId, readJson, updateJson, writeJson } from '../../../lib/json-store';
import { Product } from '../../(public)/components/types/store';
import { deleteMusicTrack, getMusicTracks, getMusicSettings, saveMusicTrack, setMusicEnabled } from '../../../lib/music';
import { getBannerSettings, removeBanner, saveBanner, saveBannerInterval } from '../../../lib/banners';
import type { BannerIntervalUnit, BannerSettings } from '../../(public)/components/types/store';
import { getBrandSettings, saveBrandSettings } from '../../../lib/branding';
import { getOwnerAbout, saveOwnerAbout } from '../../../lib/about';
import { getAdminCustomerContent, getAdminCustomerContentCount, markCustomerInquiryRead, moderateProductFeedback, removeProductFeedback } from '../../../lib/customer-content';
import { getUpgradeAnnouncement, saveUpgradeAnnouncement } from '../../../lib/announcements';
import { checkPasswordAgainstBreaches } from '../../../lib/password-security';
import { createSupabaseAdminClient } from '../../../server/supabase-admin';
import { createSupabaseServerClient, getAuthCallbackUrl } from '../../../server/supabase';
import { deleteStoreAsset, deleteStoreAssetIfUnused, uploadStoreAsset } from '../../../server/storage';
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export async function getUpgradeAnnouncementAction() {
    await requireAdmin();
    return getUpgradeAnnouncement();
}
export async function saveUpgradeAnnouncementAction(title: string, message: string, enabled: boolean) {
    await requireAdmin();
    try {
        return { success: true, announcement: await saveUpgradeAnnouncement(title, message, enabled) };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not save the announcement.' };
    }
}
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
    const owner = existing?.vendor_id || (session.role === 'admin' ? vendorId : session.vendorId);
    if (!owner) return { success: false, error: 'Vendor account is not linked to a valid vendor profile.' };
    const productRecordId = existing?.id || productId || `prod-${Date.now()}`;
    const uploadedFiles = formData.getAll('image_files').filter((v): v is File => v instanceof File && v.size > 0);
    if (uploadedFiles.length > 4) return { success: false, error: 'Upload a maximum of 4 product photos at a time.' };
    const uploadedImages: string[] = [];
    if (uploadedFiles.length) {
        for (const file of uploadedFiles) {
            if (file.size > 500 * 1024) return { success: false, error: `“${file.name}” exceeds the 500 KB upload ceiling. Select it again for browser optimization.` };
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
            uploadedImages.push(await uploadStoreAsset(`${owner}/products/${productRecordId}/${name.replace(/\.[^.]+$/, '.webp')}`, bytes, 'image/webp'));
        }
    }
    const price = Number(formData.get('price') || 0);
    if (!Number.isFinite(price) || price < 0) return { success: false, error: 'Enter a valid product price.' };
    const compareRaw = String(formData.get('compare_at_price') ?? '').trim();
    const sizePricesText = String(formData.get('size_prices_text') || '');
    const sizeLines = sizePricesText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const size_prices = sizeLines.map(line => {
        const priceParts = line.split(';');
        if (priceParts.length > 2)
            return null;
        const sizeParts = priceParts[0].split('|');
        if (sizeParts.length > 2)
            return null;
        const match = sizeParts[0].trim().match(/^(.+?)\s*(?:=|:)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/);
        const size = match?.[1].trim();
        const conventionalSize = sizeParts[1]?.trim();
        const sizeCompareRaw = priceParts[1]?.trim();
        const sizeCompare = sizeCompareRaw ? Number(sizeCompareRaw) : undefined;
        const currentSizePrice = match ? Number(match[2]) : NaN;
        if (!match || !size || size.length > 50 ||
            (sizeParts.length === 2 && (!conventionalSize || conventionalSize.length > 30)) ||
            (priceParts.length === 2 && (!sizeCompareRaw || sizeCompare === undefined || !Number.isFinite(sizeCompare) || sizeCompare <= currentSizePrice)))
            return null;
        return {
            size,
            price: currentSizePrice,
            ...(conventionalSize ? { conventional_size: conventionalSize } : {}),
            ...(sizeCompare !== undefined ? { compare_at_price: sizeCompare } : {}),
        };
    }).filter((v): v is { size: string; price: number; conventional_size?: string; compare_at_price?: number } => Boolean(v && Number.isFinite(v.price) && v.price >= 0));
    if (sizeLines.length && (size_prices.length !== sizeLines.length || size_prices.length > 20)) return { success: false, error: 'Check size pricing. Use “Size = Price”, optionally followed by “| Equivalent” and “; Previous price”. Each previous price must be greater than its size price, with no more than 20 sizes.' };
    if (new Set(size_prices.map(v => v.size.toLowerCase())).size !== size_prices.length) return { success: false, error: 'Each size can only be listed once.' };
    const compare = compareRaw ? Number(compareRaw) : undefined;
    const sizesUsingMainCompare = size_prices.filter(v => v.compare_at_price === undefined);
    const highestPriceUsingMainCompare = sizesUsingMainCompare.length
        ? Math.max(...sizesUsingMainCompare.map(v => v.price))
        : price;
    if (compareRaw && (compare === undefined || !Number.isFinite(compare) || compare <= highestPriceUsingMainCompare))
        return { success: false, error: 'The main previous price must be higher than every current size price without an individual previous price.' };
    const isAdmin = session.role === 'admin';
    const product: Product = { id: existing?.id || `prod-${Date.now()}`, vendor_id: owner, title: String(formData.get('title') || '').trim(), description: String(formData.get('description') || '').trim(), price, compare_at_price: compare, size_prices: size_prices.length ? size_prices : undefined, available_quantity: Math.max(0, Number(formData.get('available_quantity') || 0)), is_available: formData.get('is_available') === 'true' && Number(formData.get('available_quantity') || 0) > 0, giveaway: formData.get('giveaway') === 'true', giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined, images: (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 4), category: String(formData.get('category') || 'Other').trim(), tags: String(formData.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), likes_count: existing?.likes_count || 0, vendor_whatsapp: String(formData.get('vendor_whatsapp') || '').trim(), location: String(formData.get('location') || '').trim(), condition: (String(formData.get('condition') || 'new') as Product['condition']), detail_gallery_enabled: formData.get('detail_gallery_enabled') === 'true', is_latest: formData.get('is_latest') === 'true', is_top_selling: isAdmin ? formData.get('is_top_selling') === 'true' : existing?.is_top_selling || false, related_products_mode: (String(formData.get('related_products_mode') || 'category') as Product['related_products_mode']), related_product_ids: formData.getAll('related_product_ids').map(String).filter(Boolean).slice(0, 4) };
    product.id = productRecordId;
    try {
        await writeJson('products.json', productId ? products.map(p => p.id === productId ? product : p) : [...products, product]);
    } catch (error) {
        await Promise.all(uploadedImages.map(deleteStoreAsset));
        throw error;
    }
    await Promise.all((existing?.images || []).filter(image => !product.images.includes(image)).map(deleteStoreAssetIfUnused));
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/product/${product.id}`);
    return { success: true, product };
}
export async function deleteProductAction(id: string) {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'vendor'))
        return { success: false, error: 'Unauthorized' };
    const products = await readJson<Product[]>('products.json', []);
    const target = products.find(product => product.id === id);
    if (!target) return { success: false, error: 'Product not found' };
    if (session.role === 'vendor' && target.vendor_id !== session.vendorId)
        return { success: false, error: 'You cannot delete another vendor product.' };

    await writeJson('products.json', products.filter(product => product.id !== id));
    await Promise.all((target.images || []).filter(image => image.startsWith('/uploads/')).map(deleteStoreAssetIfUnused));
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    return { success: true };
}
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
    const vendors = await readJson<any[]>('vendors.json', []);
    const existingVendor = vendors.find(v => String(v.email || '').trim().toLowerCase() === email);
    const vendorId = existingVendor?.vendor_id || await nextId('VEN', 4, 'vendor');
    let supabaseUid = String(request.supabase_uid || '');
    const adminSupabase = createSupabaseAdminClient();
    if (!supabaseUid) {
        const { data: invitation, error: invitationError } = await adminSupabase.auth.admin.inviteUserByEmail(
            email,
            { redirectTo: getAuthCallbackUrl('/password-reset/complete') },
        );
        if (invitationError || !invitation.user) {
            console.error('Vendor Auth invitation failed:', invitationError?.message || 'No invited user returned.');
            return { success: false, error: 'Could not send the vendor account invitation. Configure SUPABASE_SECRET_KEY on the server or ask the vendor to reapply.' };
        }
        supabaseUid = invitation.user.id;
    }

    const { error: roleError } = await adminSupabase.auth.admin.updateUserById(supabaseUid, {
        app_metadata: { role: 'vendor', vendor_id: vendorId },
    });
    if (roleError) {
        console.error('Vendor Auth role assignment failed:', roleError.message);
        return { success: false, error: 'Could not activate the vendor account. Try again later.' };
    }

    const vendor = { ...existingVendor, vendor_id: vendorId, business_name: request.business_name, owner_name: request.owner_name, email, whatsapp_number: request.whatsapp_number, business_address: request.business_address, business_category: request.business_category, business_description: request.business_description, logo: request.logo || existingVendor?.logo || '', status: 'approved', created_at: existingVendor?.created_at || new Date().toISOString() };
    await writeJson('vendors.json', existingVendor
        ? vendors.map(v => v.vendor_id === vendorId ? vendor : v)
        : [...vendors, vendor]);
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
    if (!validEmail(email))
        return { success: false, error: 'Enter a valid email address.' };
    if (password.length < 12)
        return { success: false, error: 'Use a password of at least 12 characters.' };
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };
    const vendors = await readJson<any[]>('vendors.json', []);
    const requests = await readJson<any[]>('vendor_requests.json', []);
    if (vendors.some(v => String(v.email || '').trim().toLowerCase() === email && ['approved', 'active'].includes(String(v.status))) || requests.some(r => String(r.email || '').trim().toLowerCase() === email && r.status === 'pending'))
        return { success: false, error: 'This email is already registered or pending approval.' };
    const supabase = await createSupabaseServerClient();
    const { data: signup, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthCallbackUrl('/vendor/login') },
    });
    if (signupError || !signup.user || !signup.user.identities?.length)
        return { success: false, error: 'This email may already have an account. Sign in or request a password reset.' };
    const needsEmailConfirmation = !signup.session && !signup.user.email_confirmed_at;
    const requestId = await nextId('VREQ', 4, 'vendorRequest');
    const logoFile = data.get('business_logo');
    let logo = '';
    if (logoFile instanceof File && logoFile.size > 0) {
        if (logoFile.size > 500 * 1024) return { success: false, error: 'Business logos must be 500 KB or smaller after image optimization.' };
        const ext = path.extname(logoFile.name).toLowerCase();
        const safe = /^\.(jpg|jpeg|png|webp)$/.test(ext) ? ext : '.jpg';
        const fileName = `logo-${Date.now()}${safe}`;
        logo = await uploadStoreAsset(`vendor-requests/${requestId}/${fileName}`, Buffer.from(await logoFile.arrayBuffer()), logoFile.type || 'application/octet-stream');
    }
    const request = { request_id: requestId, status: 'pending', business_name: String(data.get('business_name') || '').trim(), owner_name: String(data.get('owner_name') || '').trim(), email, supabase_uid: signup.user.id, whatsapp_number: String(data.get('whatsapp_number') || '').trim(), business_address: String(data.get('business_address') || '').trim(), business_category: String(data.get('business_category') || '').trim(), business_description: String(data.get('business_description') || '').trim(), logo, created_at: new Date().toISOString() };
    try {
        await writeJson('vendor_requests.json', [...requests, request]);
    } catch (error) {
        if (logo) await deleteStoreAsset(logo);
        throw error;
    }
    if (signup.session) await supabase.auth.signOut();
    const siteSettings = await readJson<{ admin_whatsapp?: string }>('site_settings.json', { admin_whatsapp: '' });
    const adminWhatsApp = String(siteSettings.admin_whatsapp || '').replace(/\D/g, '');
    const message = ['Fussion vendor application', `Application: ${requestId}`, `Business: ${request.business_name}`, `Owner: ${request.owner_name}`, `Email: ${request.email}`, `WhatsApp: ${request.whatsapp_number}`, `Category: ${request.business_category}`, `Address: ${request.business_address}`, `Description: ${request.business_description}`, '', 'Please review this application in the Fussion Admin Dashboard and approve or reject it.'].join('\n');
    const whatsappUrl = adminWhatsApp.length >= 10 && adminWhatsApp.length <= 15 ? `https://wa.me/${adminWhatsApp}?text=${encodeURIComponent(message)}` : undefined;
    return { success: true, requestId, whatsappUrl, whatsappConfigured: Boolean(whatsappUrl), needsEmailConfirmation };
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
    await updateJson<Record<string, unknown>>('site_settings.json', current => ({ ...current, admin_whatsapp: normalized }), {});
    revalidatePath('/admin');
    revalidatePath('/vendor/register');
    return { success: true, phone: normalized };
}
export async function getVendorProductsAction() {
    const session = await requireVendor();
    const products = await readJson<Product[]>('products.json', []);
    return products.filter(product => product.vendor_id === session.vendorId);
}
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

export async function getBannerSettingsAction(): Promise<BannerSettings> {
    await requireAdmin();
    return getBannerSettings();
}

export async function saveBannerAction(formData: FormData) {
    await requireAdmin();
    try {
        const file = formData.get('image_file');
        const slide = await saveBanner({
            id: String(formData.get('id') || '').trim() || undefined,
            title: String(formData.get('title') || ''),
            description: String(formData.get('description') || ''),
            button_label: String(formData.get('button_label') || ''),
            button_url: String(formData.get('button_url') || ''),
            file: file instanceof File ? file : undefined,
        });
        revalidatePath('/');
        revalidatePath('/admin');
        return { success: true, slide };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not save the banner.' };
    }
}

export async function deleteBannerAction(id: string) {
    await requireAdmin();
    try {
        await removeBanner(id);
        revalidatePath('/');
        revalidatePath('/admin');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not delete the banner.' };
    }
}

export async function saveBannerIntervalAction(value: number, unit: BannerIntervalUnit) {
    await requireAdmin();
    try {
        const settings = await saveBannerInterval(value, unit);
        revalidatePath('/');
        revalidatePath('/admin');
        return { success: true, settings };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not update the carousel interval.' };
    }
}

export async function saveBrandSettingsAction(formData: FormData) {
    await requireAdmin();
    try {
        const file = formData.get('logo_file');
        const brand = await saveBrandSettings(
            String(formData.get('company_name') || ''),
            file instanceof File ? file : undefined,
            formData.get('remove_logo') === 'true',
        );
        revalidatePath('/', 'layout');
        return { success: true, brand };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not save company branding.' };
    }
}

export async function getOwnerAboutAction() {
    await requireAdmin();
    return getOwnerAbout();
}

export async function saveOwnerAboutAction(formData: FormData) {
    await requireAdmin();
    try {
        const profile = await saveOwnerAbout(formData);
        revalidatePath('/');
        revalidatePath('/about');
        revalidatePath('/admin');
        return { success: true, profile };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not save your About profile.' };
    }
}

export async function getAdminCustomerContentAction() {
    await requireAdmin();
    return getAdminCustomerContent();
}

export async function getAdminCustomerContentCountAction() {
    await requireAdmin();
    return getAdminCustomerContentCount();
}

export async function markCustomerInquiryReadAction(id: string) {
    await requireAdmin();
    try {
        const updated = await markCustomerInquiryRead(String(id || ''));
        if (!updated)
            return { success: false, error: 'Enquiry not found.' };
        revalidatePath('/admin');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not update the enquiry.' };
    }
}

export async function moderateProductFeedbackAction(id: string, status: 'approved' | 'rejected') {
    await requireAdmin();
    if (status !== 'approved' && status !== 'rejected')
        return { success: false, error: 'Choose a valid moderation status.' };
    try {
        const updated = await moderateProductFeedback(String(id || ''), status);
        if (!updated)
            return { success: false, error: 'Product feedback not found.' };
        revalidatePath('/admin');
        revalidatePath('/product/[id]', 'page');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not moderate product feedback.' };
    }
}

export async function deleteProductFeedbackAction(id: string) {
    await requireAdmin();
    try {
        const removed = await removeProductFeedback(String(id || ''));
        if (!removed)
            return { success: false, error: 'Product feedback not found.' };
        revalidatePath('/admin');
        revalidatePath('/product/[id]', 'page');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not delete product feedback.' };
    }
}
