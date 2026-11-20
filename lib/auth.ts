import 'server-only';
import { cookies } from 'next/headers';
import { readJson } from './json-store';
import { createSupabaseServerClient } from '../server/supabase';
import { createSupabaseAdminClient } from '../server/supabase-admin';

type Session = {
    role: 'admin' | 'vendor';
    vendorId?: string;
    email: string;
    uid: string;
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
    if (metadata.role === 'admin')
        return { role: 'admin', email, uid: user.id };

    if (metadata.role === 'vendor' && typeof metadata.vendor_id === 'string') {
        const vendors = await readJson<Array<{ vendor_id?: string; status?: string }>>('vendors.json', []);
        const vendor = vendors.find(item => item.vendor_id === metadata.vendor_id);
        if (vendor && ['approved', 'active'].includes(String(vendor.status)))
            return { role: 'vendor', vendorId: metadata.vendor_id, email, uid: user.id };
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
    return requireRole('admin');
}

export async function requireVendor() {
    const session = await requireRole('vendor');
    if (!session.vendorId) throw new Error('Vendor session is missing vendor ID');
    return session as Session & { vendorId: string };
}

export async function hasRegisteredAdmin() {
    const supabase = createSupabaseAdminClient();
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Could not check Supabase Auth admins: ${error.message}`);
        if (data.users.some(user => user.app_metadata?.role === 'admin')) return true;
        if (data.users.length < 1000) return false;
    }
}

