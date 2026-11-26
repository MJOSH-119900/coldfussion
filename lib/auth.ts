import 'server-only';
import { cookies } from 'next/headers';
import { readJson } from './json-store';
import { createSupabaseServerClient } from '../server/supabase';
import { createSupabaseAdminClient } from '../server/supabase-admin';
import { isVendorAccessActive } from './vendor-onboarding';

type Session = {
    role: 'admin' | 'super_admin' | 'vendor';
    vendorId?: string;
    email: string;
    uid: string;
    renewalOnly?: boolean;
};

type AppMetadata = {
    role?: string;
    vendor_id?: string;
};

export function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

export async function getSession(): Promise<Session | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        if (error.name === 'AuthSessionMissingError' || error.status === 400 || error.status === 401)
            return null;
        throw error;
    }

    const user = data.user;
    if (!user?.email || !user.email_confirmed_at)
        return null;

    const metadata = user.app_metadata as AppMetadata;
    const email = normalizeEmail(user.email);
    if (metadata.role === 'admin' || metadata.role === 'super_admin') {
        if (metadata.role === 'super_admin') return { role: 'super_admin', email, uid: user.id };
        // Upgrade the original first-admin account on existing deployments.
        // The first account was the only one creatable through setup-token registration.
        const admin = createSupabaseAdminClient();
        const { data: page, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (!listError) {
            const superAdminExists = page.users.some(candidate => candidate.app_metadata?.role === 'super_admin');
            const firstAdmin = page.users.filter(candidate => candidate.app_metadata?.role === 'admin').sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
            if (!superAdminExists && firstAdmin) {
                const { error: upgradeError } = await admin.auth.admin.updateUserById(firstAdmin.id, { app_metadata: { role: 'super_admin' } });
                if (!upgradeError && firstAdmin.id === user.id) return { role: 'super_admin', email, uid: user.id };
            }
        }
        return { role: 'admin', email, uid: user.id };
    }

    if (metadata.role === 'vendor' && typeof metadata.vendor_id === 'string') {
        const vendors = await readJson<Array<{ vendor_id?: string; status?: string; access_expires_at?: string }>>('vendors.json', []);
        const vendor = vendors.find(item => item.vendor_id === metadata.vendor_id);
        if (vendor && isVendorAccessActive(vendor))
            return { role: 'vendor', vendorId: metadata.vendor_id, email, uid: user.id };
        if (vendor && ['approved', 'active'].includes(String(vendor.status || '')) && vendor.access_expires_at) {
            const expiresAt = Date.parse(vendor.access_expires_at);
            if (Number.isFinite(expiresAt) && expiresAt <= Date.now())
                return { role: 'vendor', vendorId: metadata.vendor_id, email, uid: user.id, renewalOnly: true };
        }
    }

    return null;
}

export async function destroySession() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    const cookieStore = await cookies();
    cookieStore.delete('fussion_session');
}

export async function requireRole(role: 'admin' | 'vendor') {
    const session = await getSession();
    if (!session || session.role !== role) throw new Error('Unauthorized');
    return session;
}

export async function requireAdmin() {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'super_admin')) throw new Error('Unauthorized');
    return session;
}

export async function requireSuperAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'super_admin') throw new Error('Unauthorized');
    return session;
}

export async function requireVendor() {
    const session = await requireRole('vendor');
    if (!session.vendorId || session.renewalOnly) throw new Error('Vendor access has expired. Request a renewal to restore dashboard access.');
    return session as Session & { vendorId: string };
}

export async function hasRegisteredAdmin() {
    const supabase = createSupabaseAdminClient();
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Could not check Supabase Auth admins: ${error.message}`);
        if (data.users.some(user => user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'super_admin')) return true;
        if (data.users.length < 1000) return false;
    }
}

