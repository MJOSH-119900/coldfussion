import "../globals.css";

// Storefront navigation and music live in the root layout so they persist
// across route changes into product, seller, wishlist, cart and checkout pages.
export default function PublicLayout({ children }: LayoutProps<"/">) {
    return <div className="min-h-screen">{children}</div>;
}
