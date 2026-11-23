'use server';
import { destroySession, getSession } from '../../../lib/auth';
import { createSupabaseServerClient } from '../../../server/supabase';

export async function adminLoginAction(email: string, password: string) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
    });
    if (error) {
        console.warn('Supabase admin sign-in rejected:', { code: error.code, status: error.status });
        if (error.code === 'email_not_confirmed')
            return { success: false, error: 'Confirm your admin email using the signup message before signing in. If no message arrived, check spam or contact the site administrator to configure Supabase email delivery.' };
        return { success: false, error: 'Invalid admin email or password.' };
    }

    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'super_admin')) {
        await destroySession();
        return { success: false, error: 'This Supabase account is not registered as an active admin.' };
    }

    return { success: true };
}
