export interface Product {
    id: string;
    vendor_id: string;
    title: string;
    description: string;
    price: number;
    compare_at_price?: number;
    size_prices?: { size: string; price: number; compare_at_price?: number }[];
    giveaway?: boolean;
    giveaway_announcement?: string;
    available_quantity?: number;
    is_available?: boolean;
    images: string[];
    category: string;
    tags: string[];
    likes_count: number;
    vendor_whatsapp: string;
    vendor_business_name?: string;
    location?: string;
    condition?: 'new' | 'used' | 'spare-part';
    detail_gallery_enabled?: boolean;
    is_latest?: boolean;
    is_top_selling?: boolean;
    related_products_mode?: 'category' | 'random' | 'manual';
    related_product_ids?: string[];
}
export interface CartItem extends Product {
    quantity: number;
    selected_size?: string;
    cart_key?: string;
}
export type OrderStatus = 'Pending' | 'Acknowledged' | 'Processing' | 'Completing' | 'Sold' | 'Rejected' | 'Cancelled';
export interface OrderItem {
    product_id: string;
    vendor_id: string;
    product_name: string;
    selected_size?: string;
    product_image?: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
}
export interface Order {
    order_id: string;
    checkout_id?: string;
    vendor_id: string;
    items: OrderItem[];
    customer_name?: string;
    customer_phone?: string;
    total: number;
    checkout_method: 'whatsapp';
    status: OrderStatus;
    created_at: string;
    whatsapp_handoff_at?: string;
    vendor_whatsapp?: string;
    status_history: {
        status: OrderStatus;
        at: string;
        actor: string;
    }[];
}
