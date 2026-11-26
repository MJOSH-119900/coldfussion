'use server';
import { checkPasswordAgainstBreaches } from '../../lib/password-security';
import { getSession } from '../../lib/auth';
import { createSupabaseServerClient, getAuthCallbackUrl } from '../../server/supabase';

export async function requestPasswordResetAction(email: string, role: 'admin' | 'vendor') {
    if (role !== 'admin' && role !== 'vendor')
        return { success: false, error: 'Invalid account type.' };

    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo = getAuthCallbackUrl(role === 'vendor' ? '/vendor/setup' : '/password-reset/complete');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    if (error) {
        console.error('Supabase password reset request failed:', error.message);
        return { success: false, error: 'Password recovery is temporarily unavailable. Try again later.' };
    }

    return {
        success: true,
        message: 'If an active account matches that email, password reset instructions will be sent.',
    };
}

export async function completePasswordResetAction(password: string) {
    if (password.length < 12)
        return { success: false, error: 'Use a password of at least 12 characters.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };

    const supabase = await createSupabaseServerClient();
    const { data: authData, error: userError } = await supabase.auth.getUser();
    if (userError || !authData.user)
        return { success: false, error: 'This password link is invalid or expired. Request a new one.' };

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        console.error('Supabase password update failed:', error.message);
        return { success: false, error: 'Could not update the password. Request a new reset link.' };
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (signOutError) {
        console.error('Supabase global sign-out after password reset failed:', signOutError.message);
        return { success: false, error: 'Password changed, but other sessions could not be revoked. Contact the administrator.' };
    }

    return { success: true };
}

export async function changePasswordAction(currentPassword: string, newPassword: string) {
    const session = await getSession();
    if (!session)
        return { success: false, error: 'Your session has expired. Sign in again.' };
    if (newPassword.length < 12)
        return { success: false, error: 'Use a password of at least 12 characters.' };
    if (newPassword === currentPassword)
        return { success: false, error: 'Choose a password different from your current password.' };

    const breachStatus = await checkPasswordAgainstBreaches(newPassword);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };

    const supabase = await createSupabaseServerClient();
    const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: session.email,
        password: currentPassword,
    });
    if (reauthError)
        return { success: false, error: 'Current password is incorrect.' };

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError)
        return { success: false, error: 'Could not change the password. Try again later.' };

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (signOutError) {
        console.error('Supabase global sign-out after password change failed:', signOutError.message);
        return { success: false, error: 'Password changed, but other sessions could not be revoked. Contact the administrator.' };
    }

    return { success: true };
}
