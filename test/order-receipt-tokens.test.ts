import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createOrderReceiptToken,
    hashOrderReceiptToken,
    isOrderReceiptConfirmationExpired,
    matchesOrderReceiptToken,
} from '../lib/order-receipt-tokens';

test('creates an unguessable receipt token and matches only its hash', () => {
    const { token, tokenHash } = createOrderReceiptToken();
    assert.match(token, /^[a-f\d]{64}$/);
    assert.equal(hashOrderReceiptToken(token), tokenHash);
    assert.equal(matchesOrderReceiptToken(token, tokenHash), true);
    assert.equal(matchesOrderReceiptToken('invalid', tokenHash), false);
    assert.equal(matchesOrderReceiptToken('0'.repeat(64), tokenHash), false);
});

test('rejects expired or malformed receipt confirmation expirations', () => {
    assert.equal(isOrderReceiptConfirmationExpired('not-a-date', 1000), true);
    assert.equal(isOrderReceiptConfirmationExpired(new Date(999).toISOString(), 1000), true);
    assert.equal(isOrderReceiptConfirmationExpired(new Date(1001).toISOString(), 1000), false);
});
