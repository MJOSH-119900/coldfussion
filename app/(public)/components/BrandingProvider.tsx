'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BrandSettings } from './types/store';

const DEFAULT_BRAND: BrandSettings = { companyName: 'Fussion', logo: '' };
const BrandingContext = createContext<{
    brand: BrandSettings;
    setBrand: (brand: BrandSettings) => void;
}>({
    brand: DEFAULT_BRAND,
    setBrand: () => undefined,
});

export function BrandingProvider({ children, initialBrand }: { children: ReactNode; initialBrand: BrandSettings }) {
    const [brand, setBrand] = useState(initialBrand);

    useEffect(() => {
        let active = true;
        const refreshBrand = async () => {
            try {
                const response = await fetch('/api/branding', { cache: 'no-store' });
                if (!response.ok) throw new Error('Could not refresh company branding.');
                const updated = await response.json() as BrandSettings;
                if (active && typeof updated.companyName === 'string' && typeof updated.logo === 'string') {
                    setBrand(current => current.companyName === updated.companyName && current.logo === updated.logo ? current : updated);
                }
            } catch (error) {
                console.error('Branding refresh failed', error);
            }
        };
        void refreshBrand();
        const interval = setInterval(() => { void refreshBrand(); }, 10000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    return <BrandingContext.Provider value={{ brand, setBrand }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
    return useContext(BrandingContext);
}
