'use server';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSession, requireAdmin, requireSuperAdmin, requireVendor } from '../../../lib/auth';
import { nextId, readJson, updateJson, updateProductsAtomically, writeJson } from '../../../lib/json-store';
import { Product, VendorProductAccess, VendorProductRequest, VendorProductRequestStatus } from '../../(public)/components/types/store';
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
import { prisma } from '../../../server/db';
import { isValidProductCategoryPair, normalizeSelectedProductSubcategory } from '../../../lib/product-categories';
import { isValidProductImage, productImageContentType } from '../../../lib/product-image-validation';
import { authorizeVendorProductSubmission, matchesApprovedProductRequest } from '../../../lib/vendor-product-permissions';
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

class ProductActionError extends Error {}

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
export async function saveProductAction(formData: FormData, vendorId: string, productId?: string) {
    const session = await getSession();
    if (!session)
        return { success: false, error: 'Unauthorized' };
    if (session.role !== 'admin' && session.role !== 'super_admin' && session.role !== 'vendor')
        return { success: false, error: 'Unauthorized' };
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
    const selectedSubcategory = String(formData.get('subcategory') || '').trim();
    const customSubcategory = String(formData.get('subcategory_custom') || '');
    const subcategory = normalizeSelectedProductSubcategory(
        selectedSubcategory,
        customSubcategory,
    ) || (session.role === 'vendor' && selectedSubcategory === 'Other' && !customSubcategory.trim() ? 'Other' : '');
    if (!title || title.length > 150) return { success: false, error: 'Product name is required and must be 150 characters or fewer.' };
    if (!description || description.length > 5000) return { success: false, error: 'Product description is required and must be 5,000 characters or fewer.' };
    if (!subcategory || !isValidProductCategoryPair(category, subcategory)) {
        const unchangedLegacyCategory = Boolean(existing) &&
            category === existing?.category &&
            subcategory === (existing?.subcategory || '');
        if (!unchangedLegacyCategory) return { success: false, error: 'Select a valid main category and subcategory.' };
    }

    let preflightPermission: ReturnType<typeof authorizeVendorProductSubmission> | undefined;
    if (session.role === 'vendor') {
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
        } else {
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
    if (uploadedFiles.length > 4) return { success: false, error: 'Upload a maximum of 4 product photos at a time.' };
    const uploadedImages: string[] = [];
    if (uploadedFiles.length) {
        for (const file of uploadedFiles) {
            if (file.size > 500 * 1024) return { success: false, error: `“${file.name}” exceeds the 500 KB upload ceiling. Select it again for browser optimization.` };
            const ext = path.extname(file.name).toLowerCase();
            const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
            if (!allowed.has(ext)) return { success: false, error: `Unsupported picture “${file.name}”. Use JPG, JPEG, PNG, WEBP, GIF or AVIF.` };
            const bytes = Buffer.from(await file.arrayBuffer());
            if (!isValidProductImage(ext, bytes)) return { success: false, error: `“${file.name}” is not a valid ${ext.slice(1).toUpperCase()} picture. Upload an original JPG, PNG, WEBP, GIF or AVIF image.` };
            const name = `${vendorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
            uploadedImages.push(await uploadStoreAsset(`${owner}/products/${productRecordId}/${name}`, bytes, productImageContentType(ext)));
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
    const product: Product = { id: productRecordId, vendor_id: owner, title, description, price, compare_at_price: compare, size_prices: size_prices.length ? size_prices : undefined, available_quantity: Math.max(0, Number(formData.get('available_quantity') || 0)), is_available: formData.get('is_available') === 'true' && Number(formData.get('available_quantity') || 0) > 0, giveaway: formData.get('giveaway') === 'true', giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined, images: (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 4), category, subcategory, tags: String(formData.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), likes_count: existing?.likes_count || 0, vendor_whatsapp: String(formData.get('vendor_whatsapp') || '').trim(), location: String(formData.get('location') || '').trim(), condition: (String(formData.get('condition') || 'new') as Product['condition']), detail_gallery_enabled: formData.get('detail_gallery_enabled') === 'true', is_latest: formData.get('is_latest') === 'true', is_top_selling: isAdmin ? formData.get('is_top_selling') === 'true' : existing?.is_top_selling || false, related_products_mode: (String(formData.get('related_products_mode') || 'category') as Product['related_products_mode']), related_product_ids: formData.getAll('related_product_ids').map(String).filter(Boolean).slice(0, 4) };
    try {
        const savedProduct = await updateProductsAtomically<Product, Product>(async (current, tx) => {
            const currentExisting = productId ? current.find(item => item.id === productId) : undefined;
            if (productId && !currentExisting) throw new ProductActionError('Product not found.');
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
            return {
                next: productId
                    ? current.map(item => item.id === productId ? saved : item)
                    : [...current, saved],
                result: saved,
            };
        });
        Object.assign(product, savedProduct);
    } catch (error) {
        await Promise.all(uploadedImages.map(deleteStoreAsset));
        if (error instanceof ProductActionError) return { success: false, error: error.message };
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
    if (!session || (session.role !== 'admin' && session.role !== 'super_admin' && session.role !== 'vendor'))
        return { success: false, error: 'Unauthorized' };
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
    await Promise.all((target.images || []).filter(image => image.startsWith('/uploads/')).map(deleteStoreAssetIfUnused));
    revalidatePath('/');
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
    const [policy, publishedProducts, requests, approvedRequests] = await Promise.all([
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
    ]);
    if (!policy) return null;
    const initialPermissionAvailable = policy.initialProductPublishedAt === null && publishedProducts === 0;
    return {
        main_category: policy.mainCategory,
        subcategory: policy.subcategory,
        initial_permission_available: initialPermissionAvailable,
        published_products: publishedProducts,
        remaining_permissions: Number(initialPermissionAvailable) + approvedRequests.length,
        requests: requests.map(toVendorProductRequest),
        approved_requests: approvedRequests.map(toVendorProductRequest),
    };
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
    const mainCategory = String(request.product_main_category || '').trim();
    const subcategory = String(request.product_subcategory || '').trim();
    if (!isValidProductCategoryPair(mainCategory, subcategory)) {
        return { success: false, error: 'The application has an invalid product category selection. Ask the vendor to update their application.' };
    }
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

    const now = new Date().toISOString();
    const vendor = { ...existingVendor, vendor_id: vendorId, business_name: request.business_name, owner_name: request.owner_name, email, whatsapp_number: request.whatsapp_number, business_address: request.business_address, business_category: request.business_category, business_description: request.business_description, logo: request.logo || existingVendor?.logo || '', status: 'approved', created_at: existingVendor?.created_at || now, updated_at: now };
    try {
        await prisma.$transaction(async tx => {
            const claimedRequest = await tx.vendorRequest.updateMany({
                where: { requestId: request.request_id, status: 'pending' },
                data: { status: 'approved', vendorId, approvedAt: now },
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
                createdAt: vendor.created_at,
                updatedAt: now,
            };
            await tx.vendor.upsert({
                where: { vendorId },
                create: vendorData,
                update: vendorData,
            });
            if (!databaseVendor) {
                await tx.vendorProductPolicy.create({
                    data: {
                        vendorId,
                        mainCategory,
                        subcategory,
                        initialProductId: null,
                        initialProductPublishedAt: null,
                        createdAt: now,
                    },
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
export async function approveVendorRequestAction(requestId: string) { return createVendorFromRequestAction(requestId); }
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
export async function registerVendorAction(data: FormData) {
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('password_confirmation') || '');
    const productMainCategory = String(data.get('product_main_category') || '').trim();
    const productSubcategory = normalizeSelectedProductSubcategory(
        String(data.get('product_subcategory') || ''),
        String(data.get('product_subcategory_custom') || ''),
    );
    if (!validEmail(email))
        return { success: false, error: 'Enter a valid email address.' };
    if (!productSubcategory || !isValidProductCategoryPair(productMainCategory, productSubcategory))
        return { success: false, error: 'Select a valid product main category and subcategory.' };
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    const vendors = await readJson<any[]>('vendors.json', []);
    const requests = await readJson<any[]>('vendor_requests.json', []);
    if (vendors.some(v => String(v.email || '').trim().toLowerCase() === email && ['approved', 'active'].includes(String(v.status))) || requests.some(r => String(r.email || '').trim().toLowerCase() === email && r.status === 'pending'))
        return { success: false, error: 'This email is already registered or pending approval.' };
    const supabase = await createSupabaseServerClient();
    let userId: string | undefined;
    let needsEmailConfirmation = false;
    let newAccountError = password.length < 12 ? 'Use a password of at least 12 characters for a new account.' : '';
    if (!newAccountError) {
        const breachStatus = await checkPasswordAgainstBreaches(password);
        if (breachStatus === 'breached') newAccountError = 'This password appears in known data breaches. Choose a different password for a new account.';
        else if (breachStatus === 'unavailable') newAccountError = 'Could not check the password against breach data. Try again shortly.';
        else {
            const { data: signup, error: signupError } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: getAuthCallbackUrl('/vendor/login') },
            });
            if (!signupError && signup.user && signup.user.identities?.length) {
                userId = signup.user.id;
                needsEmailConfirmation = !signup.session && !signup.user.email_confirmed_at;
            }
        }
    }
    // An existing shopper or other account can apply as a vendor after proving
    // ownership with its current password. Never attach an application by email alone.
    if (!userId) {
        const { data: existingAccount, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError || !existingAccount.user)
            return { success: false, error: newAccountError || 'This email already has an account. Enter its current password, or reset the password before applying.' };
        if (existingAccount.user.app_metadata?.role === 'admin') {
            await supabase.auth.signOut();
            return { success: false, error: 'This email belongs to an administrator account. Use a different email address.' };
        }
        userId = existingAccount.user.id;
    }
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
    const request = { request_id: requestId, status: 'pending', business_name: String(data.get('business_name') || '').trim(), owner_name: String(data.get('owner_name') || '').trim(), email, supabase_uid: userId, whatsapp_number: String(data.get('whatsapp_number') || '').trim(), business_address: String(data.get('business_address') || '').trim(), business_category: productMainCategory, business_description: String(data.get('business_description') || '').trim(), product_main_category: productMainCategory, product_subcategory: productSubcategory, logo, created_at: new Date().toISOString() };
    let duplicatePendingApplication = false;
    try {
        await updateJson<any[]>('vendor_requests.json', current => {
            duplicatePendingApplication = current.some(item =>
                String(item.email || '').trim().toLowerCase() === email && item.status === 'pending');
            return duplicatePendingApplication ? current : [...current, request];
        }, []);
    } catch (error) {
        if (logo) await deleteStoreAsset(logo);
        throw error;
    }
    if (duplicatePendingApplication) {
        if (logo) await deleteStoreAsset(logo);
        await supabase.auth.signOut();
        return { success: false, error: 'This email is already registered or pending approval.' };
    }
    await supabase.auth.signOut();
    const siteSettings = await readJson<{ admin_whatsapp?: string }>('site_settings.json', { admin_whatsapp: '' });
    const adminWhatsApp = String(siteSettings.admin_whatsapp || '').replace(/\D/g, '');
    const message = ['Fussion vendor application', `Application: ${requestId}`, `Business: ${request.business_name}`, `Owner: ${request.owner_name}`, `Email: ${request.email}`, `WhatsApp: ${request.whatsapp_number}`, `First product category: ${productMainCategory} / ${productSubcategory}`, `Address: ${request.business_address}`, `Description: ${request.business_description}`, '', 'Please review this application in the Fussion Admin Dashboard and approve or reject it.'].join('\n');
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
