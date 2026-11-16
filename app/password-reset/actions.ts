'use server';
import { destroySession, encryptSecret, getSession, hashLookup, hashPassword, normalizeEmail, verifyPassword } from '../../lib/auth';
import { completePasswordReset, invalidatePasswordResetTokens, requestPasswordReset } from '../../lib/password-reset';
import { checkPasswordAgainstBreaches } from '../../lib/password-security';
import { updateJson } from '../../lib/json-store';

type AuthRecord = {
    role?: string;
    status?: string;
    vendor_id?: string;
    username_hash?: string;
    recovery_email_hash?: string;
    password?: string;
    session_version?: number;
    [key: string]: unknown;
};

export async function requestPasswordResetAction(email: string, role: 'admin' | 'vendor') {
    if (role !== 'admin' && role !== 'vendor')
        return { success: false, error: 'Invalid account type.' };
    return requestPasswordReset(email, role);
}

export async function completePasswordResetAction(token: string, password: string) {
    return completePasswordReset(token, password);
}

export async function changePasswordAction(currentPassword: string, newPassword: string, recoveryEmailInput = '') {
    const session = await getSession();
    if (!session)
        return { success: false, error: 'Your session has expired. Sign in again.' };
    if (newPassword.length < 12)
        return { success: false, error: 'Use a password of at least 12 characters.' };
    if (newPassword === currentPassword)
        return { success: false, error: 'Choose a password different from your current password.' };

    const recoveryEmail = normalizeEmail(recoveryEmailInput);
    if (session.role === 'admin' && recoveryEmailInput.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
        return { success: false, error: 'Enter a valid recovery email address.' };
    }

    const accountId = session.role === 'admin' ? hashLookup(session.email) : session.vendorId;
    if (!accountId)
        return { success: false, error: 'This account cannot change its password here.' };

    let account: AuthRecord | undefined;
    let accountKey: string | undefined;
    await updateJson<Record<string, AuthRecord>>('users_auth.json', users => {
        const key = Object.keys(users).find(candidate => session.role === 'admin'
            ? users[candidate]?.role === 'admin' && users[candidate]?.username_hash === accountId
            : users[candidate]?.role === 'vendor' && users[candidate]?.vendor_id === accountId);
        if (key) {
            accountKey = key;
            account = users[key];
        }
        return users;
    }, {});
    if (!accountKey || !account?.password || account.status !== 'active')
        return { success: false, error: 'This account cannot change its password here.' };
    if (!(await verifyPassword(currentPassword, account.password)))
        return { success: false, error: 'Current password is incorrect.' };
    const breachStatus = await checkPasswordAgainstBreaches(newPassword);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };

    const passwordHash = await hashPassword(newPassword);
    const recoveryEmailEncrypted = session.role === 'admin' && recoveryEmailInput.trim()
        ? await encryptSecret(recoveryEmail)
        : undefined;
    const recoveryEmailHash = session.role === 'admin' && recoveryEmailInput.trim()
        ? hashLookup(recoveryEmail)
        : undefined;
    let updated = false;
    await updateJson<Record<string, AuthRecord>>('users_auth.json', users => {
        const current = users[accountKey!];
        if (!current || current.password !== account?.password || current.status !== 'active')
            return users;
        updated = true;
        users[accountKey!] = {
            ...current,
            password: passwordHash,
            session_version: Number(current.session_version || 0) + 1,
            ...(recoveryEmailEncrypted ? {
                recovery_email_encrypted: recoveryEmailEncrypted,
                recovery_email_hash: recoveryEmailHash,
            } : {}),
        };
        return users;
    }, {});
    if (!updated)
        return { success: false, error: 'The account changed during this request. Sign in again and retry.' };

    await invalidatePasswordResetTokens(session.role, accountId);
    await destroySession();
    return { success: true };
}
