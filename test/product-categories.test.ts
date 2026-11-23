import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isValidProductCategoryPair,
    matchesStorefrontCategory,
    matchesStorefrontSubcategory,
    normalizeSelectedProductSubcategory,
    normalizeProductMainCategory,
} from '../lib/product-categories';

test('maps existing product categories into the fixed storefront taxonomy', () => {
    assert.equal(normalizeProductMainCategory('Electronics'), 'Electronics and Technology');
    assert.equal(matchesStorefrontCategory('Electronics', 'Electronics and Technology'), true);
    assert.equal(matchesStorefrontCategory('Electronics', 'Fashion and Apparel'), false);
});

test('filters product subcategories and validates category-dependent selections', () => {
    assert.equal(matchesStorefrontSubcategory('Phones and Tablets', 'Phones and Tablets'), true);
    assert.equal(matchesStorefrontSubcategory('Phones and Tablets', 'Women'), false);
    assert.equal(isValidProductCategoryPair('Electronics and Technology', 'Phones and Tablets'), true);
    assert.equal(isValidProductCategoryPair('Electronics and Technology', 'Women'), false);
});

test('requires a custom label when Other is selected and validates the stored label', () => {
    assert.equal(normalizeSelectedProductSubcategory('Other', ''), null);
    const custom = normalizeSelectedProductSubcategory('Other', '  Handmade   baskets ');
    assert.equal(custom, 'Other: Handmade baskets');
    assert.equal(isValidProductCategoryPair('Home and Garden', custom || ''), true);
    assert.equal(isValidProductCategoryPair('Home and Garden', 'Other: '), false);
    assert.equal(normalizeSelectedProductSubcategory('Women', 'Not allowed'), null);
});
