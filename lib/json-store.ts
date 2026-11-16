import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
// Vercel functions can write only to /tmp. Use it for a preview-friendly,
// per-instance copy while keeping the checked-in JSON files as read-only seeds.
const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.FUSSION_DATA_DIR || (process.env.VERCEL === '1' ? '/tmp/fussion-data' : './data'));
const SEED_DIR = path.resolve(/* turbopackIgnore: true */ './data');
const LOCK_DIR = path.join(DATA_DIR, '.locks');
export type JsonFileName = 'vendors.json' | 'vendor_requests.json' | 'products.json' | 'users_auth.json' | 'orders.json' | 'analytics.json' | 'counters.json' | 'likes.json' | 'auth_otps.json' | 'music.json' | 'music_settings.json' | 'site_settings.json' | 'customer_inquiries.json' | 'product_feedback.json';
const defaults: Record<JsonFileName, unknown> = {
    'vendors.json': [], 'vendor_requests.json': [], 'products.json': [], 'users_auth.json': {},
    'orders.json': [], 'analytics.json': [], 'counters.json': {}, 'likes.json': [], 'auth_otps.json': [], 'music.json': [], 'music_settings.json': { enabled: true, updated_at: null }, 'site_settings.json': { admin_whatsapp: '' },
    'customer_inquiries.json': [], 'product_feedback.json': []
};
async function ensureDir() { await fs.mkdir(DATA_DIR, { recursive: true }); await fs.mkdir(LOCK_DIR, { recursive: true }); }
async function migrateFile(name: JsonFileName) {
    await ensureDir();
    const target = path.join(DATA_DIR, name);
    try {
        await fs.access(target);
        return;
    }
    catch { }
    // Seed the temporary Vercel store with the deployed catalog and settings.
    // Each invocation can then use the normal JSON API; changes are ephemeral.
    try {
        await fs.copyFile(path.join(SEED_DIR, name), target, constants.COPYFILE_EXCL);
        return;
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    }
    const value = defaults[name];
    await atomicWrite(name, value, false);
}
export function dataPath(name: JsonFileName) { return path.join(DATA_DIR, name); }
export async function readJson<T>(name: JsonFileName, fallback?: T): Promise<T> {
    await migrateFile(name);
    try {
        const raw = await fs.readFile(dataPath(name), 'utf8');
        return JSON.parse(raw || JSON.stringify(fallback ?? defaults[name])) as T;
    }
    catch {
        return (fallback ?? defaults[name]) as T;
    }
}
async function acquireLock(name: JsonFileName) {
    await ensureDir();
    const lock = path.join(LOCK_DIR, `${name}.lock`);
    for (let i = 0; i < 50; i++) {
        try {
            const handle = await fs.open(lock, 'wx');
            return { lock, handle };
        }
        catch {
            await new Promise(r => setTimeout(r, 20 + i * 5));
        }
    }
    throw new Error(`Could not acquire data lock for ${name}`);
}
async function atomicWrite(name: JsonFileName, value: unknown, backup = true) {
    await ensureDir();
    const target = dataPath(name);
    if (backup) {
        try {
            await fs.copyFile(target, `${target}.bak`);
        }
        catch { }
    }
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, target);
}
export async function writeJson<T>(name: JsonFileName, value: T, backup = true) {
    const { lock, handle } = await acquireLock(name);
    try {
        await atomicWrite(name, value, backup);
    }
    finally {
        await handle.close();
        await fs.rm(lock, { force: true });
    }
}
export async function updateJson<T>(name: JsonFileName, updater: (current: T) => T, fallback: T): Promise<T> {
    const { lock, handle } = await acquireLock(name);
    try {
        const current = await readJson<T>(name, fallback);
        const next = updater(current);
        await atomicWrite(name, next, true);
        return next;
    }
    finally {
        await handle.close();
        await fs.rm(lock, { force: true });
    }
}
export async function nextId(prefix: string, width: number, counterKey: string) {
    let result = '';
    await updateJson<Record<string, number>>('counters.json', counters => {
        const next = (counters[counterKey] || 0) + 1;
        counters[counterKey] = next;
        result = `${prefix}${String(next).padStart(width, '0')}`;
        return counters;
    }, {});
    return result;
}
export { DATA_DIR };
