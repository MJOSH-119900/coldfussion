import { createHash, randomBytes } from 'crypto';
import { readJson, updateJson } from './json-store';
import { hashLookup, hashPassword, normalizeEmail } from './auth';
import { checkPasswordAgainstBreaches } from './password-security';

type AuthRecord = {
    role?: string;
    status?: string;
    vendor_id?: string;
    username_hash?: string;
    recovery_email_hash?: string;
};
type ResetRecord = {
    otp_id?: string;
    kind?: string;
    email_hash?: string;
    token_hash?: string;
    account_role?: 'admin' | 'vendor';
    account_id?: string;
    created_at?: number;
    expires_at?: number;
    used?: boolean;
    [key: string]: unknown;
};

const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET_LIMIT = 5;

export function passwordResetConfigurationError() {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.NEXT_PUBLIC_SITE_URL) {
        return 'Password reset email is not configured. Contact the administrator.';
    }
    try {
        const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
        const validProtocol = site.protocol === 'https:' ||
            (process.env.NODE_ENV !== 'production' && site.protocol === 'http:');
        if (!validProtocol || site.username || site.password)
            return 'Password reset email is not configured. Contact the administrator.';
    }
    catch {
        return 'Password reset email is not configured. Contact the administrator.';
    }
    return '';
}

export async function invalidatePasswordResetTokens(role: 'admin' | 'vendor', accountId: string) {
    await updateJson<ResetRecord[]>('auth_otps.json', current => current.map(item =>
        item.kind === 'password-reset' && item.account_role === role && item.account_id === accountId
            ? { ...item, used: true }
            : item
    ), []);
}

function resetUrl(token: string) {
    const base = new URL(process.env.NEXT_PUBLIC_SITE_URL!);
    if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
        throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production.');
    }
    base.pathname = '/password-reset/complete';
    base.search = new URLSearchParams({ token }).toString();
    return base.toString();
}

async function sendResetEmail(email: string, token: string) {
    const link = resetUrl(token);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to: [email],
            subject: 'Reset your password',
            text: `Use this one-time link to reset your password. It expires in 30 minutes: ${link}`,
            html: `<p>Use this one-time link to reset your password. It expires in 30 minutes.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        console.error('Resend password reset delivery failed with status', response.status);
        throw new Error('Password reset email could not be delivered.');
    }
}

async function findRecoveryAccount(email: string, role: 'admin' | 'vendor') {
    const users = await readJson<Record<string, AuthRecord>>('users_auth.json', {});
    const emailHash = hashLookup(email);
    if (role === 'vendor') {
        const key = Object.keys(users).find(candidate => {
            const user = users[candidate];
            return user?.role === 'vendor' && user.status === 'active' &&
                (candidate === email || candidate === emailHash);
        });
        const user = key ? users[key] : undefined;
        return key && user?.vendor_id ? { accountId: user.vendor_id, role } : undefined;
    }

    const configuredEmail = normalizeEmail(process.env.FUSSION_ADMIN_RECOVERY_EMAIL || '');
    const admins = Object.entries(users).filter(([, user]) =>
        user?.role === 'admin' && user.status === 'active' &&
        (user.recovery_email_hash === emailHash || (configuredEmail !== '' && configuredEmail === email))
    );
    if (admins.length !== 1)
        return undefined;
    return { accountId: admins[0][1].username_hash || '', role };
}

export async function requestPasswordReset(emailInput: string, role: 'admin' | 'vendor') {
    const configurationError = passwordResetConfigurationError();
    if (configurationError)
        return { success: false, error: configurationError };

    const email = normalizeEmail(emailInput);
    const emailHash = hashLookup(email);
    const account = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? await findRecoveryAccount(email, role) : undefined;
    const now = Date.now();
    const resetId = `reset_${randomBytes(18).toString('hex')}`;
    const token = account ? randomBytes(32).toString('base64url') : undefined;
    const record: ResetRecord = {
        otp_id: resetId,
        kind: account ? 'password-reset' : 'password-reset-request',
        email_hash: emailHash,
        account_role: account?.role,
        account_id: account?.accountId,
        token_hash: token ? createHash('sha256').update(token).digest('hex') : undefined,
        created_at: now,
        expires_at: token ? now + RESET_TTL_MS : now + RESET_WINDOW_MS,
        used: false,
    };
    let allowed = false;
    await updateJson<ResetRecord[]>('auth_otps.json', current => {
        const retained = current.filter(item =>
            item.kind !== 'password-reset' && item.kind !== 'password-reset-request' ||
            Number(item.created_at || 0) > now - RESET_WINDOW_MS
        );
        const recent = retained.filter(item => item.email_hash === emailHash &&
            (item.kind === 'password-reset' || item.kind === 'password-reset-request'));
        const lastRequest = Math.max(0, ...recent.map(item => Number(item.created_at || 0)));
        if (recent.length >= RESET_LIMIT || now - lastRequest < RESET_COOLDOWN_MS)
            return retained;
        allowed = true;
        const invalidated = account
            ? retained.map(item => item.kind === 'password-reset' &&
                item.account_role === role && item.account_id === account.accountId
                ? { ...item, used: true }
                : item)
            : retained;
        return [...invalidated, record];
    }, []);

    if (allowed && account && token) {
        try {
            await sendResetEmail(email, token);
        }
        catch (error) {
            await updateJson<ResetRecord[]>('auth_otps.json', current =>
                current.filter(item => item.otp_id !== resetId), []);
            console.error('Password reset email delivery failed:', error);
        }
    }

    return {
        success: true,
        message: 'If an active account matches that email, password reset instructions will be sent.',
    };
}

export async function completePasswordReset(token: string, password: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        return { success: false, error: 'This password reset link is invalid or expired.' };
    if (password.length < 12)
        return { success: false, error: 'Use a password of at least 12 characters.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };

    const tokenHash = createHash('sha256').update(token).digest('hex');
    let matched: ResetRecord | undefined;
    await updateJson<ResetRecord[]>('auth_otps.json', current => {
        const record = current.find(item => item.kind === 'password-reset' &&
            item.token_hash === tokenHash && item.used !== true &&
            Number(item.expires_at || 0) > Date.now());
        if (!record)
            return current;
        matched = record;
        return current.map(item => item.otp_id === record.otp_id ? { ...item, used: true } : item);
    }, []);
    if (!matched?.account_id || !matched.account_role)
        return { success: false, error: 'This password reset link is invalid or expired.' };

    const passwordHash = await hashPassword(password);
    let updated = false;
    await updateJson<Record<string, AuthRecord & { password?: string; session_version?: number }>>(
        'users_auth.json',
        users => {
            const key = Object.keys(users).find(candidate => {
                const user = users[candidate];
                return matched?.account_role === 'admin'
                    ? user?.role === 'admin' && user.username_hash === matched.account_id
                    : user?.role === 'vendor' && user.vendor_id === matched?.account_id;
            });
            if (!key || users[key].status !== 'active')
                return users;
            updated = true;
            users[key] = {
                ...users[key],
                password: passwordHash,
                session_version: Number(users[key].session_version || 0) + 1,
            };
            return users;
        },
        {},
    );
    if (!updated)
        return { success: false, error: 'The account could not be updated. Request a new reset link.' };
    await invalidatePasswordResetTokens(matched.account_role, matched.account_id);
    return { success: true };
}
