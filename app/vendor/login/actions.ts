'use server';
import { destroySession, getSession } from '../../../lib/auth';
import { readJson } from '../../../lib/json-store';
import { createSupabaseServerClient } from '../../../server/supabase';

export async function loginAction(email: string, password: string, expectedRole: 'admin' | 'vendor' = 'vendor') {
    const supabase = await createSupabaseServerClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    if (error)
        return { success: false, error: 'Invalid credentials or inactive account.' };

    const { data: authData, error: userError } = await supabase.auth.getUser();
    if (userError)
        throw userError;

    const session = await getSession();
    if (!session || session.role !== expectedRole) {
        const requests = await readJson<Array<{ email?: string; status?: string; supabase_uid?: string }>>('vendor_requests.json', []);
        const application = requests.find(request =>
            request.status === 'pending' &&
            (request.supabase_uid === authData.user?.id || request.email?.trim().toLowerCase() === normalizedEmail));
        await destroySession();
        if (application)
            return { success: false, error: 'Your email is confirmed. Your vendor application is still awaiting admin approval.' };
        return { success: false, error: 'Invalid credentials or inactive account.' };
    }

    return { success: true };
}
