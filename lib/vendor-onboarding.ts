export type VendorOnboardingSettings = {
    payment_enabled: boolean;
    payment_amount: number;
    payment_instructions: string;
    default_access_days: number;
};

export const DEFAULT_VENDOR_ONBOARDING_SETTINGS: VendorOnboardingSettings = {
    payment_enabled: false,
    payment_amount: 0,
    payment_instructions: '',
    default_access_days: 0,
};

export function normalizeVendorOnboardingSettings(value: unknown): VendorOnboardingSettings {
    const settings = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    return {
        payment_enabled: settings.payment_enabled === true,
        payment_amount: Number.isFinite(Number(settings.payment_amount)) ? Math.max(0, Math.floor(Number(settings.payment_amount))) : 0,
        payment_instructions: String(settings.payment_instructions || '').trim().slice(0, 2000),
        default_access_days: Number.isFinite(Number(settings.default_access_days)) ? Math.max(0, Math.min(3650, Math.floor(Number(settings.default_access_days)))) : 0,
    };
}

export function isVendorAccessActive(vendor: { status?: string; access_expires_at?: string | null }, now = Date.now()) {
    if (!['approved', 'active'].includes(String(vendor.status || ''))) return false;
    if (!vendor.access_expires_at) return true;
    const expiresAt = Date.parse(vendor.access_expires_at);
    return Number.isFinite(expiresAt) && expiresAt > now;
}

/** Subscription gate for public discovery; older records fall back to the existing access fields. */
export function isVendorSubscriptionActive(vendor: {
    status?: string;
    access_expires_at?: string | null;
    subscription_status?: string | null;
    subscription_expires_at?: string | null;
}, now = Date.now()) {
    if (vendor.subscription_status == null && vendor.subscription_expires_at == null) {
        return isVendorAccessActive(vendor, now);
    }
    if (vendor.subscription_status !== 'active' || !vendor.subscription_expires_at) return false;
    const expiresAt = Date.parse(vendor.subscription_expires_at);
    return Number.isFinite(expiresAt) && expiresAt > now && ['approved', 'active'].includes(String(vendor.status || ''));
}
