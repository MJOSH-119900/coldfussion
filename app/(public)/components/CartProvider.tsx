'use client';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CartItem, Product } from './types/store';
const CART_KEY = 'fussion_cart';
const WISHLIST_KEY = 'user_wishlist';
const BUY_NOW_KEY = 'fussion_buy_now';
type CartContextValue = {
    cart: CartItem[];
    wishlist: string[];
    cartCount: number;
    cartTotal: number;
    isReady: boolean;
    addToCart: (product: Product, quantity?: number, selectedSize?: string) => boolean;
    updateQuantity: (id: string, quantity: number) => void;
    increment: (id: string) => void;
    decrement: (id: string) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    toggleWishlist: (id: string) => void;
    isWishlisted: (id: string) => boolean;
    buyNow: (product: Product, quantity?: number, selectedSize?: string) => void;
};
const CartContext = createContext<CartContextValue | null>(null);
function readJSON<T>(key: string, fallback: T): T {
    try {
        const value = window.localStorage.getItem(key);
        if (!value)
            return fallback;
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed as T : fallback;
    }
    catch {
        return fallback;
    }
}
export function CartProvider({ children }: {
    children: ReactNode;
}) {
    const router = useRouter();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [wishlist, setWishlist] = useState<string[]>([]);
    const [hydrated, setHydrated] = useState(false);
    // Hydrate from localStorage before allowing state effects to write back.
    // Without this guard, the initial empty [] state can overwrite persisted
    // cart/wishlist data during the first render after a refresh.
    useEffect(() => {
        setCart(readJSON<CartItem[]>(CART_KEY, []));
        setWishlist(readJSON<string[]>(WISHLIST_KEY, []));
        setHydrated(true);
    }, []);
    useEffect(() => {
        if (!hydrated)
            return;
        try {
            const serialized = JSON.stringify(cart);
            if (window.localStorage.getItem(CART_KEY) !== serialized)
                window.localStorage.setItem(CART_KEY, serialized);
        }
        catch (error) {
            console.error('Could not persist cart', error);
        }
    }, [cart, hydrated]);
    useEffect(() => {
        if (!hydrated)
            return;
        try {
            const serialized = JSON.stringify(wishlist);
            if (window.localStorage.getItem(WISHLIST_KEY) !== serialized)
                window.localStorage.setItem(WISHLIST_KEY, serialized);
        }
        catch (error) {
            console.error('Could not persist wishlist', error);
        }
    }, [wishlist, hydrated]);
    useEffect(() => {
        if (!hydrated)
            return;
        const syncStorage = (event: StorageEvent) => {
            if (event.key === CART_KEY)
                setCart(readJSON<CartItem[]>(CART_KEY, []));
            if (event.key === WISHLIST_KEY)
                setWishlist(readJSON<string[]>(WISHLIST_KEY, []));
        };
        window.addEventListener('storage', syncStorage);
        return () => window.removeEventListener('storage', syncStorage);
    }, [hydrated]);
    const addToCart = (product: Product, quantity = 1, selectedSize?: string): boolean => {
        if ((product.available_quantity ?? 0) <= 0) return false;
        const max = product.available_quantity ?? Infinity;
        const cartKey = `${product.id}::${selectedSize || ''}`;
        const existingItem = cart.find(item => (item.cart_key || `${item.id}::${item.selected_size || ''}`) === cartKey);
        const totalForProduct = cart.filter(item => item.id === product.id).reduce((sum, item) => sum + item.quantity, 0);
        if (totalForProduct + quantity > max) return false;
        if (existingItem && existingItem.quantity >= max) return false;
        setCart(current => {
            const existing = current.find(item => (item.cart_key || `${item.id}::${item.selected_size || ''}`) === cartKey);
            if (existing) return current.map(item => (item.cart_key || `${item.id}::${item.selected_size || ''}`) === cartKey ? { ...item, quantity: Math.min(item.quantity + quantity, max) } : item);
            return [...current, { ...product, selected_size: selectedSize, cart_key: cartKey, quantity: Math.min(Math.max(quantity, 1), max) }];
        });
        return true;
    };
    const updateQuantity = (id: string, quantity: number) => {
        setCart(current => current.map(item => {
            if ((item.cart_key || item.id) !== id)
                return item;
            const max = item.available_quantity ?? Infinity;
            const usedByOtherSizes = current.filter(other => other.id === item.id && (other.cart_key || other.id) !== id).reduce((sum, other) => sum + other.quantity, 0);
            const remaining = Math.max(1, max - usedByOtherSizes);
            return { ...item, quantity: Math.min(Math.max(quantity, 1), remaining) };
        }));
    };
    const increment = (id: string) => {
        const item = cart.find(value => (value.cart_key || value.id) === id);
        if (item)
            updateQuantity(id, item.quantity + 1);
    };
    const decrement = (id: string) => {
        const item = cart.find(value => (value.cart_key || value.id) === id);
        if (!item || item.quantity <= 1) return;
        updateQuantity(id, item.quantity - 1);
    };
    const removeFromCart = (id: string) => setCart(current => current.filter(item => (item.cart_key || item.id) !== id));
    const clearCart = () => setCart([]);
    const toggleWishlist = (id: string) => {
        setWishlist(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    };
    const isWishlisted = (id: string) => wishlist.includes(id);
    const buyNow = (product: Product, quantity = 1, selectedSize?: string) => {
        if ((product.available_quantity ?? 0) <= 0) return;
        sessionStorage.setItem(BUY_NOW_KEY, JSON.stringify([{ ...product, selected_size: selectedSize, cart_key: `${product.id}::${selectedSize || ''}`, quantity }]));
        router.push('/checkout?mode=buy-now');
    };
    const value = useMemo<CartContextValue>(() => ({
        cart,
        isReady: hydrated,
        wishlist,
        cartCount: cart.length,
        cartTotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        addToCart,
        updateQuantity,
        increment,
        decrement,
        removeFromCart,
        clearCart,
        toggleWishlist,
        isWishlisted,
        buyNow,
    }), [cart, wishlist, hydrated]);
    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() {
    const context = useContext(CartContext);
    if (!context)
        throw new Error('useCart must be used inside CartProvider');
    return context;
}
