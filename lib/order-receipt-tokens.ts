import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOrderReceiptToken() {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashOrderReceiptToken(token);
    if (!tokenHash) throw new Error('Could not generate an order receipt confirmation token.');
    return { token, tokenHash };
}

export function hashOrderReceiptToken(token: string) {
    if (!/^[a-f\d]{64}$/i.test(token)) return null;
    return createHash('sha256').update(token.toLowerCase()).digest('hex');
}

export function matchesOrderReceiptToken(token: string, storedHash: string | undefined) {
    const tokenHash = hashOrderReceiptToken(token);
    if (!tokenHash || !storedHash || !/^[a-f\d]{64}$/i.test(storedHash)) return false;
    return timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function isOrderReceiptConfirmationExpired(expiresAt: string | undefined, now = Date.now()) {
    const expiration = Date.parse(expiresAt || '');
    return !Number.isFinite(expiration) || expiration <= now;
}
