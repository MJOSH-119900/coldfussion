import { cookies } from 'next/headers';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual, } from 'crypto';
import { promisify } from 'util';
import { readJson, DATA_DIR } from './json-store';
import fs from 'fs/promises';
import path from 'path';
const scrypt = promisify(nodeScrypt);
const COOKIE = 'fussion_session';
const LEGACY_SESSION_SECRET = 'change-this-in-production-fussion-session-secret';
const configuredSessionSecret = process.env.FUSSION_SESSION_SECRET?.trim();
if (process.env.NODE_ENV === 'production' &&
    (!configuredSessionSecret || Buffer.byteLength(configuredSessionSecret, 'utf8') < 32 ||
        configuredSessionSecret === LEGACY_SESSION_SECRET)) {
    throw new Error('Production requires a strong FUSSION_SESSION_SECRET of at least 32 bytes.');
}
const SESSION_SECRET = configuredSessionSecret || randomBytes(32).toString('base64url');
type Session = {
    role: 'admin' | 'vendor';
    vendorId?: string;
    email: string;
    authVersion?: number;
    exp: number;
};
type AdminAuth = {
    role: 'admin';
    username_encrypted: string;
    username_hash: string;
    email_encrypted: string;
    email_hash: string;
    password: string;
    status: 'active' | 'disabled';
    created_at: string;
};
type AuthRecord = {
    role?: string;
    username_hash?: string;
    status?: string;
    password: string;
    vendor_id?: string;
    session_version?: number;
    [key: string]: unknown;
};
async function encryptionKey() {
    const configured = process.env.FUSSION_AUTH_ENCRYPTION_KEY || process.env.FUSSION_SESSION_SECRET;
    if (configured)
        return createHash('sha256').update(configured).digest();
    // Local/development fallback: persist a server-only secret outside public/
    // so registration works even when the optional encryption env var is absent.
    // Production deployments should still set FUSSION_AUTH_ENCRYPTION_KEY.
    const secretPath = path.join(DATA_DIR, '.auth-secret');
    try {
        const existing = (await fs.readFile(secretPath, 'utf8')).trim();
        if (existing)
            return createHash('sha256').update(existing).digest();
    }
    catch { }
    await fs.mkdir(DATA_DIR, { recursive: true });
    const generated = randomBytes(48).toString('base64url');
    try {
        await fs.writeFile(secretPath, generated, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    catch { }
    const persisted = (await fs.readFile(secretPath, 'utf8')).trim();
    return createHash('sha256').update(persisted).digest();
}
export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function hashLookup(value: string) { return createHash('sha256').update(value).digest('hex'); }
export async function encryptSecret(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export async function decryptSecret(value: string) {
    const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw)
        throw new Error('Invalid encrypted value.');
    const decipher = createDecipheriv('aes-256-gcm', await encryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}
export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt:${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
    try {
        const [scheme, salt, hash] = stored.split(':');
        if (scheme !== 'scrypt' || !salt || !hash)
            return false;
        const expected = Buffer.from(hash, 'hex');
        const derived = (await scrypt(password, salt, expected.length || 64)) as Buffer;
        return expected.length === derived.length && timingSafeEqual(derived, expected);
    }
    catch {
        return false;
    }
}
function encode(payload: Session) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}
function decode(value: string): Session | null {
    try {
        const [body, sig] = value.split('.');
        if (!body || !sig)
            return null;
        const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
        const actual = Buffer.from(sig);
        const expectedBuffer = Buffer.from(expected);
        if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer))
            return null;
        const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
        return data.exp > Date.now() ? data : null;
    }
    catch {
        return null;
    }
}
export async function createSession(session: Omit<Session, 'exp' | 'authVersion'> & { authVersion?: number }) {
    const store = await cookies();
    store.set(COOKIE, encode({ ...session, authVersion: session.authVersion || 0, exp: Date.now() + 1000 * 60 * 60 * 12 }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12,
    });
}
export async function destroySession() { const store = await cookies(); store.delete(COOKIE); }
export async function getSession(): Promise<Session | null> {
    // cookies() is request-specific. Dashboard pages that call this helper
    // render it inside Suspense when cacheComponents is enabled.
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    const session = raw ? decode(raw) : null;
    if (!session)
        return null;
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    if (session.role === 'admin') {
        const usernameHash = hashLookup(session.email);
        const user = Object.values(users).find(entry => entry.role === 'admin' && entry.username_hash === usernameHash);
        if (!user) {
            const envUsername = (process.env.FUSSION_ADMIN_USERNAME || '').trim().toLowerCase();
            return envUsername && envUsername === session.email ? session : null;
        }
        return user.status === 'active' && Number(user.session_version || 0) === Number(session.authVersion || 0) ? session : null;
    }
    const normalizedEmail = normalizeEmail(session.email);
    const user = users[hashLookup(normalizedEmail)] || users[normalizedEmail] ||
        Object.values(users).find(entry => entry.role === 'vendor' && entry.vendor_id === session.vendorId);
    return user?.role === 'vendor' && user?.status === 'active' &&
        user.vendor_id === session.vendorId &&
        Number(user.session_version || 0) === Number(session.authVersion || 0) ? session : null;
}
export async function requireRole(role: 'admin' | 'vendor') { const session = await getSession(); if (!session || session.role !== role)
    throw new Error('Unauthorized'); return session; }
export async function requireAdmin() { return requireRole('admin'); }
export async function requireVendor() { const s = await requireRole('vendor'); if (!s.vendorId)
    throw new Error('Vendor session is missing vendor ID'); return s as Session & {
    vendorId: string;
}; }
export async function findAuthByUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    if (!normalized)
        return undefined;
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    const usernameHash = hashLookup(normalized);
    const registered = Object.values(users).find(user => user.role === 'admin' && user.status === 'active' && user.username_hash === usernameHash);
    if (registered)
        return { ...registered, username: normalized };
    const envUsername = (process.env.FUSSION_ADMIN_USERNAME || '').trim().toLowerCase();
    const envPassword = process.env.FUSSION_ADMIN_PASSWORD;
    if (envUsername && normalized === envUsername && envPassword) {
        return { role: 'admin', vendor_id: undefined, password: await hashPassword(envPassword), status: 'active', username: normalized, session_version: 0 };
    }
    return undefined;
}
export async function findAuthByEmail(email: string) {
    const normalized = normalizeEmail(email);
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    const hashed = users[hashLookup(normalized)];
    if (hashed)
        return { ...hashed, email: normalized };
    // Backward compatibility for the old v8 vendor records keyed by plaintext email.
    if (users[normalized])
        return { ...users[normalized], email: normalized };
    const envEmail = normalizeEmail(process.env.FUSSION_ADMIN_EMAIL || '');
    const envPassword = process.env.FUSSION_ADMIN_PASSWORD;
    if (normalized === envEmail && envPassword) {
        return { role: 'admin', vendor_id: undefined, password: await hashPassword(envPassword), status: 'active', email: normalized, session_version: 0 };
    }
    return undefined;
}
export async function getAdminAuthByEmail(email: string): Promise<AdminAuth | undefined> {
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    const value = users[hashLookup(normalizeEmail(email))];
    return value?.role === 'admin' ? value as AdminAuth : undefined;
}
export async function hasRegisteredAdmin() {
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    if (Object.values(users).some(user => user.role === 'admin' && user.status === 'active'))
        return true;
    return Boolean(process.env.FUSSION_ADMIN_USERNAME && process.env.FUSSION_ADMIN_PASSWORD);
}
