export const PRODUCT_CATEGORIES = {
    'Fashion and Apparel': [
        'Men', 'Women', 'Kids', 'Shoes', 'Bags and Accessories', 'Jewelry and Watches',
        'Traditional Wear', 'Sportswear', 'Other',
    ],
    'Electronics and Technology': [
        'Phones and Tablets', 'Computers and Accessories', 'Audio and Headphones',
        'Cameras and Photography', 'TVs and Home Entertainment', 'Home Appliances',
        'Gaming', 'Smart Devices', 'Other',
    ],
    'Food and Beverage': [
        'Fresh Produce', 'Pantry and Staples', 'Snacks and Confectionery',
        'Drinks and Beverages', 'Bakery and Dairy', 'Prepared Meals',
        'Frozen and Chilled', 'Other',
    ],
    'Home and Garden': [
        'Furniture', 'Kitchen and Dining', 'Bedding and Bath', 'Home Decor',
        'Garden and Outdoor', 'Lighting', 'Tools and Home Improvement',
        'Storage and Organization', 'Other',
    ],
    'Health and Beauty': [
        'Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Personal Care',
        'Vitamins and Supplements', 'Health and Wellness', 'Other',
    ],
    'Pet Supplies': [
        'Dogs', 'Cats', 'Birds', 'Fish and Aquatics', 'Small Pets',
        'Pet Food', 'Pet Accessories', 'Grooming and Healthcare', 'Other',
    ],
    'Other Categories': [
        'Automotive', 'Books and Media', 'Baby and Kids', 'Office and School',
        'Sports and Outdoors', 'Toys and Games', 'Travel and Luggage', 'Other',
    ],
} as const;

export type ProductMainCategory = keyof typeof PRODUCT_CATEGORIES;

export const PRODUCT_MAIN_CATEGORIES = Object.keys(PRODUCT_CATEGORIES) as ProductMainCategory[];
export const OTHER_SUBCATEGORY_PREFIX = 'Other: ';

const LEGACY_CATEGORY_MAP: Record<string, ProductMainCategory> = {
    fashion: 'Fashion and Apparel',
    electronics: 'Electronics and Technology',
    tech: 'Electronics and Technology',
    food: 'Food and Beverage',
    home: 'Home and Garden',
    beauty: 'Health and Beauty',
    pets: 'Pet Supplies',
    other: 'Other Categories',
};

export function isProductMainCategory(value: string): value is ProductMainCategory {
    return Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORIES, value);
}

export function getProductSubcategories(category: string): readonly string[] {
    return isProductMainCategory(category) ? PRODUCT_CATEGORIES[category] : [];
}

export function normalizeSelectedProductSubcategory(selected: string, custom: string): string | null {
    const normalizedSelected = selected.trim();
    const normalizedCustom = custom.trim().replace(/\s+/g, ' ');
    if (normalizedSelected === 'Other') {
        return normalizedCustom && normalizedCustom.length <= 100
            ? `${OTHER_SUBCATEGORY_PREFIX}${normalizedCustom}`
            : null;
    }
    return normalizedCustom ? null : normalizedSelected;
}

export function isValidProductCategoryPair(category: string, subcategory: string) {
    if (getProductSubcategories(category).includes(subcategory)) return true;
    if (!isProductMainCategory(category) || !subcategory.startsWith(OTHER_SUBCATEGORY_PREFIX)) return false;
    const customSubcategory = subcategory.slice(OTHER_SUBCATEGORY_PREFIX.length).trim();
    return customSubcategory.length > 0 && customSubcategory.length <= 100;
}

export function normalizeProductMainCategory(category: string) {
    const trimmed = category.trim();
    if (isProductMainCategory(trimmed)) return trimmed;
    return LEGACY_CATEGORY_MAP[trimmed.toLowerCase()] || trimmed;
}

export function matchesStorefrontCategory(productCategory: string, selectedCategory: string) {
    return selectedCategory === 'All' ||
        normalizeProductMainCategory(productCategory).toLowerCase() === selectedCategory.toLowerCase();
}

export function matchesStorefrontSubcategory(productSubcategory: string | undefined, selectedSubcategory: string) {
    return selectedSubcategory === 'All' ||
        (productSubcategory || '').trim().toLowerCase() === selectedSubcategory.toLowerCase();
}
