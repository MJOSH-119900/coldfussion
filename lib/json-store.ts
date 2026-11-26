import 'server-only';
import { Prisma, type StoreRecord } from '../generated/prisma/client';
import { prisma } from '../server/db';

export type JsonFileName = 'vendors.json' | 'vendor_requests.json' | 'products.json' | 'orders.json' | 'analytics.json' | 'counters.json' | 'likes.json' | 'auth_otps.json' | 'music.json' | 'music_settings.json' | 'site_settings.json' | 'customer_inquiries.json' | 'product_feedback.json';

const defaults: Record<JsonFileName, unknown> = {
    'vendors.json': [], 'vendor_requests.json': [], 'products.json': [],
    'orders.json': [], 'analytics.json': [], 'counters.json': {}, 'likes.json': [],
    'auth_otps.json': [], 'music.json': [],
    'music_settings.json': { enabled: true, updated_at: null },
    'site_settings.json': { admin_whatsapp: '' },
    'customer_inquiries.json': [], 'product_feedback.json': [],
};

const documentFiles = new Set<JsonFileName>(['counters.json', 'music_settings.json', 'site_settings.json']);
export type StoreTransaction = Pick<Prisma.TransactionClient,
    | 'storeRecord' | 'storeSetting' | 'storeCounter' | 'product' | 'vendor' | 'vendorRequest'
    | 'vendorProductPolicy' | 'vendorProductRequest'
    | 'orderRecord' | 'analyticsEvent' | 'productLike' | 'customerInquiry'
    | 'productFeedback' | 'musicTrack'>;

function collectionName(name: JsonFileName) {
    return name.slice(0, -'.json'.length);
}

function asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function orderedRecords(records: StoreRecord[]) {
    return records.sort((left, right) => {
        const leftIndex = Number.parseInt(left.recordId.split(':', 1)[0], 10);
        const rightIndex = Number.parseInt(right.recordId.split(':', 1)[0], 10);
        return leftIndex - rightIndex;
    });
}

async function readFromStore<T>(tx: StoreTransaction, name: JsonFileName, fallback?: T): Promise<T> {
    if (documentFiles.has(name)) {
        const fields = await tx.storeSetting.findMany({ where: { key: { startsWith: `${collectionName(name)}.` } } });
        if (!fields.length) return (fallback ?? defaults[name]) as T;
        const value: Record<string, unknown> = {};
        for (const field of fields) {
            const key = field.key.slice(collectionName(name).length + 1);
            try { value[key] = JSON.parse(field.value); } catch { value[key] = field.value; }
        }
        return value as T;
    }
    if (name === 'counters.json') {
        const rows = await tx.storeCounter.findMany();
        return Object.fromEntries(rows.map(row => [row.key, row.value])) as T;
    }

    let values: unknown[];
    switch (name) {
        case 'products.json': {
            const rows = await tx.product.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                id: row.id, vendor_id: row.vendorId, title: row.title, description: row.description,
                created_at: row.createdAt.toISOString(),
                price: row.price, compare_at_price: row.compareAtPrice ?? undefined,
                size_prices: row.sizePrices ?? undefined, giveaway: row.giveaway,
                giveaway_announcement: row.giveawayAnnouncement ?? undefined,
                available_quantity: row.availableQuantity, is_available: row.isAvailable,
                images: row.images, category: row.category, subcategory: row.subcategory ?? undefined,
                brand: row.brand,
                tags: row.tags, likes_count: row.likesCount,
                vendor_whatsapp: row.vendorWhatsapp, vendor_business_name: row.vendorBusinessName ?? undefined,
                location: row.location ?? undefined, condition: row.condition ?? undefined,
                detail_gallery_enabled: row.detailGalleryEnabled, is_latest: row.isLatest,
                is_top_selling: row.isTopSelling,
                is_featured: row.isFeatured,
                featured_until: row.featuredUntil ?? undefined,
                related_products_mode: row.relatedProductsMode ?? undefined,
                related_product_ids: row.relatedProductIds,
            }));
            break;
        }
        case 'vendors.json': {
            const rows = await tx.vendor.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                vendor_id: row.vendorId, username: row.username, business_name: row.businessName, owner_name: row.ownerName,
                email: row.email, whatsapp_number: row.whatsappNumber,
                business_address: row.businessAddress, business_category: row.businessCategory,
                business_description: row.businessDescription, logo: row.logo, status: row.status,
                created_at: row.createdAt, updated_at: row.updatedAt ?? undefined,
                access_days: row.accessDays ?? undefined, access_expires_at: row.accessExpiresAt ?? undefined,
                payment_authorized_at: row.paymentAuthorizedAt ?? undefined,
                payment_authorized_by: row.paymentAuthorizedBy ?? undefined,
                max_products: row.maxProducts ?? undefined,
                allowed_categories: row.allowedCategories,
                allowed_brands: row.allowedBrands,
                category_brands: row.categoryBrands ?? undefined,
                subscription_status: row.subscriptionStatus ?? undefined,
                subscription_expires_at: row.subscriptionExpiresAt ?? undefined,
            }));
            break;
        }
        case 'vendor_requests.json': {
            const rows = await tx.vendorRequest.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                request_id: row.requestId, status: row.status, business_name: row.businessName,
                owner_name: row.ownerName, email: row.email, username: row.username, supabase_uid: row.supabaseUid ?? undefined,
                whatsapp_number: row.whatsappNumber, business_address: row.businessAddress,
                business_category: row.businessCategory, business_description: row.businessDescription,
                product_main_category: row.productMainCategory, product_subcategory: row.productSubcategory,
                requested_brand: row.requestedBrand,
                verification_doc_type: row.verificationDocType, verification_doc_path: row.verificationDocPath,
                payment_receipt_path: row.paymentReceiptPath, payment_required: row.paymentRequired,
                payment_amount: row.paymentAmount ?? undefined, payment_instructions: row.paymentInstructions,
                payment_status: row.paymentStatus, review_due_at: row.reviewDueAt ?? undefined,
                access_days: row.accessDays ?? undefined,
                logo: row.logo, vendor_id: row.vendorId ?? undefined, created_at: row.createdAt,
                approved_at: row.approvedAt ?? undefined, rejected_at: row.rejectedAt ?? undefined,
                rejection_id: row.rejectionId ?? undefined,
                setup_token_hash: row.setupTokenHash ?? undefined,
                setup_token_expires_at: row.setupTokenExpiresAt ?? undefined,
                setup_token_used_at: row.setupTokenUsedAt ?? undefined,
            }));
            break;
        }
        case 'orders.json': {
            const rows = await tx.orderRecord.findMany({
                include: { items: { orderBy: { sortOrder: 'asc' } }, statusHistory: { orderBy: { sortOrder: 'asc' } } },
                orderBy: { sortOrder: 'asc' },
            });
            values = rows.map(row => ({
                order_id: row.orderId, checkout_id: row.checkoutId ?? undefined, vendor_id: row.vendorId,
                customer_name: row.customerName ?? undefined, customer_phone: row.customerPhone ?? undefined,
                total: row.total, checkout_method: row.checkoutMethod, status: row.status,
                created_at: row.createdAt, whatsapp_handoff_at: row.whatsappHandoffAt ?? undefined,
                vendor_whatsapp: row.vendorWhatsapp ?? undefined,
                receipt_confirmation_token_hash: row.receiptConfirmationTokenHash ?? undefined,
                receipt_confirmation_expires_at: row.receiptConfirmationExpiresAt ?? undefined,
                receipt_confirmation_sent_at: row.receiptConfirmationSentAt ?? undefined,
                customer_received_at: row.customerReceivedAt ?? undefined,
                items: row.items.map(item => ({
                    product_id: item.productId, vendor_id: item.vendorId, product_name: item.productName,
                    selected_size: item.selectedSize ?? undefined, product_image: item.productImage ?? undefined,
                    unit_price: item.unitPrice, quantity: item.quantity, subtotal: item.subtotal,
                })),
                status_history: row.statusHistory.map(change => ({
                    status: change.status, at: change.at, actor: change.actor,
                })),
            }));
            break;
        }
        case 'analytics.json': {
            const rows = await tx.analyticsEvent.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                event_id: row.eventId, type: row.type, product_id: row.productId ?? undefined,
                vendor_id: row.vendorId ?? undefined, visitor_id: row.visitorId ?? undefined,
                timestamp: row.timestamp, order_id: row.orderId ?? undefined,
            }));
            break;
        }
        case 'likes.json': {
            const rows = await tx.productLike.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({ product_id: row.productId, visitor_id: row.visitorId, created_at: row.createdAt }));
            break;
        }
        case 'customer_inquiries.json': {
            const rows = await tx.customerInquiry.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                id: row.id, whatsapp: row.whatsapp, category: row.category, message: row.message,
                created_at: row.createdAt, status: row.status,
            }));
            break;
        }
        case 'product_feedback.json': {
            const rows = await tx.productFeedback.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                id: row.id, product_id: row.productId, product_title: row.productTitle,
                name: row.name, rating: row.rating, message: row.message,
                created_at: row.createdAt, status: row.status,
            }));
            break;
        }
        case 'music.json': {
            const rows = await tx.musicTrack.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({ id: row.id, title: row.title, file: row.file, created_at: row.createdAt }));
            break;
        }
        case 'auth_otps.json': {
            values = [];
            break;
        }
        default:
            values = [];
    }
    return (values.length ? values : fallback ?? defaults[name]) as T;
}

async function writeToStore(tx: StoreTransaction, name: JsonFileName, value: unknown) {
    if (documentFiles.has(name)) {
        const prefix = `${collectionName(name)}.`;
        const fields = asRecord(value);
        await tx.storeSetting.deleteMany({ where: { key: { startsWith: prefix } } });
        for (const [key, fieldValue] of Object.entries(fields)) {
            await tx.storeSetting.create({ data: { key: `${prefix}${key}`, value: JSON.stringify(fieldValue) } });
        }
        return;
    }
    if (name === 'counters.json') {
        const fields = asRecord(value);
        await tx.storeCounter.deleteMany();
        for (const [key, count] of Object.entries(fields)) {
            await tx.storeCounter.create({ data: { key, value: Number(count) || 0 } });
        }
        return;
    }
    if (!Array.isArray(value)) throw new Error(`${name} must contain an array.`);
    const items = value.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new Error(`${name} contains an invalid record at index ${index}.`);
        return { data: item as Record<string, any>, index };
    });

    switch (name) {
        case 'products.json': {
            const productIds = items.map(({ data }) => String(data.id));
            await tx.product.deleteMany({
                where: productIds.length ? { id: { notIn: productIds } } : {},
            });
            for (const { data, index } of items) {
                const productData = {
                id: String(data.id), sortOrder: index, vendorId: String(data.vendor_id || ''),
                createdAt: data.created_at ? new Date(String(data.created_at)) : new Date(),
                discoveryFingerprint: '',
                title: String(data.title || ''), description: String(data.description || ''),
                price: Number(data.price || 0), compareAtPrice: data.compare_at_price == null ? null : Number(data.compare_at_price),
                sizePrices: data.size_prices == null ? Prisma.JsonNull : asJson(data.size_prices),
                giveaway: Boolean(data.giveaway), giveawayAnnouncement: data.giveaway_announcement == null ? null : String(data.giveaway_announcement),
                availableQuantity: Number(data.available_quantity || 0), isAvailable: Boolean(data.is_available),
                images: Array.isArray(data.images) ? data.images.map(String) : [], category: String(data.category || 'Other'),
                subcategory: data.subcategory == null ? null : String(data.subcategory),
                brand: String(data.brand || 'Unbranded'),
                tags: Array.isArray(data.tags) ? data.tags.map(String) : [], likesCount: Number(data.likes_count || 0),
                vendorWhatsapp: String(data.vendor_whatsapp || ''), vendorBusinessName: data.vendor_business_name == null ? null : String(data.vendor_business_name),
                location: data.location == null ? null : String(data.location), condition: data.condition == null ? null : String(data.condition),
                detailGalleryEnabled: Boolean(data.detail_gallery_enabled), isLatest: Boolean(data.is_latest),
                isTopSelling: Boolean(data.is_top_selling), relatedProductsMode: data.related_products_mode == null ? null : String(data.related_products_mode),
                isFeatured: Boolean(data.is_featured), featuredUntil: data.featured_until == null ? null : String(data.featured_until),
                relatedProductIds: Array.isArray(data.related_product_ids) ? data.related_product_ids.map(String) : [],
                };
                await tx.product.upsert({
                    where: { id: productData.id },
                    create: productData,
                    update: productData,
                });
            }
            return;
        }
        case 'vendors.json': {
            const vendorIds = items.map(({ data }) => String(data.vendor_id));
            await tx.vendor.deleteMany({
                where: vendorIds.length ? { vendorId: { notIn: vendorIds } } : {},
            });
            for (const { data, index } of items) {
                const vendorData = {
                vendorId: String(data.vendor_id), sortOrder: index, username: String(data.username || ''), businessName: String(data.business_name || ''),
                ownerName: String(data.owner_name || ''), email: String(data.email || ''),
                whatsappNumber: String(data.whatsapp_number || ''), businessAddress: String(data.business_address || ''),
                businessCategory: String(data.business_category || ''), businessDescription: String(data.business_description || ''),
                logo: String(data.logo || ''), status: String(data.status || 'suspended'),
                createdAt: String(data.created_at || new Date().toISOString()),
                updatedAt: data.updated_at == null ? null : String(data.updated_at),
                accessDays: data.access_days == null ? null : Number(data.access_days),
                accessExpiresAt: data.access_expires_at == null ? null : String(data.access_expires_at),
                paymentAuthorizedAt: data.payment_authorized_at == null ? null : String(data.payment_authorized_at),
                paymentAuthorizedBy: data.payment_authorized_by == null ? null : String(data.payment_authorized_by),
                maxProducts: data.max_products == null ? null : Number(data.max_products),
                allowedCategories: Array.isArray(data.allowed_categories) ? data.allowed_categories.map(String) : [],
                allowedBrands: Array.isArray(data.allowed_brands) ? data.allowed_brands.map(String) : [],
                categoryBrands: data.category_brands == null ? Prisma.JsonNull : asJson(data.category_brands),
                subscriptionStatus: data.subscription_status == null ? null : String(data.subscription_status),
                subscriptionExpiresAt: data.subscription_expires_at == null ? null : String(data.subscription_expires_at),
                };
                await tx.vendor.upsert({
                    where: { vendorId: vendorData.vendorId },
                    create: vendorData,
                    update: vendorData,
                });
            }
            return;
        }
        case 'vendor_requests.json': {
            await tx.vendorRequest.deleteMany();
            if (items.length) await tx.vendorRequest.createMany({ data: items.map(({ data, index }) => ({
                requestId: String(data.request_id), sortOrder: index, status: String(data.status || 'pending'),
                businessName: String(data.business_name || ''), ownerName: String(data.owner_name || ''),
                email: String(data.email || ''), supabaseUid: data.supabase_uid == null ? undefined : String(data.supabase_uid),
                username: String(data.username || ''),
                whatsappNumber: String(data.whatsapp_number || ''), businessAddress: String(data.business_address || ''),
                businessCategory: String(data.business_category || ''), businessDescription: String(data.business_description || ''),
                productMainCategory: String(data.product_main_category || 'Other Categories'),
                productSubcategory: String(data.product_subcategory || 'Other'),
                requestedBrand: String(data.requested_brand || 'Unbranded'),
                verificationDocType: String(data.verification_doc_type || ''),
                verificationDocPath: String(data.verification_doc_path || ''),
                paymentReceiptPath: String(data.payment_receipt_path || ''),
                paymentRequired: Boolean(data.payment_required),
                paymentAmount: data.payment_amount == null ? null : Number(data.payment_amount),
                paymentInstructions: String(data.payment_instructions || ''),
                paymentStatus: String(data.payment_status || 'not_required'),
                reviewDueAt: data.review_due_at == null ? null : String(data.review_due_at),
                accessDays: data.access_days == null ? null : Number(data.access_days),
                logo: String(data.logo || ''), vendorId: data.vendor_id == null ? undefined : String(data.vendor_id),
                createdAt: String(data.created_at || new Date().toISOString()),
                approvedAt: data.approved_at == null ? undefined : String(data.approved_at),
                rejectedAt: data.rejected_at == null ? undefined : String(data.rejected_at),
                rejectionId: data.rejection_id == null ? undefined : String(data.rejection_id),
                setupTokenHash: data.setup_token_hash == null ? undefined : String(data.setup_token_hash),
                setupTokenExpiresAt: data.setup_token_expires_at == null ? undefined : String(data.setup_token_expires_at),
                setupTokenUsedAt: data.setup_token_used_at == null ? undefined : String(data.setup_token_used_at),
            })) as any });
            return;
        }
        case 'orders.json': {
            await tx.orderRecord.deleteMany();
            for (const { data, index } of items) {
                await tx.orderRecord.create({ data: {
                    orderId: String(data.order_id), sortOrder: index,
                    checkoutId: data.checkout_id == null ? undefined : String(data.checkout_id),
                    vendorId: String(data.vendor_id || ''), customerName: data.customer_name == null ? undefined : String(data.customer_name),
                    customerPhone: data.customer_phone == null ? undefined : String(data.customer_phone), total: Number(data.total || 0),
                    checkoutMethod: String(data.checkout_method || 'whatsapp'), status: String(data.status || 'Pending'),
                    createdAt: String(data.created_at || new Date().toISOString()),
                    whatsappHandoffAt: data.whatsapp_handoff_at == null ? undefined : String(data.whatsapp_handoff_at),
                    vendorWhatsapp: data.vendor_whatsapp == null ? undefined : String(data.vendor_whatsapp),
                    receiptConfirmationTokenHash: data.receipt_confirmation_token_hash == null ? undefined : String(data.receipt_confirmation_token_hash),
                    receiptConfirmationExpiresAt: data.receipt_confirmation_expires_at == null ? undefined : String(data.receipt_confirmation_expires_at),
                    receiptConfirmationSentAt: data.receipt_confirmation_sent_at == null ? undefined : String(data.receipt_confirmation_sent_at),
                    customerReceivedAt: data.customer_received_at == null ? undefined : String(data.customer_received_at),
                    items: { create: (Array.isArray(data.items) ? data.items : []).map((line: Record<string, any>, sortOrder: number) => ({
                        sortOrder, productId: String(line.product_id || ''), vendorId: String(line.vendor_id || ''),
                        productName: String(line.product_name || ''), selectedSize: line.selected_size == null ? undefined : String(line.selected_size),
                        productImage: line.product_image == null ? undefined : String(line.product_image),
                        unitPrice: Number(line.unit_price || 0), quantity: Number(line.quantity || 0), subtotal: Number(line.subtotal || 0),
                    })) },
                    statusHistory: { create: (Array.isArray(data.status_history) ? data.status_history : []).map((change: Record<string, any>, sortOrder: number) => ({
                        sortOrder, status: String(change.status || ''), at: String(change.at || ''), actor: String(change.actor || ''),
                    })) },
                } });
            }
            return;
        }
        case 'analytics.json': {
            await tx.analyticsEvent.deleteMany();
            if (items.length) await tx.analyticsEvent.createMany({ data: items.map(({ data, index }) => ({
                eventId: String(data.event_id), sortOrder: index, type: String(data.type || ''),
                productId: data.product_id == null ? undefined : String(data.product_id),
                vendorId: data.vendor_id == null ? undefined : String(data.vendor_id),
                visitorId: data.visitor_id == null ? undefined : String(data.visitor_id),
                timestamp: String(data.timestamp || ''), orderId: data.order_id == null ? undefined : String(data.order_id),
            })) as any });
            return;
        }
        case 'likes.json': {
            await tx.productLike.deleteMany();
            if (items.length) await tx.productLike.createMany({ data: items.map(({ data, index }) => ({
                productId: String(data.product_id), visitorId: String(data.visitor_id),
                sortOrder: index, createdAt: String(data.created_at || new Date().toISOString()),
            })) as any });
            return;
        }
        case 'customer_inquiries.json': {
            await tx.customerInquiry.deleteMany();
            if (items.length) await tx.customerInquiry.createMany({ data: items.map(({ data, index }) => ({
                id: String(data.id), sortOrder: index, whatsapp: String(data.whatsapp || ''),
                category: String(data.category || 'other'), message: String(data.message || ''),
                createdAt: String(data.created_at || new Date().toISOString()), status: String(data.status || 'new'),
            })) as any });
            return;
        }
        case 'product_feedback.json': {
            await tx.productFeedback.deleteMany();
            if (items.length) await tx.productFeedback.createMany({ data: items.map(({ data, index }) => ({
                id: String(data.id), sortOrder: index, productId: String(data.product_id || ''),
                productTitle: String(data.product_title || ''), name: String(data.name || ''),
                rating: Number(data.rating || 0), message: String(data.message || ''),
                createdAt: String(data.created_at || new Date().toISOString()), status: String(data.status || 'pending'),
            })) as any });
            return;
        }
        case 'music.json': {
            await tx.musicTrack.deleteMany();
            if (items.length) await tx.musicTrack.createMany({ data: items.map(({ data, index }) => ({
                id: String(data.id), sortOrder: index, title: String(data.title || ''),
                file: String(data.file || ''), createdAt: String(data.created_at || new Date().toISOString()),
            })) as any });
            return;
        }
        case 'auth_otps.json': {
            await tx.storeRecord.deleteMany({ where: { collection: 'auth_otps' } });
            return;
        }
        default:
            return;
    }
}

async function serializable<T>(callback: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.$transaction(callback, {
                isolationLevel: 'Serializable', maxWait: 15000, timeout: 30000,
            });
        } catch (error) {
            const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
            if (!retryable || attempt >= 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
}

export async function readJson<T>(name: JsonFileName, fallback?: T): Promise<T> {
    return readFromStore(prisma, name, fallback);
}

export async function writeJson<T>(name: JsonFileName, value: T, _backup = true) {
    await serializable(tx => writeToStore(tx, name, value));
}

export async function updateJson<T>(name: JsonFileName, updater: (current: T) => T, fallback: T): Promise<T> {
    return serializable(async tx => {
        const current = await readFromStore(tx, name, fallback);
        const next = updater(current);
        await writeToStore(tx, name, next);
        return next;
    });
}

export async function updateProductsAtomically<T, R>(
    updater: (current: T[], tx: StoreTransaction) => Promise<{ next: T[]; result: R }>,
): Promise<R> {
    return serializable(async tx => {
        const current = await readFromStore<T[]>(tx, 'products.json', []);
        const { next, result } = await updater(current, tx);
        await writeToStore(tx, 'products.json', next);
        return result;
    });
}

const relationalFiles: JsonFileName[] = [
    'products.json', 'vendors.json', 'vendor_requests.json', 'orders.json', 'analytics.json',
    'likes.json', 'customer_inquiries.json', 'product_feedback.json', 'music.json',
];

/** Backfill the normalized tables and remove each legacy collection atomically. */
export async function migrateStoreRecordsToRelational() {
    return prisma.$transaction(async tx => {
        const report: Record<string, number> = {};
        for (const name of relationalFiles) {
            const collection = collectionName(name);
            const legacyRows = orderedRecords(await tx.storeRecord.findMany({ where: { collection } }));
            if (!legacyRows.length) {
                report[name] = 0;
                continue;
            }

            await writeToStore(tx, name, legacyRows.map(row => row.data));
            const imported = await readFromStore<unknown[]>(tx, name, []);
            if (imported.length !== legacyRows.length)
                throw new Error(`Relational import count mismatch for ${name}: ${legacyRows.length} legacy rows, ${imported.length} imported.`);

            await tx.storeRecord.deleteMany({ where: { collection } });
            report[name] = imported.length;
        }

        // These are obsolete identity/reset registries. Supabase Auth is authoritative.
        await tx.storeRecord.deleteMany({ where: { collection: { in: ['users_auth', 'auth_otps'] } } });
        return report;
    }, { isolationLevel: 'Serializable', maxWait: 15000, timeout: 120000 });
}

export async function nextId(prefix: string, width: number, counterKey: string) {
    const counter = await prisma.storeCounter.upsert({
        where: { key: counterKey }, create: { key: counterKey, value: 1 },
        update: { value: { increment: 1 } },
    });
    return `${prefix}${String(counter.value).padStart(width, '0')}`;
}
