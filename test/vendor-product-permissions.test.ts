import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeVendorProductSubmission, matchesApprovedProductRequest } from '../lib/vendor-product-permissions';

const initialPolicy = {
    mainCategory: 'Fashion and Apparel',
    subcategory: 'Women',
    initialPermissionAvailable: true,
};

const request = {
    requestId: 'VPRQ0001',
    mainCategory: 'Electronics and Technology',
    subcategory: 'Phones and Tablets',
    productName: 'Wireless phone',
    productDescription: 'A new wireless phone.',
    status: 'approved',
    fulfilledAt: null,
};

test('allows the first listing only in the registered category pair', () => {
    const result = authorizeVendorProductSubmission(initialPolicy, [], {
        category: 'Fashion and Apparel',
        subcategory: 'Women',
        title: 'Dress',
        description: 'A summer dress.',
    });

    assert.deepEqual(result, { allowed: true, grant: { type: 'initial' } });
});

test('preserves legacy first-product policies that use the generic Other subcategory', () => {
    assert.deepEqual(
        authorizeVendorProductSubmission(
            { mainCategory: 'Other Categories', subcategory: 'Other', initialPermissionAvailable: true },
            [],
            { category: 'Other Categories', subcategory: 'Other', title: 'Desk lamp', description: 'A desk lamp.' },
        ),
        { allowed: true, grant: { type: 'initial' } },
    );
});

test('blocks a second listing after the initial permission is used', () => {
    const result = authorizeVendorProductSubmission(
        { ...initialPolicy, initialPermissionAvailable: false },
        [],
        { category: 'Fashion and Apparel', subcategory: 'Women', title: 'Another dress', description: 'Another listing.' },
    );

    assert.equal(result.allowed, false);
});

test('allows only the exact product attached to an approved request', () => {
    const result = authorizeVendorProductSubmission(
        { ...initialPolicy, initialPermissionAvailable: false },
        [request],
        {
            category: request.mainCategory,
            subcategory: request.subcategory,
            title: request.productName,
            description: request.productDescription,
        },
        request.requestId,
    );

    assert.deepEqual(result, { allowed: true, grant: { type: 'request', requestId: request.requestId } });
});

test('rejects altered approved product details or categories', () => {
    for (const submission of [
        { category: request.mainCategory, subcategory: request.subcategory, title: 'Different phone', description: request.productDescription },
        { category: request.mainCategory, subcategory: request.subcategory, title: request.productName, description: 'Changed description' },
        { category: 'Fashion and Apparel', subcategory: 'Women', title: request.productName, description: request.productDescription },
    ]) {
        const result = authorizeVendorProductSubmission(
            { ...initialPolicy, initialPermissionAvailable: false },
            [request],
            submission,
            request.requestId,
        );
        assert.equal(result.allowed, false);
    }
});

test('keeps a published approved product from being repurposed during edits', () => {
    assert.equal(matchesApprovedProductRequest(request, {
        category: request.mainCategory,
        subcategory: request.subcategory,
        title: '  WIRELESS   PHONE ',
        description: request.productDescription,
    }), true);
    assert.equal(matchesApprovedProductRequest(request, {
        category: request.mainCategory,
        subcategory: request.subcategory,
        title: 'Different phone',
        description: request.productDescription,
    }), false);
});

test('does not reuse a fulfilled approval or fail open when policy is missing', () => {
    const fulfilled = authorizeVendorProductSubmission(
        { ...initialPolicy, initialPermissionAvailable: false },
        [{ ...request, fulfilledAt: '2026-01-01T00:00:00.000Z' }],
        { category: request.mainCategory, subcategory: request.subcategory, title: request.productName, description: request.productDescription },
        request.requestId,
    );
    const missingPolicy = authorizeVendorProductSubmission(
        null,
        [request],
        { category: request.mainCategory, subcategory: request.subcategory, title: request.productName, description: request.productDescription },
        request.requestId,
    );

    assert.equal(fulfilled.allowed, false);
    assert.equal(missingPolicy.allowed, false);
});
