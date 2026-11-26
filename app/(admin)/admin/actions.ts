'use server';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSession, requireAdmin, requireSuperAdmin, requireVendor } from '../../../lib/auth';
import { nextId, readJson, updateJson, updateProductsAtomically, writeJson } from '../../../lib/json-store';
import { Product, VendorAdminOverview, VendorProductAccess, VendorProductRequest, VendorProductRequestStatus } from '../../(public)/components/types/store';
import { deleteMusicTrack, getMusicTracks, getMusicSettings, saveMusicTrack, setMusicEnabled } from '../../../lib/music';
import { getBannerSettings, removeBanner, saveBanner, saveBannerInterval } from '../../../lib/banners';
import type { BannerIntervalUnit, BannerSettings } from '../../(public)/components/types/store';
import { getBrandSettings, saveBrandSettings } from '../../../lib/branding';
import { getOwnerAbout, saveOwnerAbout } from '../../../lib/about';
import { getAdminCustomerContent, getAdminCustomerContentCount, markCustomerInquiryRead, moderateProductFeedback, removeProductFeedback } from '../../../lib/customer-content';
import { getUpgradeAnnouncement, saveUpgradeAnnouncement } from '../../../lib/announcements';
import { createSupabaseAdminClient } from '../../../server/supabase-admin';
import { createSupabaseServerClient, getAuthCallbackUrl } from '../../../server/supabase';
import { createVendorVerificationSignedUrl, deleteProductImage, deleteStoreAsset, deleteStoreAssetIfUnused, deleteVendorVerificationFile, uploadCompressedProductImage, uploadStoreAsset, uploadVendorVerificationFile } from '../../../server/storage';
import { prisma } from '../../../server/db';
import { isValidProductCategoryPair, normalizeSelectedProductSubcategory, PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';
import { isValidProductImage, productImageContentType } from '../../../lib/product-image-validation';
import { authorizeVendorProductSubmission, matchesApprovedProductRequest } from '../../../lib/vendor-product-permissions';
import { DEFAULT_VENDOR_ONBOARDING_SETTINGS, isVendorAccessActive, normalizeVendorOnboardingSettings, type VendorOnboardingSettings } from '../../../lib/vendor-onboarding';
import { validateVendorDocumentFile } from '../../../lib/vendor-document-validation';
import { checkPasswordAgainstBreaches } from '../../../lib/password-security';
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

class ProductActionError extends Error {}

type VendorRegistrationRecord = {
    [key: string]: unknown;
    email?: string;
    status?: string;
};

async function findSupabaseUserIdByEmail(email: string) {
    const admin = createSupabaseAdminClient();
    const normalizedEmail = email.trim().toLowerCase();
    for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const existing = data.users.find(user => user.email?.trim().toLowerCase() === normalizedEmail);
        if (existing) return existing.id;
        if (data.users.length < 1000) return undefined;
    }
}

export async function getSubAdminsAction() {
    await requireSuperAdmin();
    const supabase = createSupabaseAdminClient();
    const users: Array<{ id: string; email: string; created_at: string }> = [];
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error('Could not load administrator accounts.');
        users.push(...data.users.filter(user => user.app_metadata?.role === 'admin').map(user => ({ id: user.id, email: user.email || '', created_at: user.created_at })));
        if (data.users.length < 1000) break;
    }
    return users.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function inviteSubAdminAction(emailInput: string) {
    await requireSuperAdmin();
    const email = emailInput.trim().toLowerCase();
    if (!validEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    try {
        const supabase = createSupabaseAdminClient();
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: getAuthCallbackUrl('/admin'), data: { invited_as: 'sub_admin' } });
        if (error || !data.user) return { success: false, error: 'Could not invite this sub-admin. Check whether the email already has an account.' };
        const { error: roleError } = await supabase.auth.admin.updateUserById(data.user.id, { app_metadata: { role: 'admin' } });
        if (roleError) {
            await supabase.auth.admin.deleteUser(data.user.id);
            return { success: false, error: 'The invite could not be assigned administrator access.' };
        }
        revalidatePath('/admin');
        return { success: true };
    } catch {
        return { success: false, error: 'Could not invite this sub-admin right now.' };
    }
}

export async function revokeSubAdminAction(userId: string) {
    await requireSuperAdmin();
    if (!userId) return { success: false, error: 'Invalid administrator account.' };
    const supabase = createSupabaseAdminClient();
    const { data, error: lookupError } = await supabase.auth.admin.getUserById(userId);
    if (lookupError || data.user?.app_metadata?.role !== 'admin') return { success: false, error: 'Sub-admin account was not found.' };
    const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: { role: 'revoked' } });
    if (error) return { success: false, error: 'Could not revoke this sub-admin.' };
    revalidatePath('/admin');
    return { success: true };
}

export async function deleteSubAdminAction(userId: string) {
    await requireSuperAdmin();
    if (!userId) return { success: false, error: 'Invalid administrator account.' };
    const supabase = createSupabaseAdminClient();
    const { data, error: lookupError } = await supabase.auth.admin.getUserById(userId);
    if (lookupError || data.user?.app_metadata?.role !== 'admin') return { success: false, error: 'Sub-admin account was not found.' };
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return { success: false, error: 'Could not delete this sub-admin.' };
    revalidatePath('/admin');
    return { success: true };
}
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
export async function getProductVendorContextAction(productId: string) {
    await requireAdmin();
    const [products, vendors] = await Promise.all([
        readJson<Product[]>('products.json', []),
        readJson<Array<{ vendor_id?: string; business_name?: string; owner_name?: string; email?: string; whatsapp_number?: string; status?: string }>>('vendors.json', []),
    ]);
    const product = products.find(item => item.id === productId);
    if (!product) return { success: false as const, error: 'Product not found.' };
    const vendor = vendors.find(item => item.vendor_id === product.vendor_id);
    return {
        success: true as const,
        vendor: vendor ? {
            vendor_id: String(vendor.vendor_id || ''),
            business_name: String(vendor.business_name || ''),
            owner_name: String(vendor.owner_name || ''),
            email: String(vendor.email || ''),
            whatsapp_number: String(vendor.whatsapp_number || ''),
            status: String(vendor.status || ''),
        } : null,
        products: products.filter(item => item.vendor_id === product.vendor_id),
    };
}
export async function saveProductAction(formData: FormData, vendorId: string, productId?: string) {
    const session = await getSession();
    if (!session)
        return { success: false, error: 'Unauthorized' };
    if (session.role !== 'admin' && session.role !== 'super_admin' && session.role !== 'vendor')
        return { success: false, error: 'Unauthorized' };
    if (session.role === 'vendor' && session.renewalOnly)
        return { success: false, error: 'Your access expired. Request a monthly renewal to restore product management.' };
    if (session.role === 'vendor' && session.vendorId !== vendorId)
        return { success: false, error: 'You cannot use another vendor account.' };
    const products = await readJson<Product[]>('products.json', []);
    const existing = productId ? products.find(p => p.id === productId) : undefined;
    if (productId && !existing)
        return { success: false, error: 'Product not found' };
    if (session.role === 'vendor' && existing && existing.vendor_id !== session.vendorId)
        return { success: false, error: 'You cannot edit another vendor’s product.' };
    const owner = existing?.vendor_id || (session.role !== 'vendor' ? vendorId : session.vendorId);
    if (!owner) return { success: false, error: 'Vendor account is not linked to a valid vendor profile.' };
    const productRecordId = existing?.id || productId || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const category = String(formData.get('category') || '').trim();
    const brand = String(formData.get('brand') || 'Unbranded').trim().replace(/\s+/g, ' ');
    const selectedSubcategory = String(formData.get('subcategory') || '').trim();
    const customSubcategory = String(formData.get('subcategory_custom') || '');
    const subcategory = normalizeSelectedProductSubcategory(
        selectedSubcategory,
        customSubcategory,
    ) || (session.role === 'vendor' && selectedSubcategory === 'Other' && !customSubcategory.trim() ? 'Other' : '');
    if (!title || title.length > 150) return { success: false, error: 'Product name is required and must be 150 characters or fewer.' };
    if (!brand || brand.length > 80) return { success: false, error: 'Enter a valid product brand (or use “Unbranded”).' };
    if (!description || description.length > 5000) return { success: false, error: 'Product description is required and must be 5,000 characters or fewer.' };
    if (!subcategory || !isValidProductCategoryPair(category, subcategory)) {
        const unchangedLegacyCategory = Boolean(existing) &&
            category === existing?.category &&
            subcategory === (existing?.subcategory || '');
        if (!unchangedLegacyCategory) return { success: false, error: 'Select a valid main category and subcategory.' };
    }

    let preflightPermission: ReturnType<typeof authorizeVendorProductSubmission> | undefined;
    const vendorEntitlements = session.role === 'vendor' ? await prisma.vendor.findUnique({
        where: { vendorId: owner },
        select: { maxProducts: true, allowedCategories: true, allowedBrands: true, categoryBrands: true, subscriptionStatus: true, subscriptionExpiresAt: true },
    }) : null;
    if (session.role === 'vendor') {
        if (vendorEntitlements?.subscriptionStatus && vendorEntitlements.subscriptionStatus !== 'active')
            return { success: false, error: 'Your subscription is not active. Request renewal from the vendor dashboard.' };
        if (vendorEntitlements?.subscriptionExpiresAt && Date.parse(vendorEntitlements.subscriptionExpiresAt) <= Date.now())
            return { success: false, error: 'Your subscription has expired. Request renewal from the vendor dashboard.' };
        if (vendorEntitlements?.maxProducts != null && !vendorEntitlements.allowedCategories.includes(category))
            return { success: false, error: 'This product category is not unlocked for your vendor account.' };
        if (vendorEntitlements?.maxProducts != null && !vendorEntitlements.allowedBrands.includes(brand))
            return { success: false, error: 'This product brand is not unlocked for your vendor account.' };
        if (vendorEntitlements?.categoryBrands && typeof vendorEntitlements.categoryBrands === 'object') {
            const categoryBrands = vendorEntitlements.categoryBrands as Record<string, unknown>;
            const brandsForCategory = categoryBrands[category];
            if (Array.isArray(brandsForCategory) && !brandsForCategory.includes(brand))
                return { success: false, error: 'This brand is not unlocked within the selected category.' };
        }
        if (!existing && vendorEntitlements?.maxProducts !== null && vendorEntitlements?.maxProducts !== undefined && products.filter(item => item.vendor_id === owner).length >= vendorEntitlements.maxProducts)
            return { success: false, error: 'You have used all product slots. Request an extra slot pack to add five more.' };
        const policy = await prisma.vendorProductPolicy.findUnique({ where: { vendorId: owner } });
        if (!policy) return { success: false, error: 'Your vendor account has no product upload policy. Contact an administrator.' };
        if (existing) {
            if (category !== existing.category || subcategory !== (existing.subcategory || '')) {
                return { success: false, error: 'Product categories cannot be changed after publication. Request approval for another product instead.' };
            }
            const approvedRequest = await prisma.vendorProductRequest.findFirst({
                where: { vendorId: owner, publishedProductId: existing.id, status: 'approved' },
            });
            if (approvedRequest && !matchesApprovedProductRequest(approvedRequest, { category, subcategory, title, description })) {
                return { success: false, error: 'Product name, description, category, and subcategory are fixed by its approved request.' };
            }
        } else if (vendorEntitlements?.maxProducts == null) {
            const requests = await prisma.vendorProductRequest.findMany({
                where: { vendorId: owner, status: 'approved', fulfilledAt: null, publishedProductId: null },
            });
            preflightPermission = authorizeVendorProductSubmission(
                {
                    mainCategory: policy.mainCategory,
                    subcategory: policy.subcategory,
                    initialPermissionAvailable: policy.initialProductPublishedAt === null &&
                        !products.some(item => item.vendor_id === owner),
                },
                requests.map(request => ({
                    requestId: request.requestId,
                    mainCategory: request.mainCategory,
                    subcategory: request.subcategory,
                    productName: request.productName,
                    productDescription: request.productDescription,
                    status: request.status,
                    fulfilledAt: request.fulfilledAt,
                })),
                { category, subcategory, title, description },
                String(formData.get('product_permission_request_id') || '').trim() || undefined,
            );
            if (!preflightPermission.allowed) return { success: false, error: preflightPermission.error };
        }
    }

    const uploadedFiles = formData.getAll('image_files').filter((v): v is File => v instanceof File && v.size > 0);
    if (uploadedFiles.length > 3) return { success: false, error: 'Upload a maximum of 3 product photos at a time.' };
    const uploadedImages: string[] = [];
    const productImageBytes: Buffer[] = [];
    if (uploadedFiles.length) {
        for (const file of uploadedFiles) {
            if (file.size > 70 * 1024) return { success: false, error: `“${file.name}” exceeds the 70 KB product image limit. Select it again for compression.` };
            if (file.type !== 'image/webp' || path.extname(file.name).toLowerCase() !== '.webp')
                return { success: false, error: `“${file.name}” must be a compressed WebP product image.` };
            const bytes = Buffer.from(await file.arrayBuffer());
            if (!isValidProductImage('.webp', bytes)) return { success: false, error: `“${file.name}” is not a valid WebP image.` };
            productImageBytes.push(bytes);
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
    const isAdmin = session.role !== 'vendor';
    try {
        for (const bytes of productImageBytes) uploadedImages.push(await uploadCompressedProductImage(owner, productRecordId, bytes));
    } catch (error) {
        await Promise.all(uploadedImages.map(async image => {
            try { await deleteStoreAsset(image); }
            catch (cleanupError) { console.error('Could not remove a partially uploaded product image:', { image, cleanupError }); }
        }));
        return { success: false, error: error instanceof Error ? error.message : 'Could not upload product images.' };
    }
    const availableQuantity = Math.max(0, Number(formData.get('available_quantity') || 0));
    const productImages = (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 3);
    const product: Product = {
        id: productRecordId,
        created_at: existing?.created_at || new Date().toISOString(),
        vendor_id: owner,
        title,
        description,
        price,
        compare_at_price: compare,
        size_prices: size_prices.length ? size_prices : undefined,
        available_quantity: availableQuantity,
        is_available: availableQuantity > 0,
        giveaway: formData.get('giveaway') === 'true',
        giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined,
        images: productImages,
        category,
        subcategory,
        brand,
        tags: String(formData.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
        likes_count: existing?.likes_count || 0,
        vendor_whatsapp: String(formData.get('vendor_whatsapp') || '').trim(),
        location: String(formData.get('location') || '').trim(),
        condition: String(formData.get('condition') || 'new') as Product['condition'],
        detail_gallery_enabled: productImages.length > 1,
        is_latest: existing?.is_latest || false,
        is_top_selling: isAdmin ? formData.get('is_top_selling') === 'true' : existing?.is_top_selling || false,
        is_featured: existing?.is_featured || false,
        featured_until: existing?.featured_until,
        related_products_mode: String(formData.get('related_products_mode') || 'category') as Product['related_products_mode'],
        related_product_ids: formData.getAll('related_product_ids').map(String).filter(Boolean).slice(0, 4),
    };
    try {
        const savedProduct = await updateProductsAtomically<Product, Product>(async (current, tx) => {
            const currentExisting = productId ? current.find(item => item.id === productId) : undefined;
            if (productId && !currentExisting) throw new ProductActionError('Product not found.');
            const transactionEntitlements = session.role === 'vendor' ? await tx.vendor.findUnique({
                where: { vendorId: owner },
                select: { maxProducts: true, allowedCategories: true, allowedBrands: true, categoryBrands: true, subscriptionStatus: true, subscriptionExpiresAt: true },
            }) : null;
            if (session.role === 'vendor' && transactionEntitlements?.maxProducts != null) {
                if (transactionEntitlements.subscriptionStatus && transactionEntitlements.subscriptionStatus !== 'active') throw new ProductActionError('Your subscription is not active. Request renewal from the vendor dashboard.');
                if (transactionEntitlements.subscriptionExpiresAt && Date.parse(transactionEntitlements.subscriptionExpiresAt) <= Date.now()) throw new ProductActionError('Your subscription has expired. Request renewal from the vendor dashboard.');
                if (!transactionEntitlements.allowedCategories.includes(category)) throw new ProductActionError('This product category is not unlocked for your vendor account.');
                if (!transactionEntitlements.allowedBrands.includes(brand)) throw new ProductActionError('This product brand is not unlocked for your vendor account.');
                if (transactionEntitlements.categoryBrands && typeof transactionEntitlements.categoryBrands === 'object') {
                    const categoryBrands = transactionEntitlements.categoryBrands as Record<string, unknown>;
                    const brandsForCategory = categoryBrands[category];
                    if (Array.isArray(brandsForCategory) && !brandsForCategory.includes(brand)) throw new ProductActionError('This brand is not unlocked within the selected category.');
                }
            }
            let approvedRequestImage: string | undefined;
            if (session.role === 'vendor') {
                if (currentExisting && currentExisting.vendor_id !== session.vendorId) {
                    throw new ProductActionError('You cannot edit another vendor’s product.');
                }
                if (currentExisting) {
                    if (category !== currentExisting.category || subcategory !== (currentExisting.subcategory || '')) {
                        throw new ProductActionError('Product categories cannot be changed after publication. Request approval for another product instead.');
                    }
                    const approvedRequest = await tx.vendorProductRequest.findFirst({
                        where: { vendorId: owner, publishedProductId: currentExisting.id, status: 'approved' },
                    });
                    if (approvedRequest && !matchesApprovedProductRequest(approvedRequest, { category, subcategory, title, description })) {
                        throw new ProductActionError('Product name, description, category, and subcategory are fixed by its approved request.');
                    }
                    if (approvedRequest?.productImage && uploadedImages.length) {
                        throw new ProductActionError('The product image is fixed by its approved request.');
                    }
                } else if (transactionEntitlements?.maxProducts != null) {
                    if (current.filter(item => item.vendor_id === owner).length >= transactionEntitlements.maxProducts) {
                        throw new ProductActionError('You have used all product slots. Request an extra slot pack to add five more.');
                    }
                    const currentPolicy = await tx.vendorProductPolicy.findUnique({ where: { vendorId: owner } });
                    if (currentPolicy?.initialProductPublishedAt === null) {
                        await tx.vendorProductPolicy.updateMany({
                            where: { vendorId: owner, initialProductPublishedAt: null, initialProductId: null },
                            data: { initialProductId: product.id, initialProductPublishedAt: new Date().toISOString() },
                        });
                    }
                } else {
                    const policy = await tx.vendorProductPolicy.findUnique({ where: { vendorId: owner } });
                    const requests = await tx.vendorProductRequest.findMany({
                        where: { vendorId: owner, status: 'approved', fulfilledAt: null, publishedProductId: null },
                    });
                    const permission = authorizeVendorProductSubmission(
                        policy ? {
                            mainCategory: policy.mainCategory,
                            subcategory: policy.subcategory,
                            initialPermissionAvailable: policy.initialProductPublishedAt === null &&
                                !current.some(item => item.vendor_id === owner),
                        } : null,
                        requests.map(request => ({
                            requestId: request.requestId,
                            mainCategory: request.mainCategory,
                            subcategory: request.subcategory,
                            productName: request.productName,
                            productDescription: request.productDescription,
                            status: request.status,
                            fulfilledAt: request.fulfilledAt,
                        })),
                        { category, subcategory, title, description },
                        String(formData.get('product_permission_request_id') || '').trim() || undefined,
                    );
                    if (!permission.allowed) throw new ProductActionError(permission.error);

                    const now = new Date().toISOString();
                    const grant = permission.grant;
                    if (grant.type === 'initial') {
                        const claimed = await tx.vendorProductPolicy.updateMany({
                            where: { vendorId: owner, initialProductPublishedAt: null, initialProductId: null },
                            data: { initialProductId: product.id, initialProductPublishedAt: now },
                        });
                        if (claimed.count !== 1) throw new ProductActionError('The first product permission was already used. Refresh and check your product requests.');
                    } else {
                        const approvedRequest = requests.find(request => request.requestId === grant.requestId);
                        if (approvedRequest?.productImage) {
                            if (uploadedImages.length) {
                                throw new ProductActionError('Use the product image submitted with this approved request.');
                            }
                            approvedRequestImage = approvedRequest.productImage;
                        }
                        const claimed = await tx.vendorProductRequest.updateMany({
                            where: {
                                requestId: grant.requestId,
                                vendorId: owner,
                                status: 'approved',
                                fulfilledAt: null,
                                publishedProductId: null,
                            },
                            data: { publishedProductId: product.id, fulfilledAt: now },
                        });
                        if (claimed.count !== 1) throw new ProductActionError('This product approval was already used. Refresh the dashboard and try again.');
                    }
                }
            }
            const saved = {
                ...product,
                ...(approvedRequestImage ? { images: [approvedRequestImage] } : {}),
                likes_count: currentExisting?.likes_count || 0,
            };
            const nextProducts = productId
                ? current.map(item => item.id === productId ? saved : item)
                : [...current, saved];
            const firstLatestIndex = Math.max(0, nextProducts.length - 8);
            const productsWithLatestDrops = nextProducts.map((item, index) => ({
                ...item,
                is_latest: index >= firstLatestIndex,
            }));
            return {
                next: productsWithLatestDrops,
                result: productsWithLatestDrops.find(item => item.id === saved.id)!,
            };
        });
        Object.assign(product, savedProduct);
    } catch (error) {
        await Promise.all(uploadedImages.map(async image => {
            try { await deleteStoreAsset(image); }
            catch (cleanupError) { console.error('Could not roll back an uncommitted product image:', { image, cleanupError }); }
        }));
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        throw error;
    }
    await Promise.all((existing?.images || []).filter(image => !product.images.includes(image)).map(deleteProductImage));
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/product/${product.id}`);
    return { success: true, product };
}
export async function deleteProductAction(id: string) {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'super_admin' && session.role !== 'vendor'))
        return { success: false, error: 'Unauthorized' };
    if (session.role === 'vendor' && session.renewalOnly)
        return { success: false, error: 'Your access expired. Request a monthly renewal to restore product management.' };
    let target: Product | undefined;
    try {
        await updateProductsAtomically<Product, void>(async current => {
            target = current.find(product => product.id === id);
            if (!target) throw new ProductActionError('Product not found.');
            if (session.role === 'vendor' && target.vendor_id !== session.vendorId) {
                throw new ProductActionError('You cannot delete another vendor product.');
            }
            return { next: current.filter(product => product.id !== id), result: undefined };
        });
    } catch (error) {
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        throw error;
    }
    if (!target) return { success: false, error: 'Product not found.' };
    await Promise.all((target.images || []).map(deleteProductImage));
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    return { success: true };
}

async function revokePublishedVendorProduct(adminEmail: string, productId: string, reason: string) {
    const auditRequestId = await nextId('VPRQ', 4, 'vendorProductRequest');
    let removedImages: string[] = [];
    try {
        await prisma.$transaction(async tx => {
            const product = await tx.product.findUnique({ where: { id: productId } });
            const existingRequest = await tx.vendorProductRequest.findUnique({
                where: { publishedProductId: productId },
            });
            if (!product && !existingRequest) throw new ProductActionError('Product not found.');

            const now = new Date().toISOString();
            if (existingRequest) {
                await tx.vendorProductRequest.update({
                    where: { requestId: existingRequest.requestId },
                    data: {
                        status: 'revoked',
                        adminComment: reason,
                        reviewedBy: adminEmail,
                        reviewedAt: now,
                    },
                });
            } else if (product) {
                await tx.vendorProductRequest.create({
                    data: {
                        requestId: auditRequestId,
                        vendorId: product.vendorId,
                        mainCategory: product.category,
                        subcategory: product.subcategory || '',
                        productName: product.title,
                        productDescription: product.description,
                        productImage: product.images[0] || null,
                        reason: 'Initial or unmatched product permission revoked by an administrator.',
                        status: 'revoked',
                        adminComment: reason,
                        reviewedBy: adminEmail,
                        createdAt: now,
                        reviewedAt: now,
                        publishedProductId: product.id,
                        fulfilledAt: now,
                    },
                });
            }

            if (product) {
                removedImages = product.images;
                await tx.product.delete({ where: { id: productId } });
            }
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        throw error;
    }

    await Promise.all(removedImages.map(deleteProductImage));
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/product/${productId}`);
    return { success: true };
}

export async function revokeVendorProductAction(productId: string, reason: string) {
    const admin = await requireAdmin();
    const id = String(productId || '').trim();
    const comment = String(reason || '').trim();
    if (!id) return { success: false, error: 'Select a vendor product to revoke.' };
    if (!comment) return { success: false, error: 'Add a reason for revoking this product.' };
    if (comment.length > 2000) return { success: false, error: 'The revocation reason must be 2,000 characters or fewer.' };
    return revokePublishedVendorProduct(admin.email, id, comment);
}

export async function revokeVendorProductRequestAction(requestId: string, reason: string) {
    const admin = await requireAdmin();
    const id = String(requestId || '').trim();
    const comment = String(reason || '').trim();
    if (!id) return { success: false, error: 'Select a vendor product approval to revoke.' };
    if (!comment) return { success: false, error: 'Add a reason for revoking this approval.' };
    if (comment.length > 2000) return { success: false, error: 'The revocation reason must be 2,000 characters or fewer.' };

    const request = await prisma.vendorProductRequest.findUnique({ where: { requestId: id } });
    if (!request || request.status !== 'approved') {
        return { success: false, error: 'Only an approved product permission can be revoked.' };
    }
    if (request.publishedProductId) {
        return revokePublishedVendorProduct(admin.email, request.publishedProductId, comment);
    }

    const result = await prisma.vendorProductRequest.updateMany({
        where: { requestId: id, status: 'approved', publishedProductId: null, fulfilledAt: null },
        data: {
            status: 'revoked',
            adminComment: comment,
            reviewedBy: admin.email,
            reviewedAt: new Date().toISOString(),
        },
    });
    if (result.count !== 1) return { success: false, error: 'This product permission was already used or revoked.' };
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    return { success: true };
}

function toVendorProductRequest(row: {
    requestId: string;
    vendorId: string;
    mainCategory: string;
    subcategory: string;
    productName: string;
    productDescription: string;
    productImage: string | null;
    reason: string;
    status: string;
    adminComment: string | null;
    reviewedBy: string | null;
    createdAt: string;
    reviewedAt: string | null;
    publishedProductId: string | null;
    fulfilledAt: string | null;
}): VendorProductRequest {
    return {
        request_id: row.requestId,
        vendor_id: row.vendorId,
        main_category: row.mainCategory,
        subcategory: row.subcategory,
        product_name: row.productName,
        product_description: row.productDescription,
        product_image: row.productImage || undefined,
        reason: row.reason,
        status: row.status as VendorProductRequestStatus,
        admin_comment: row.adminComment || undefined,
        reviewed_by: row.reviewedBy || undefined,
        created_at: row.createdAt,
        reviewed_at: row.reviewedAt || undefined,
        published_product_id: row.publishedProductId || undefined,
        fulfilled_at: row.fulfilledAt || undefined,
    };
}

export async function getVendorProductAccessAction(): Promise<VendorProductAccess | null> {
    const session = await requireVendor();
    const [policy, publishedProducts, requests, approvedRequests, entitlements] = await Promise.all([
        prisma.vendorProductPolicy.findUnique({ where: { vendorId: session.vendorId } }),
        prisma.product.count({ where: { vendorId: session.vendorId } }),
        prisma.vendorProductRequest.findMany({
            where: { vendorId: session.vendorId },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.vendorProductRequest.findMany({
            where: {
                vendorId: session.vendorId,
                status: 'approved',
                fulfilledAt: null,
                publishedProductId: null,
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.vendor.findUnique({ where: { vendorId: session.vendorId }, select: { maxProducts: true, allowedCategories: true, allowedBrands: true, categoryBrands: true, subscriptionExpiresAt: true } }),
    ]);
    if (!policy) return null;
    const initialPermissionAvailable = policy.initialProductPublishedAt === null && publishedProducts === 0;
    return {
        main_category: policy.mainCategory,
        subcategory: policy.subcategory,
        initial_permission_available: initialPermissionAvailable,
        published_products: publishedProducts,
        remaining_permissions: entitlements?.maxProducts != null
            ? Math.max(0, entitlements.maxProducts - publishedProducts)
            : Number(initialPermissionAvailable) + approvedRequests.length,
        requests: requests.map(toVendorProductRequest),
        approved_requests: approvedRequests.map(toVendorProductRequest),
        plan_enabled: entitlements?.maxProducts != null,
        max_products: entitlements?.maxProducts,
        allowed_categories: entitlements?.allowedCategories,
        allowed_brands: entitlements?.allowedBrands,
        category_brands: entitlements?.categoryBrands as Record<string, string[]> | null | undefined,
        subscription_expires_at: entitlements?.subscriptionExpiresAt,
    };
}

const VENDOR_UPGRADE_PRICES = { monthly_renewal: 1000, extra_brand: 500, extra_category: 1000, extra_slots: 300, featured_boost: 500 } as const;
type VendorUpgradeType = keyof typeof VENDOR_UPGRADE_PRICES;

async function requireUpgradeRequestVendor() {
    const session = await getSession();
    if (!session || session.role !== 'vendor' || !session.vendorId) throw new Error('Unauthorized');
    return session as typeof session & { vendorId: string };
}

export async function createVendorUpgradeRequestAction(typeInput: string, valueInput = '') {
    const session = await requireUpgradeRequestVendor();
    if (!Object.prototype.hasOwnProperty.call(VENDOR_UPGRADE_PRICES, typeInput)) return { success: false, error: 'Choose a valid upgrade.' };
    const type = typeInput as VendorUpgradeType;
    if (session.renewalOnly && type !== 'monthly_renewal') return { success: false, error: 'Your access expired. Request a monthly renewal to restore the vendor workspace.' };
    const value = valueInput.trim();
    if (value.length > 180) return { success: false, error: 'The requested value is too long.' };
    if ((type === 'extra_brand' || type === 'extra_category' || type === 'featured_boost') && !value)
        return { success: false, error: 'Choose the category, brand, or product for this request.' };
    if (type === 'featured_boost') {
        const product = await prisma.product.findFirst({ where: { id: value, vendorId: session.vendorId }, select: { id: true } });
        if (!product) return { success: false, error: 'Select one of your own products to feature.' };
    }
    if (type === 'extra_brand') {
        let parsed: { category?: string; brand?: string };
        try { parsed = JSON.parse(value); } catch { return { success: false, error: 'Choose a category and brand.' }; }
        if (!parsed.category?.trim() || !parsed.brand?.trim() || parsed.brand.length > 80) return { success: false, error: 'Choose a category and a brand name.' };
    }
    const [vendorAccess, legacyPolicy, legacyProducts] = await Promise.all([
        prisma.vendor.findUnique({ where: { vendorId: session.vendorId }, select: { maxProducts: true, allowedCategories: true, allowedBrands: true, categoryBrands: true } }),
        prisma.vendorProductPolicy.findUnique({ where: { vendorId: session.vendorId }, select: { mainCategory: true } }),
        prisma.product.findMany({ where: { vendorId: session.vendorId }, select: { category: true, brand: true } }),
    ]);
    const unlockedCategories = vendorAccess?.maxProducts != null
        ? vendorAccess.allowedCategories
        : [...new Set([...(legacyPolicy ? [legacyPolicy.mainCategory] : []), ...legacyProducts.map(product => product.category)])];
    const brandsByCategory = (vendorAccess?.categoryBrands || {}) as Record<string, unknown>;
    if (vendorAccess?.maxProducts == null) {
        for (const currentCategory of unlockedCategories) {
            brandsByCategory[currentCategory] = [...new Set(legacyProducts.filter(product => product.category === currentCategory).map(product => product.brand || 'Unbranded'))];
            if (!(brandsByCategory[currentCategory] as unknown[]).length) brandsByCategory[currentCategory] = ['Unbranded'];
        }
    }
    if (type === 'extra_category') {
        if (!(PRODUCT_MAIN_CATEGORIES as readonly string[]).includes(value)) return { success: false, error: 'Choose a valid product category.' };
        if (unlockedCategories.includes(value)) return { success: false, error: 'This category is already unlocked.' };
    }
    if (type === 'extra_brand') {
        const parsed = JSON.parse(value) as { category: string; brand: string };
        if (!(PRODUCT_MAIN_CATEGORIES as readonly string[]).includes(parsed.category)) return { success: false, error: 'Choose a valid product category.' };
        if (!unlockedCategories.includes(parsed.category)) return { success: false, error: 'Unlock this category before adding a brand to it.' };
        const brands = brandsByCategory[parsed.category];
        if (Array.isArray(brands) && brands.includes(parsed.brand.trim())) return { success: false, error: 'This brand is already unlocked in the selected category.' };
    }
    const siteSettings = await readJson<Record<string, unknown>>('site_settings.json', {});
    const billing = normalizeVendorOnboardingSettings(siteSettings.vendor_application);
    if (!billing.payment_instructions.trim()) return { success: false, error: 'The store admin has not configured bank transfer instructions yet.' };
    const existing = await prisma.vendorUpgradeRequest.findFirst({ where: { vendorId: session.vendorId, requestType: type, requestedValue: value, status: 'pending' } });
    if (existing) return { success: false, error: `This request is already pending with reference ${existing.referenceCode}.` };
    const id = await nextId('VUP', 5, 'vendorUpgradeRequest');
    const referenceCode = `VND-${randomBytes(3).toString('hex').toUpperCase()}`;
    try {
        await prisma.vendorUpgradeRequest.create({ data: {
            id, vendorId: session.vendorId, requestType: type, requestedValue: value,
            amountNaira: VENDOR_UPGRADE_PRICES[type], referenceCode, status: 'pending', createdAt: new Date().toISOString(),
        } });
    } catch (error) {
        console.error('Vendor add-on request creation failed:', error);
        return { success: false, error: 'Could not create the transfer request. Please try again.' };
    }
    revalidatePath('/vendor/dashboard');
    revalidatePath('/admin');
    return { success: true, reference_code: referenceCode, amount_naira: VENDOR_UPGRADE_PRICES[type], payment_instructions: billing.payment_instructions };
}

export async function getVendorUpgradeRequestsAction() {
    const session = await requireUpgradeRequestVendor();
    const [requests, settings] = await Promise.all([
        prisma.vendorUpgradeRequest.findMany({ where: { vendorId: session.vendorId }, orderBy: { createdAt: 'desc' } }),
        readJson<Record<string, unknown>>('site_settings.json', {}),
    ]);
    const billing = normalizeVendorOnboardingSettings(settings.vendor_application);
    const [vendor, policy, products] = await Promise.all([
        prisma.vendor.findUnique({ where: { vendorId: session.vendorId }, select: { maxProducts: true, allowedCategories: true, allowedBrands: true, categoryBrands: true, subscriptionExpiresAt: true } }),
        prisma.vendorProductPolicy.findUnique({ where: { vendorId: session.vendorId }, select: { mainCategory: true } }),
        prisma.product.findMany({ where: { vendorId: session.vendorId }, select: { category: true, brand: true } }),
    ]);
    const fallbackCategories = [...new Set([...(policy ? [policy.mainCategory] : []), ...products.map(product => product.category)])];
    const fallbackBrands = [...new Set(products.map(product => product.brand || 'Unbranded'))];
    return {
        requests: requests.map(request => ({ id: request.id, request_type: request.requestType, requested_value: request.requestedValue, amount_naira: request.amountNaira, reference_code: request.referenceCode, status: request.status, created_at: request.createdAt })),
        payment_instructions: billing.payment_instructions,
        entitlements: vendor ? { max_products: vendor.maxProducts, allowed_categories: vendor.maxProducts == null ? fallbackCategories : vendor.allowedCategories, allowed_brands: vendor.maxProducts == null ? fallbackBrands : vendor.allowedBrands, category_brands: vendor.maxProducts == null ? Object.fromEntries(fallbackCategories.map(category => [category, [...new Set(products.filter(product => product.category === category).map(product => product.brand || 'Unbranded'))].length ? [...new Set(products.filter(product => product.category === category).map(product => product.brand || 'Unbranded'))] : ['Unbranded']])) : vendor.categoryBrands as Record<string, string[]> | null, subscription_expires_at: vendor.subscriptionExpiresAt } : null,
    };
}

export async function getAdminVendorUpgradeRequestsAction() {
    await requireAdmin();
    const rows = await prisma.vendorUpgradeRequest.findMany({ where: { status: 'pending' }, include: { vendor: { select: { businessName: true, email: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map(row => ({ id: row.id, vendor_id: row.vendorId, vendor_name: row.vendor.businessName, email: row.vendor.email, request_type: row.requestType, requested_value: row.requestedValue, amount_naira: row.amountNaira, reference_code: row.referenceCode, created_at: row.createdAt }));
}

export async function reviewVendorUpgradeRequestAction(id: string, approve: boolean, adminNote = '') {
    const admin = await requireAdmin();
    const note = adminNote.trim().slice(0, 1000);
    try {
        await prisma.$transaction(async tx => {
            const request = await tx.vendorUpgradeRequest.findUnique({ where: { id }, include: { vendor: true } });
            if (!request || request.status !== 'pending') throw new ProductActionError('This request has already been reviewed. Refresh the list.');
            const now = new Date();
            if (approve) {
                let vendor = request.vendor;
                const ensurePlanEntitlements = async () => {
                    if (vendor.maxProducts !== null) return vendor;
                    const [products, policy] = await Promise.all([
                        tx.product.findMany({ where: { vendorId: vendor.vendorId }, select: { category: true, brand: true } }),
                        tx.vendorProductPolicy.findUnique({ where: { vendorId: vendor.vendorId }, select: { mainCategory: true } }),
                    ]);
                    const categories = [...new Set([...(policy ? [policy.mainCategory] : []), ...products.map(product => product.category)])];
                    if (!categories.length) throw new ProductActionError('This vendor has no approved product category. Update the vendor policy before approving this add-on.');
                    const categoryBrands: Record<string, string[]> = {};
                    for (const category of categories) {
                        const brands = [...new Set(products.filter(product => product.category === category).map(product => product.brand || 'Unbranded'))];
                        categoryBrands[category] = brands.length ? brands : ['Unbranded'];
                    }
                    const allowedBrands = [...new Set(Object.values(categoryBrands).flat())];
                    vendor = await tx.vendor.update({ where: { vendorId: vendor.vendorId }, data: {
                        maxProducts: Math.max(5, products.length), allowedCategories: categories,
                        allowedBrands, categoryBrands, subscriptionStatus: vendor.subscriptionStatus || 'active',
                        subscriptionExpiresAt: vendor.subscriptionExpiresAt || vendor.accessExpiresAt,
                    } });
                    return vendor;
                };
                if (request.requestType === 'monthly_renewal') {
                    const expiry = vendor.subscriptionExpiresAt || vendor.accessExpiresAt;
                    const base = expiry && Date.parse(expiry) > now.getTime() ? new Date(expiry) : now;
                    base.setDate(base.getDate() + 30);
                    await tx.vendor.update({ where: { vendorId: vendor.vendorId }, data: { subscriptionStatus: 'active', subscriptionExpiresAt: base.toISOString(), status: 'approved', accessDays: 30, accessExpiresAt: base.toISOString(), updatedAt: now.toISOString() } });
                } else if (request.requestType === 'extra_slots') {
                    const planVendor = await ensurePlanEntitlements();
                    await tx.vendor.update({ where: { vendorId: vendor.vendorId }, data: { maxProducts: (planVendor.maxProducts ?? 5) + 5, updatedAt: now.toISOString() } });
                } else if (request.requestType === 'extra_category') {
                    vendor = await ensurePlanEntitlements();
                    const categories = new Set(vendor.allowedCategories || []);
                    categories.add(request.requestedValue);
                    const categoryBrands = { ...((vendor.categoryBrands || {}) as Record<string, string[]>) };
                    if (!categoryBrands[request.requestedValue]?.length)
                        categoryBrands[request.requestedValue] = [vendor.allowedBrands[0] || 'Unbranded'];
                    await tx.vendor.update({ where: { vendorId: vendor.vendorId }, data: { allowedCategories: [...categories], categoryBrands, updatedAt: now.toISOString() } });
                } else if (request.requestType === 'extra_brand') {
                    vendor = await ensurePlanEntitlements();
                    const parsed = JSON.parse(request.requestedValue) as { category: string; brand: string };
                    if (!vendor.allowedCategories.includes(parsed.category)) throw new ProductActionError('The requested category is no longer unlocked.');
                    const brands = new Set(vendor.allowedBrands || []);
                    brands.add(parsed.brand.trim());
                    const categoryBrands = { ...((vendor.categoryBrands || {}) as Record<string, string[]>) };
                    categoryBrands[parsed.category] = [...new Set([...(Array.isArray(categoryBrands[parsed.category]) ? categoryBrands[parsed.category] : []), parsed.brand.trim()])];
                    await tx.vendor.update({ where: { vendorId: vendor.vendorId }, data: { allowedBrands: [...brands], categoryBrands, updatedAt: now.toISOString() } });
                } else if (request.requestType === 'featured_boost') {
                    const product = await tx.product.findFirst({ where: { id: request.requestedValue, vendorId: vendor.vendorId } });
                    if (!product) throw new ProductActionError('The selected product no longer exists.');
                    const activeUntil = product.featuredUntil && Date.parse(product.featuredUntil) > now.getTime() ? new Date(product.featuredUntil) : now;
                    activeUntil.setDate(activeUntil.getDate() + 7);
                    await tx.product.update({ where: { id: product.id }, data: { isFeatured: true, featuredUntil: activeUntil.toISOString() } });
                }
            }
            const updated = await tx.vendorUpgradeRequest.updateMany({ where: { id, status: 'pending' }, data: { status: approve ? 'approved' : 'rejected', reviewedAt: now.toISOString(), reviewedBy: admin.email, adminNote: note || null } });
            if (updated.count !== 1) throw new ProductActionError('This request has already been reviewed. Refresh the list.');
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        console.error('Could not review vendor add-on request:', error);
        return { success: false, error: 'Could not update the request. No approval was recorded.' };
    }
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath('/');
    return { success: true };
}

export async function createVendorProductRequestAction(formData: FormData) {
    const session = await requireVendor();
    const mainCategory = String(formData.get('main_category') || '').trim();
    const subcategory = normalizeSelectedProductSubcategory(
        String(formData.get('subcategory') || ''),
        String(formData.get('subcategory_custom') || ''),
    );
    const productName = String(formData.get('product_name') || '').trim();
    const productDescription = String(formData.get('product_description') || '').trim();
    const reason = String(formData.get('reason') || '').trim();
    if (!subcategory || !isValidProductCategoryPair(mainCategory, subcategory)) {
        return { success: false, error: 'Select a valid product category and subcategory.' };
    }
    if (!productName || productName.length > 150) {
        return { success: false, error: 'Product name is required and must be 150 characters or fewer.' };
    }
    if (!productDescription || productDescription.length > 5000) {
        return { success: false, error: 'Product description is required and must be 5,000 characters or fewer.' };
    }
    if (!reason || reason.length > 2000) {
        return { success: false, error: 'A reason is required and must be 2,000 characters or fewer.' };
    }

    const policy = await prisma.vendorProductPolicy.findUnique({ where: { vendorId: session.vendorId } });
    if (!policy) return { success: false, error: 'Your vendor account has no product upload policy. Contact an administrator.' };
    if (policy.initialProductPublishedAt === null) {
        return { success: false, error: 'Publish your first authorized product before requesting another product.' };
    }

    const requestId = await nextId('VPRQ', 4, 'vendorProductRequest');
    const imageFile = formData.get('product_image');
    let productImage: string | undefined;
    if (imageFile instanceof File && imageFile.size > 0) {
        if (imageFile.size > 500 * 1024) {
            return { success: false, error: 'The request image must be 500 KB or smaller.' };
        }
        const extension = path.extname(imageFile.name).toLowerCase();
        if (!new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']).has(extension)) {
            return { success: false, error: 'Use a JPG, JPEG, PNG, WEBP, GIF or AVIF product image.' };
        }
        const bytes = Buffer.from(await imageFile.arrayBuffer());
        if (!isValidProductImage(extension, bytes)) {
            return { success: false, error: 'The selected product image is not a valid image file.' };
        }
        productImage = await uploadStoreAsset(
            `${session.vendorId}/product-requests/${requestId}/proposal${extension}`,
            bytes,
            productImageContentType(extension),
        );
    }

    try {
        await prisma.$transaction(async tx => {
            const currentPolicy = await tx.vendorProductPolicy.findUnique({ where: { vendorId: session.vendorId } });
            if (!currentPolicy || currentPolicy.initialProductPublishedAt === null) {
                throw new ProductActionError('Publish your first authorized product before requesting another product.');
            }
            await tx.vendorProductRequest.create({
                data: {
                    requestId,
                    vendorId: session.vendorId,
                    mainCategory,
                    subcategory,
                    productName,
                    productDescription,
                    productImage,
                    reason,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                },
            });
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (productImage) await deleteStoreAsset(productImage);
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        throw error;
    }

    revalidatePath('/vendor/dashboard');
    revalidatePath('/admin');
    return { success: true, requestId };
}

export async function getVendorProductRequestsAction(): Promise<VendorProductRequest[]> {
    await requireAdmin();
    const requests = await prisma.vendorProductRequest.findMany({
        include: { vendor: true },
        orderBy: { createdAt: 'desc' },
    });
    return requests.map(request => ({
        ...toVendorProductRequest(request),
        vendor: {
            vendor_id: request.vendor.vendorId,
            business_name: request.vendor.businessName,
            owner_name: request.vendor.ownerName,
            email: request.vendor.email,
            status: request.vendor.status,
        },
    }));
}

export async function reviewVendorProductRequestAction(
    requestId: string,
    decision: 'approved' | 'rejected',
    comment = '',
) {
    const admin = await requireAdmin();
    const id = String(requestId || '').trim();
    const adminComment = String(comment || '').trim();
    if (!id) return { success: false, error: 'Select a vendor product request.' };
    if (decision !== 'approved' && decision !== 'rejected') {
        return { success: false, error: 'Choose approval or rejection.' };
    }
    if (decision === 'rejected' && !adminComment) {
        return { success: false, error: 'Add a comment explaining why this request was rejected.' };
    }
    if (adminComment.length > 2000) {
        return { success: false, error: 'The admin comment must be 2,000 characters or fewer.' };
    }
    const result = await prisma.vendorProductRequest.updateMany({
        where: { requestId: id, status: 'pending' },
        data: {
            status: decision,
            adminComment: decision === 'rejected' ? adminComment : null,
            reviewedBy: admin.email,
            reviewedAt: new Date().toISOString(),
        },
    });
    if (result.count !== 1) {
        return { success: false, error: 'This request was already reviewed or no longer exists.' };
    }
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    return { success: true };
}

export async function createVendorFromRequestAction(requestId: string, approvedMainCategory?: string, approvedSubcategory?: string, accessDaysInput?: number, paymentAuthorized = false, approvedBrandInput?: string) {
    const adminSession = await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false, error: 'Enter the exact application ID, for example VREQ0001.' };
    const requests = await readJson<any[]>('vendor_requests.json', []);
    const request = requests.find(r => String(r.request_id).toUpperCase().replace('-', '') === normalizedId);
    if (!request)
        return { success: false, error: 'Application ID not found.' };
    if (request.status !== 'pending')
        return { success: false, error: `This application is already ${request.status}.` };
    const accessDays = Number(accessDaysInput);
    if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > 3650)
        return { success: false, error: 'Assign an access period from 1 to 3,650 days.' };
    if (request.payment_required && !paymentAuthorized)
        return { success: false, error: 'Confirm the uploaded payment receipt before approving this application.' };
    const mainCategory = String(approvedMainCategory ?? request.product_main_category ?? '').trim();
    const subcategory = String(approvedSubcategory ?? request.product_subcategory ?? '').trim();
    const approvedBrand = String(approvedBrandInput ?? request.requested_brand ?? 'Unbranded').trim().replace(/\s+/g, ' ');
    if (!isValidProductCategoryPair(mainCategory, subcategory)) {
        return { success: false, error: 'The application has an invalid product category selection. Ask the vendor to update their application.' };
    }
    if (!approvedBrand || approvedBrand.length > 80) return { success: false, error: 'Enter a valid brand name (or use “Unbranded”).' };
    const email = String(request.email).trim().toLowerCase();
    const vendors = await readJson<any[]>('vendors.json', []);
    const existingVendor = vendors.find(v => String(v.email || '').trim().toLowerCase() === email);
    const vendorId = existingVendor?.vendor_id || await nextId('VEN', 4, 'vendor');
    let supabaseUid = String(request.supabase_uid || '');
    const adminSupabase = createSupabaseAdminClient();
    if (!supabaseUid) {
        try {
            supabaseUid = await findSupabaseUserIdByEmail(email) || '';
        } catch (error) {
            console.error('Could not look up the vendor Auth user:', error instanceof Error ? error.message : error);
            return { success: false, error: 'Could not check the vendor login account. Try again later.' };
        }
        if (!supabaseUid) {
            const { data: invitation, error: invitationError } = await adminSupabase.auth.admin.inviteUserByEmail(
                email,
                { redirectTo: getAuthCallbackUrl('/vendor/setup') },
            );
            if (invitationError || !invitation.user) {
                console.error('Vendor Auth invitation failed:', {
                    code: invitationError?.code,
                    status: invitationError?.status,
                    message: invitationError?.message,
                });
                return { success: false, error: 'Could not send the vendor setup email. The application is still saved; check Supabase Auth email delivery and try approval again.' };
            }
            supabaseUid = invitation.user.id;
        }
    }

    const { error: roleError } = await adminSupabase.auth.admin.updateUserById(supabaseUid, {
        app_metadata: { role: 'vendor', vendor_id: vendorId },
    });
    if (roleError) {
        console.error('Vendor Auth role assignment failed:', roleError.message);
        return { success: false, error: 'Could not activate the vendor account. Try again later.' };
    }

    const now = new Date().toISOString();
    const accessExpiresAt = new Date(Date.now() + accessDays * 24 * 60 * 60 * 1000).toISOString();
    const allowedCategories = [...new Set([...(Array.isArray(existingVendor?.allowed_categories) ? existingVendor.allowed_categories : []), mainCategory])];
    const allowedBrands = [...new Set([...(Array.isArray(existingVendor?.allowed_brands) ? existingVendor.allowed_brands : []), approvedBrand])];
    const categoryBrands = { ...(existingVendor?.category_brands && typeof existingVendor.category_brands === 'object' ? existingVendor.category_brands : {}) } as Record<string, string[]>;
    categoryBrands[mainCategory] = [...new Set([...(Array.isArray(categoryBrands[mainCategory]) ? categoryBrands[mainCategory] : []), approvedBrand])];
    const vendor = { ...existingVendor, vendor_id: vendorId, username: request.username || '', business_name: request.business_name, owner_name: request.owner_name, email, whatsapp_number: request.whatsapp_number, business_address: request.business_address, business_category: mainCategory, business_description: request.business_description, logo: request.logo || existingVendor?.logo || '', status: 'approved', access_days: accessDays, access_expires_at: accessExpiresAt, payment_authorized_at: request.payment_required ? now : undefined, payment_authorized_by: request.payment_required ? adminSession.email : undefined, max_products: existingVendor?.max_products ?? 5, allowed_categories: allowedCategories, allowed_brands: allowedBrands, category_brands: categoryBrands, subscription_status: 'active', subscription_expires_at: accessExpiresAt, created_at: existingVendor?.created_at || now, updated_at: now };
    try {
        await prisma.$transaction(async tx => {
            const claimedRequest = await tx.vendorRequest.updateMany({
                where: { requestId: request.request_id, status: 'pending' },
                data: {
                    status: 'approved',
                    vendorId,
                    approvedAt: now,
                    paymentStatus: request.payment_required ? 'authorized' : 'not_required',
                    accessDays,
                    businessCategory: mainCategory,
                    productMainCategory: mainCategory,
                    productSubcategory: subcategory,
                    requestedBrand: approvedBrand,
                },
            });
            if (claimedRequest.count !== 1) {
                throw new ProductActionError('This application was already reviewed or no longer exists.');
            }
            const databaseVendor = await tx.vendor.findUnique({ where: { vendorId } });
            const vendorData = {
                vendorId,
                sortOrder: databaseVendor?.sortOrder ?? vendors.length,
                businessName: vendor.business_name,
                ownerName: vendor.owner_name,
                email: vendor.email,
                whatsappNumber: vendor.whatsapp_number,
                businessAddress: vendor.business_address,
                businessCategory: vendor.business_category,
                businessDescription: vendor.business_description,
                logo: vendor.logo,
                status: vendor.status,
                username: vendor.username,
                createdAt: vendor.created_at,
                updatedAt: now,
                accessDays: vendor.access_days,
                accessExpiresAt: vendor.access_expires_at,
                paymentAuthorizedAt: vendor.payment_authorized_at ?? null,
                paymentAuthorizedBy: vendor.payment_authorized_by ?? null,
                maxProducts: vendor.max_products,
                allowedCategories: vendor.allowed_categories,
                allowedBrands: vendor.allowed_brands,
                categoryBrands: vendor.category_brands,
                subscriptionStatus: vendor.subscription_status,
                subscriptionExpiresAt: vendor.subscription_expires_at,
            };
            await tx.vendor.upsert({
                where: { vendorId },
                create: vendorData,
                update: vendorData,
            });
            const existingPolicy = await tx.vendorProductPolicy.findUnique({ where: { vendorId } });
            if (!existingPolicy) {
                const existingProducts = await tx.product.findMany({
                    where: { vendorId },
                    orderBy: { sortOrder: 'asc' },
                    select: { id: true },
                    take: 1,
                });
                await tx.vendorProductPolicy.create({
                    data: {
                        vendorId,
                        mainCategory,
                        subcategory,
                        initialProductId: existingProducts[0]?.id || null,
                        initialProductPublishedAt: existingProducts.length ? now : null,
                        createdAt: now,
                    },
                });
            } else if (existingPolicy.initialProductPublishedAt === null &&
                await tx.product.count({ where: { vendorId } }) === 0) {
                await tx.vendorProductPolicy.update({
                    where: { vendorId },
                    data: { mainCategory, subcategory },
                });
            }
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error instanceof ProductActionError) return { success: false, error: error.message };
        throw error;
    }
    revalidatePath('/admin');
    revalidatePath('/vendor/login');
    return { success: true, vendor };
}
export async function approveVendorRequestAction(requestId: string, mainCategory?: string, subcategory?: string, accessDays?: number, paymentAuthorized = false, brand?: string) { return createVendorFromRequestAction(requestId, mainCategory, subcategory, accessDays, paymentAuthorized, brand); }

export async function resendVendorSetupEmailAction(requestId: string) {
    await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false, error: 'Enter the exact application ID, for example VREQ0001.' };

    const requests = await readJson<VendorRegistrationRecord[]>('vendor_requests.json', []);
    const request = requests.find(item => String(item.request_id || '').toUpperCase().replace('-', '') === normalizedId);
    if (!request || request.status === 'rejected')
        return { success: false, error: 'An eligible vendor application was not found.' };

    const email = String(request.email || '').trim().toLowerCase();
    if (!validEmail(email))
        return { success: false, error: 'This application does not have a valid email address.' };

    try {
        const redirectTo = getAuthCallbackUrl('/vendor/setup');
        let supabaseUid = String(request.supabase_uid || '') || await findSupabaseUserIdByEmail(email) || '';
        if (supabaseUid) {
            const supabase = await createSupabaseServerClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) throw error;
        } else {
            const admin = createSupabaseAdminClient();
            const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
                redirectTo,
                data: { username: String(request.username || '') },
            });
            if (error || !data.user) throw error || new Error('Supabase returned no invited user.');
            supabaseUid = data.user.id;
        }

        if (supabaseUid !== String(request.supabase_uid || '')) {
            await updateJson<VendorRegistrationRecord[]>('vendor_requests.json', current => current.map(item =>
                item.request_id === request.request_id ? { ...item, supabase_uid: supabaseUid } : item), []);
        }
        revalidatePath('/admin');
        return { success: true };
    } catch (error) {
        console.error('Could not resend vendor setup email:', error instanceof Error ? error.message : error);
        return { success: false, error: 'Could not send the setup email. Check Supabase Auth email delivery and try again shortly.' };
    }
}

/** Admin-only fallback: issue a one-time app token; GET previews cannot consume it. */
export async function generateVendorWhatsAppSetupLinkAction(requestId: string) {
    await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false as const, error: 'Enter the exact application ID, for example VREQ0001.' };

    const request = await prisma.vendorRequest.findUnique({ where: { requestId: normalizedId } });
    if (!request || request.status !== 'pending')
        return { success: false as const, error: 'Only a pending vendor application can receive this setup link.' };
    if (!validEmail(request.email))
        return { success: false as const, error: 'This application does not have a valid email address.' };

    try {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const updated = await prisma.vendorRequest.updateMany({
            where: { requestId: request.requestId, status: 'pending' },
            data: { setupTokenHash: tokenHash, setupTokenExpiresAt: expiresAt, setupTokenUsedAt: null },
        });
        if (updated.count !== 1) return { success: false as const, error: 'The application is no longer pending.' };

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
        if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');
        const setupUrl = new URL('/vendor/setup', siteUrl);
        // Keep the bearer token in the fragment so link preview bots and HTTP logs never receive it.
        setupUrl.hash = new URLSearchParams({ setup_token: token }).toString();
        return { success: true as const, setupLink: setupUrl.toString() };
    } catch (error) {
        console.error('Could not generate vendor WhatsApp setup link:', error instanceof Error ? error.message : error);
        return { success: false as const, error: 'Could not generate a one-time setup link. Try again.' };
    }
}

const vendorSetupTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function getVendorWhatsAppSetupInfoAction(tokenInput: string) {
    const token = tokenInput.trim();
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return { success: false as const };
    const request = await prisma.vendorRequest.findFirst({ where: {
        setupTokenHash: vendorSetupTokenHash(token),
        status: 'pending',
        setupTokenUsedAt: null,
        setupTokenExpiresAt: { gt: new Date().toISOString() },
    } });
    if (!request) return { success: false as const };
    return { success: true as const, email: request.email, ownerName: request.ownerName };
}

export async function completeVendorWhatsAppSetupAction(tokenInput: string, password: string, confirmation: string) {
    const token = tokenInput.trim();
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return { success: false as const, error: 'This setup link is invalid or expired. Ask the administrator for a new one.' };
    if (password.length < 12) return { success: false as const, error: 'Use a password of at least 12 characters.' };
    if (password !== confirmation) return { success: false as const, error: 'Passwords do not match.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached') return { success: false as const, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable') return { success: false as const, error: 'Could not check the password safely. Try again shortly; the link has not been used.' };

    const now = new Date().toISOString();
    const hash = vendorSetupTokenHash(token);
    const request = await prisma.vendorRequest.findFirst({ where: {
        setupTokenHash: hash,
        status: 'pending',
        setupTokenUsedAt: null,
        setupTokenExpiresAt: { gt: now },
    } });
    if (!request) return { success: false as const, error: 'This setup link has expired or was already used. Ask the administrator for a new one.' };

    const claimed = await prisma.vendorRequest.updateMany({
        where: { requestId: request.requestId, setupTokenHash: hash, status: 'pending', setupTokenUsedAt: null, setupTokenExpiresAt: { gt: now } },
        data: { setupTokenUsedAt: now },
    });
    if (claimed.count !== 1) return { success: false as const, error: 'This setup link has expired or was already used. Ask the administrator for a new one.' };

    try {
        const admin = createSupabaseAdminClient();
        let userId = request.supabaseUid || await findSupabaseUserIdByEmail(request.email) || '';
        if (userId) {
            const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
            if (lookupError || !data.user || data.user.email?.toLowerCase() !== request.email.toLowerCase())
                throw new Error('The application Auth account does not match its email address.');
            if (data.user.app_metadata?.role)
                throw new Error('This email already belongs to an active or privileged account. Use the regular password reset flow instead.');
            const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
            if (error) throw error;
        } else {
            const { data, error } = await admin.auth.admin.createUser({
                email: request.email,
                password,
                email_confirm: true,
                user_metadata: { username: request.username },
            });
            if (error || !data.user) throw error || new Error('Supabase did not create the vendor account.');
            userId = data.user.id;
        }

        await prisma.vendorRequest.update({ where: { requestId: request.requestId }, data: { supabaseUid: userId } });
        return { success: true as const };
    } catch (error) {
        console.error('Could not complete one-time vendor setup:', error instanceof Error ? error.message : error);
        return { success: false as const, error: 'Could not finish account setup. Ask the administrator to issue a fresh one-time link.' };
    }
}

export async function rejectVendorRequestAction(requestId: string) {
    await requireAdmin();
    const normalizedId = requestId.trim().toUpperCase().replace('-', '');
    if (!/^VREQ\d{4,}$/.test(normalizedId))
        return { success: false, error: 'Enter the exact application ID, for example VREQ0001.' };
    const request = (await readJson<any[]>('vendor_requests.json', [])).find(r => String(r.request_id).toUpperCase().replace('-', '') === normalizedId);
    if (!request)
        return { success: false, error: 'Application ID not found.' };
    const rejectionId = await nextId('REJ', 4, 'vendorRequestRejection');
    const rejected = await prisma.vendorRequest.updateMany({
        where: { requestId: request.request_id, status: 'pending' },
        data: { status: 'rejected', rejectedAt: new Date().toISOString(), rejectionId },
    });
    if (rejected.count !== 1)
        return { success: false, error: `This application is already reviewed.` };
    revalidatePath('/admin');
    return { success: true };
}
export async function updateVendorStatusAction(vendorId: string, status: 'approved' | 'suspended' | 'active') {
    await requireAdmin();
    let found = false;
    await updateJson<any[]>('vendors.json', vendors => {
        found = vendors.some(vendor => vendor.vendor_id === vendorId);
        return vendors.map(vendor => vendor.vendor_id === vendorId ? { ...vendor, status } : vendor);
    }, []);
    return found ? { success: true } : { success: false, error: 'Vendor not found' };
}
export async function extendVendorAccessAction(vendorId: string, daysInput: number) {
    await requireAdmin();
    const days = Number(daysInput);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return { success: false, error: 'Add between 1 and 3,650 days.' };
    let updatedVendor: any;
    await updateJson<any[]>('vendors.json', current => current.map(vendor => {
        if (vendor.vendor_id !== vendorId) return vendor;
        const now = Date.now();
        const previousExpiry = Date.parse(String(vendor.access_expires_at || ''));
        const base = Number.isFinite(previousExpiry) && previousExpiry > now ? previousExpiry : now;
        const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
        updatedVendor = { ...vendor, status: 'approved', access_days: Number(vendor.access_days || 0) + days, access_expires_at: expiresAt, subscription_status: 'active', subscription_expires_at: expiresAt };
        return updatedVendor;
    }), []);
    if (!updatedVendor) return { success: false, error: 'Vendor not found.' };
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/vendor/${vendorId}`);
    return { success: true, vendor: updatedVendor };
}
export async function deleteVendorAction(vendorId: string) {
    await requireAdmin();
    const vendors = await readJson<any[]>('vendors.json', []);
    const vendor = vendors.find(item => item.vendor_id === vendorId);
    if (!vendor) return { success: false, error: 'Vendor not found.' };

    const supabase = createSupabaseAdminClient();
    let authUserId: string | undefined;
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return { success: false, error: 'Could not verify the vendor login account.' };
        const account = data.users.find(user => user.app_metadata?.role === 'vendor' && user.app_metadata?.vendor_id === vendorId);
        if (account) { authUserId = account.id; break; }
        if (data.users.length < 1000) break;
    }
    if (authUserId) {
        const { error } = await supabase.auth.admin.deleteUser(authUserId);
        if (error) return { success: false, error: 'Could not delete the vendor login account. The vendor was not removed.' };
    }

    const products = (await readJson<Product[]>('products.json', [])).filter(product => product.vendor_id === vendorId);
    try {
        await prisma.$transaction(async tx => {
            await tx.product.deleteMany({ where: { vendorId } });
            await tx.vendor.delete({ where: { vendorId } });
        });
    } catch (error) {
        console.error('Could not delete vendor records:', error);
        return { success: false, error: 'Could not remove the vendor records. Refresh and try again.' };
    }
    await Promise.all([
        ...products.flatMap(product => (product.images || []).map(deleteProductImage)),
        ...(vendor.logo?.startsWith('/uploads/') ? [deleteStoreAssetIfUnused(vendor.logo)] : []),
    ]);
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/vendor/dashboard');
    revalidatePath(`/vendor/${vendorId}`);
    return { success: true };
}
export async function registerVendorAction(data: FormData) {
    const email = String(data.get('email') || '').trim().toLowerCase();
    const username = String(data.get('username') || '').trim();
    const businessName = String(data.get('business_name') || '').trim();
    const ownerName = String(data.get('owner_name') || '').trim();
    const whatsappNumber = String(data.get('whatsapp_number') || '').trim();
    const businessAddress = String(data.get('business_address') || '').trim();
    const businessDescription = String(data.get('business_description') || '').trim();
    const productMainCategory = String(data.get('product_main_category') || '').trim();
    const requestedBrand = String(data.get('requested_brand') || '').trim().replace(/\s+/g, ' ');
    const productSubcategory = normalizeSelectedProductSubcategory(
        String(data.get('product_subcategory') || ''),
        String(data.get('product_subcategory_custom') || ''),
    );
    const logoFile = data.get('business_logo');
    let logoBytes: Buffer | undefined;
    let logoExtension = '';
    const verificationDocType = String(data.get('verification_doc_type') || '').trim().toUpperCase();
    if (!validEmail(email))
        return { success: false, error: 'Enter a valid email address.' };
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username))
        return { success: false, error: 'Use a username with 3 to 30 letters, numbers, dots, dashes, or underscores.' };
    if (!businessName || !ownerName || !whatsappNumber || !businessAddress || !businessDescription)
        return { success: false, error: 'Complete all required business details.' };
    if (!['CAC', 'NIN'].includes(verificationDocType))
        return { success: false, error: 'Choose CAC or NIN and upload the matching verification document.' };
    if (!productSubcategory || !isValidProductCategoryPair(productMainCategory, productSubcategory))
        return { success: false, error: 'Select a valid product main category and subcategory.' };
    if (!requestedBrand || requestedBrand.length > 80)
        return { success: false, error: 'Enter the first brand name (or use “Unbranded”).' };
    const onboardingSettings = await readVendorApplicationSettings();
    let verificationFile: Awaited<ReturnType<typeof validateVendorDocumentFile>>;
    let receiptFile: Awaited<ReturnType<typeof validateVendorDocumentFile>> | undefined;
    try {
        verificationFile = await validateVendorDocumentFile(data.get('verification_document'));
        if (onboardingSettings.payment_enabled)
            receiptFile = await validateVendorDocumentFile(data.get('payment_receipt'));
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Choose valid verification files.' };
    }
    if (logoFile instanceof File && logoFile.size > 0) {
        if (logoFile.size > 500 * 1024)
            return { success: false, error: 'Business logos must be 500 KB or smaller after image optimization.' };
        logoExtension = path.extname(logoFile.name).toLowerCase();
        if (!/^\.(jpg|jpeg|png|webp)$/.test(logoExtension))
            return { success: false, error: 'Use a JPG, PNG, or WEBP business logo.' };
        logoBytes = Buffer.from(await logoFile.arrayBuffer());
        if (!isValidProductImage(logoExtension, logoBytes))
            return { success: false, error: 'The business logo is not a valid image. Choose a JPG, PNG, or WEBP file.' };
    }
    const vendors = await readJson<VendorRegistrationRecord[]>('vendors.json', []);
    const requests = await readJson<VendorRegistrationRecord[]>('vendor_requests.json', []);
    if (vendors.some(v => String(v.email || '').trim().toLowerCase() === email) || requests.some(r => String(r.email || '').trim().toLowerCase() === email && r.status === 'pending'))
        return { success: false, error: 'An application or vendor account already exists for this email address.' };
    if (vendors.some(v => String(v.username || '').trim().toLowerCase() === username.toLowerCase()) || requests.some(r => String(r.username || '').trim().toLowerCase() === username.toLowerCase() && r.status === 'pending'))
        return { success: false, error: 'That username is already in use. Choose another.' };
    const requestId = await nextId('VREQ', 4, 'vendorRequest');
    const now = new Date();
    const createdAt = now.toISOString();
    const reviewDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    let logo = '';
    let verificationDocPath = '';
    let paymentReceiptPath = '';
    const uploadedPrivatePaths: string[] = [];
    try {
        verificationDocPath = await uploadVendorVerificationFile(
            `${requestId}/identity/${verificationDocType.toLowerCase()}-${Date.now()}${verificationFile.extension}`,
            verificationFile.bytes,
            verificationFile.contentType,
        );
        uploadedPrivatePaths.push(verificationDocPath);
        if (receiptFile) {
            paymentReceiptPath = await uploadVendorVerificationFile(
                `${requestId}/payment/receipt-${Date.now()}${receiptFile.extension}`,
                receiptFile.bytes,
                receiptFile.contentType,
            );
            uploadedPrivatePaths.push(paymentReceiptPath);
        }
    } catch (error) {
        await Promise.all(uploadedPrivatePaths.map(filePath => deleteVendorVerificationFile(filePath).catch(cleanupError => console.error('Could not clean up a partial vendor document upload:', cleanupError))));
        console.error('Could not save vendor verification documents:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Could not securely save the uploaded documents.' };
    }
    if (logoBytes) {
        const fileName = `logo-${Date.now()}${logoExtension}`;
        try {
            logo = await uploadStoreAsset(`vendor-requests/${requestId}/${fileName}`, logoBytes, productImageContentType(logoExtension));
        } catch (error) {
            // A logo is optional; storage trouble must not prevent the application itself.
            console.error('Could not upload optional vendor logo:', error);
        }
    }
    const request = {
        request_id: requestId, status: 'pending', username, business_name: businessName, owner_name: ownerName, email,
        whatsapp_number: whatsappNumber, business_address: businessAddress, business_category: productMainCategory,
        business_description: businessDescription, product_main_category: productMainCategory,
        product_subcategory: productSubcategory, requested_brand: requestedBrand, logo, verification_doc_type: verificationDocType,
        verification_doc_path: verificationDocPath, payment_receipt_path: paymentReceiptPath,
        payment_required: onboardingSettings.payment_enabled, payment_amount: onboardingSettings.payment_enabled ? onboardingSettings.payment_amount : null,
        payment_instructions: onboardingSettings.payment_enabled ? onboardingSettings.payment_instructions : '',
        payment_status: onboardingSettings.payment_enabled ? 'pending_verification' : 'not_required',
        review_due_at: reviewDueAt, created_at: createdAt,
    };
    let duplicatePendingApplication = false;
    let duplicateUsername = false;
    try {
        await updateJson<VendorRegistrationRecord[]>('vendor_requests.json', current => {
            duplicatePendingApplication = current.some(item =>
                String(item.email || '').trim().toLowerCase() === email && item.status === 'pending');
            duplicateUsername = current.some(item =>
                String(item.username || '').trim().toLowerCase() === username.toLowerCase() && item.status === 'pending');
            return duplicatePendingApplication || duplicateUsername ? current : [...current, request];
        }, []);
    } catch (error) {
        if (logo) await deleteStoreAsset(logo).catch(cleanupError => console.error('Could not remove an uncommitted vendor logo:', cleanupError));
        await Promise.all(uploadedPrivatePaths.map(filePath => deleteVendorVerificationFile(filePath).catch(cleanupError => console.error('Could not clean up uncommitted vendor documents:', cleanupError))));
        console.error('Could not save vendor application:', error);
        return { success: false, error: 'Could not save your application. Check your details and try again.' };
    }
    if (duplicatePendingApplication || duplicateUsername) {
        if (logo) await deleteStoreAsset(logo).catch(cleanupError => console.error('Could not remove a duplicate vendor logo:', cleanupError));
        await Promise.all(uploadedPrivatePaths.map(filePath => deleteVendorVerificationFile(filePath).catch(cleanupError => console.error('Could not clean up duplicate vendor documents:', cleanupError))));
        return { success: false, error: duplicateUsername ? 'That username is already in use. Choose another.' : 'An application already exists for this email address.' };
    }
    let invitationSent = false;
    try {
        const admin = createSupabaseAdminClient();
        const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(
            email,
            { redirectTo: getAuthCallbackUrl('/vendor/setup'), data: { username } },
        );
        if (invitationError || !invitation.user) {
            const existingUserId = await findSupabaseUserIdByEmail(email);
            if (!existingUserId) throw invitationError || new Error('Supabase returned no invited user.');
            const supabase = await createSupabaseServerClient();
            const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: getAuthCallbackUrl('/vendor/setup'),
            });
            if (recoveryError) throw recoveryError;
            invitationSent = true;
            await updateJson<VendorRegistrationRecord[]>('vendor_requests.json', current => current.map(item =>
                item.request_id === requestId ? { ...item, supabase_uid: existingUserId } : item), []);
        } else {
            invitationSent = true;
            await updateJson<VendorRegistrationRecord[]>('vendor_requests.json', current => current.map(item =>
                item.request_id === requestId ? { ...item, supabase_uid: invitation.user.id } : item), []);
        }
    } catch (error) {
        console.error('Could not send vendor account setup email:', {
            code: typeof error === 'object' && error && 'code' in error ? error.code : undefined,
            status: typeof error === 'object' && error && 'status' in error ? error.status : undefined,
            message: error instanceof Error ? error.message : String(error),
        });
    }
    let whatsappUrl: string | undefined;
    let whatsappSettingsUnavailable = false;
    try {
        const siteSettings = await readJson<{ admin_whatsapp?: string }>('site_settings.json', { admin_whatsapp: '' });
        const adminWhatsApp = String(siteSettings.admin_whatsapp || process.env.FUSSION_ADMIN_WHATSAPP || '').replace(/\D/g, '');
        const message = ['Fussion vendor application', `Application: ${requestId}`, `Business: ${request.business_name}`, `Owner: ${request.owner_name}`, `Username: ${username}`, `Email: ${request.email}`, `WhatsApp: ${request.whatsapp_number}`, `First product category: ${productMainCategory} / ${productSubcategory}`, `Payment: ${request.payment_required ? `receipt uploaded, awaiting verification (₦${request.payment_amount})` : 'not required'}`, `Review due: ${reviewDueAt}`, `Address: ${request.business_address}`, `Description: ${request.business_description}`, '', 'Please review this application in the Fussion Admin Dashboard and approve or reject it.'].join('\n');
        whatsappUrl = adminWhatsApp.length >= 10 && adminWhatsApp.length <= 15 ? `https://wa.me/${adminWhatsApp}?text=${encodeURIComponent(message)}` : undefined;
    } catch (error) {
        console.error('Could not load admin WhatsApp settings after vendor registration:', error);
        whatsappSettingsUnavailable = true;
    }
    revalidatePath('/admin');
    return { success: true, requestId, whatsappUrl, whatsappConfigured: Boolean(whatsappUrl), whatsappSettingsUnavailable, invitationSent };
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
async function readVendorApplicationSettings() {
    const siteSettings = await readJson<Record<string, unknown>>('site_settings.json', {});
    return normalizeVendorOnboardingSettings(siteSettings.vendor_application);
}
export async function getVendorApplicationSettingsAction() {
    return readVendorApplicationSettings();
}
export async function saveVendorApplicationSettingsAction(settings: VendorOnboardingSettings) {
    await requireAdmin();
    const normalized = normalizeVendorOnboardingSettings(settings);
    if (normalized.payment_enabled && (!normalized.payment_amount || !normalized.payment_instructions)) {
        return { success: false, error: 'Set a payment amount and payment instructions before enabling the payment requirement.' };
    }
    await updateJson<Record<string, unknown>>('site_settings.json', current => ({
        ...current,
        vendor_application: normalized,
    }), {});
    revalidatePath('/admin');
    revalidatePath('/vendor/register');
    return { success: true, settings: normalized };
}
export async function getVendorProductsAction() {
    const session = await requireVendor();
    const products = await readJson<Product[]>('products.json', []);
    return products.filter(product => product.vendor_id === session.vendorId);
}
export async function getVendorRequestsAction() {
    await requireAdmin();
    const requests = await readJson<any[]>('vendor_requests.json', []);
    return Promise.all(requests.map(async request => {
        const { verification_doc_path, payment_receipt_path, ...safeRequest } = request;
        const [verification_document_url, payment_receipt_url] = await Promise.all([
            verification_doc_path ? createVendorVerificationSignedUrl(String(verification_doc_path)).catch(() => '') : Promise.resolve(''),
            payment_receipt_path ? createVendorVerificationSignedUrl(String(payment_receipt_path)).catch(() => '') : Promise.resolve(''),
        ]);
        return { ...safeRequest, verification_document_url, payment_receipt_url };
    }));
}
export async function getVendorsAction(): Promise<VendorAdminOverview[]> {
    await requireAdmin();
    const [vendors, products, policies, approvals] = await Promise.all([
        readJson<Array<{
            vendor_id?: string;
            username?: string;
            business_name?: string;
            email?: string;
            status?: string;
            business_category?: string;
            access_days?: number;
            access_expires_at?: string;
        }>>('vendors.json', []),
        readJson<Product[]>('products.json', []),
        prisma.vendorProductPolicy.findMany(),
        prisma.vendorProductRequest.findMany({
            where: { status: 'approved', publishedProductId: { not: null } },
        }),
    ]);

    return vendors.map(vendor => {
        const vendorId = String(vendor.vendor_id || '');
        const policy = policies.find(item => item.vendorId === vendorId);
        const vendorProducts = products.filter(product => product.vendor_id === vendorId);
        return {
            vendor_id: vendorId,
            username: String(vendor.username || ''),
            business_name: String(vendor.business_name || ''),
            email: String(vendor.email || ''),
            status: isVendorAccessActive(vendor) ? String(vendor.status || '') : vendor.access_expires_at ? 'expired' : String(vendor.status || ''),
            access_days: vendor.access_days,
            access_expires_at: vendor.access_expires_at,
            approved_main_category: policy?.mainCategory || String(vendor.business_category || ''),
            approved_subcategory: policy?.subcategory || '',
            products: vendorProducts.map(product => {
                const approval = approvals.find(request =>
                    request.vendorId === vendorId && request.publishedProductId === product.id);
                const matchesRequest = approval && matchesApprovedProductRequest(approval, {
                    category: product.category,
                    subcategory: product.subcategory || '',
                    title: product.title,
                    description: product.description,
                });
                const matchesInitialPermission = policy?.initialProductId === product.id &&
                    policy.mainCategory === product.category &&
                    policy.subcategory === (product.subcategory || '');
                return {
                    id: product.id,
                    title: product.title,
                    category: product.category,
                    subcategory: product.subcategory,
                    permission_status: matchesRequest
                        ? 'approved-request' as const
                        : matchesInitialPermission ? 'initial' as const : 'unmatched' as const,
                    ...(matchesRequest && approval ? { permission_request_id: approval.requestId } : {}),
                };
            }),
        };
    });
}
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
