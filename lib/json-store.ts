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
type StoreTransaction = Pick<Prisma.TransactionClient,
    | 'storeRecord' | 'storeSetting' | 'storeCounter' | 'product' | 'vendor' | 'vendorRequest'
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
                price: row.price, compare_at_price: row.compareAtPrice ?? undefined,
                size_prices: row.sizePrices ?? undefined, giveaway: row.giveaway,
                giveaway_announcement: row.giveawayAnnouncement ?? undefined,
                available_quantity: row.availableQuantity, is_available: row.isAvailable,
                images: row.images, category: row.category, tags: row.tags, likes_count: row.likesCount,
                vendor_whatsapp: row.vendorWhatsapp, vendor_business_name: row.vendorBusinessName ?? undefined,
                location: row.location ?? undefined, condition: row.condition ?? undefined,
                detail_gallery_enabled: row.detailGalleryEnabled, is_latest: row.isLatest,
                is_top_selling: row.isTopSelling,
                related_products_mode: row.relatedProductsMode ?? undefined,
                related_product_ids: row.relatedProductIds,
            }));
            break;
        }
        case 'vendors.json': {
            const rows = await tx.vendor.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                vendor_id: row.vendorId, business_name: row.businessName, owner_name: row.ownerName,
                email: row.email, whatsapp_number: row.whatsappNumber,
                business_address: row.businessAddress, business_category: row.businessCategory,
                business_description: row.businessDescription, logo: row.logo, status: row.status,
                created_at: row.createdAt, updated_at: row.updatedAt ?? undefined,
            }));
            break;
        }
        case 'vendor_requests.json': {
            const rows = await tx.vendorRequest.findMany({ orderBy: { sortOrder: 'asc' } });
            values = rows.map(row => ({
                request_id: row.requestId, status: row.status, business_name: row.businessName,
                owner_name: row.ownerName, email: row.email, supabase_uid: row.supabaseUid ?? undefined,
                whatsapp_number: row.whatsappNumber, business_address: row.businessAddress,
                business_category: row.businessCategory, business_description: row.businessDescription,
                logo: row.logo, vendor_id: row.vendorId ?? undefined, created_at: row.createdAt,
                approved_at: row.approvedAt ?? undefined, rejected_at: row.rejectedAt ?? undefined,
                rejection_id: row.rejectionId ?? undefined,
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
            await tx.product.deleteMany();
            if (items.length) await tx.product.createMany({ data: items.map(({ data, index }) => ({
                id: String(data.id), sortOrder: index, vendorId: String(data.vendor_id || ''),
                title: String(data.title || ''), description: String(data.description || ''),
                price: Number(data.price || 0), compareAtPrice: data.compare_at_price == null ? undefined : Number(data.compare_at_price),
                sizePrices: data.size_prices == null ? undefined : asJson(data.size_prices),
                giveaway: Boolean(data.giveaway), giveawayAnnouncement: data.giveaway_announcement == null ? undefined : String(data.giveaway_announcement),
                availableQuantity: Number(data.available_quantity || 0), isAvailable: Boolean(data.is_available),
                images: Array.isArray(data.images) ? data.images.map(String) : [], category: String(data.category || 'Other'),
                tags: Array.isArray(data.tags) ? data.tags.map(String) : [], likesCount: Number(data.likes_count || 0),
                vendorWhatsapp: String(data.vendor_whatsapp || ''), vendorBusinessName: data.vendor_business_name == null ? undefined : String(data.vendor_business_name),
                location: data.location == null ? undefined : String(data.location), condition: data.condition == null ? undefined : String(data.condition),
                detailGalleryEnabled: Boolean(data.detail_gallery_enabled), isLatest: Boolean(data.is_latest),
                isTopSelling: Boolean(data.is_top_selling), relatedProductsMode: data.related_products_mode == null ? undefined : String(data.related_products_mode),
                relatedProductIds: Array.isArray(data.related_product_ids) ? data.related_product_ids.map(String) : [],
            })) as any });
            return;
        }
        case 'vendors.json': {
            await tx.vendor.deleteMany();
            if (items.length) await tx.vendor.createMany({ data: items.map(({ data, index }) => ({
                vendorId: String(data.vendor_id), sortOrder: index, businessName: String(data.business_name || ''),
                ownerName: String(data.owner_name || ''), email: String(data.email || ''),
                whatsappNumber: String(data.whatsapp_number || ''), businessAddress: String(data.business_address || ''),
                businessCategory: String(data.business_category || ''), businessDescription: String(data.business_description || ''),
                logo: String(data.logo || ''), status: String(data.status || 'suspended'),
                createdAt: String(data.created_at || new Date().toISOString()),
                updatedAt: data.updated_at == null ? undefined : String(data.updated_at),
            })) as any });
            return;
        }
        case 'vendor_requests.json': {
            await tx.vendorRequest.deleteMany();
            if (items.length) await tx.vendorRequest.createMany({ data: items.map(({ data, index }) => ({
                requestId: String(data.request_id), sortOrder: index, status: String(data.status || 'pending'),
                businessName: String(data.business_name || ''), ownerName: String(data.owner_name || ''),
                email: String(data.email || ''), supabaseUid: data.supabase_uid == null ? undefined : String(data.supabase_uid),
                whatsappNumber: String(data.whatsapp_number || ''), businessAddress: String(data.business_address || ''),
                businessCategory: String(data.business_category || ''), businessDescription: String(data.business_description || ''),
                logo: String(data.logo || ''), vendorId: data.vendor_id == null ? undefined : String(data.vendor_id),
                createdAt: String(data.created_at || new Date().toISOString()),
                approvedAt: data.approved_at == null ? undefined : String(data.approved_at),
                rejectedAt: data.rejected_at == null ? undefined : String(data.rejected_at),
                rejectionId: data.rejection_id == null ? undefined : String(data.rejection_id),
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
