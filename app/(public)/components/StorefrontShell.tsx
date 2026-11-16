'use client';

import { usePathname } from 'next/navigation';
import PublicNav from './PublicNav';
import BackgroundMusicPlayer from './BackgroundMusicPlayer';

/**
 * Lives in the root layout so its audio element is not destroyed when shoppers
 * navigate between the home page, products, seller registration, wishlist,
 * cart, or checkout. The player is hidden (not unmounted) outside storefront
 * routes, preserving the same audio element and playback position.
 */
export default function StorefrontShell() {
    const pathname = usePathname();
    const isStorefront = pathname === '/' ||
        pathname.startsWith('/product/') ||
        (pathname.startsWith('/vendor/') && !pathname.startsWith('/vendor/dashboard') && !pathname.startsWith('/vendor/login')) ||
        pathname === '/wishlist' ||
        pathname === '/cart' ||
        pathname === '/checkout';

    return (
        <>
            {isStorefront && <PublicNav />}
            <BackgroundMusicPlayer visible={isStorefront} />
        </>
    );
}
