'use server';
import { hasRegisteredAdmin, hashPassword, encryptSecret, hashLookup } from '../../../lib/auth';
import { updateJson } from '../../../lib/json-store';
import { checkPasswordAgainstBreaches } from '../../../lib/password-security';
type AuthRecord = { role?: string; username_hash?: string; [key: string]: unknown };
export async function registerAdminAction(data: FormData) {
    if (await hasRegisteredAdmin())
        return { success: false, error: 'An admin account already exists. Registration is disabled.' };
    const username = String(data.get('username') || '').trim();
    const recoveryEmail = String(data.get('recovery_email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('password_confirmation') || '');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username))
        return { success: false, error: 'Username must be 3–32 characters and use letters, numbers, dots, underscores or hyphens.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))
        return { success: false, error: 'Enter a valid admin recovery email address.' };
    if (password.length < 10)
        return { success: false, error: 'Use an admin password of at least 10 characters.' };
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };
    const passwordHash = await hashPassword(password);
    const usernameEncrypted = await encryptSecret(username);
    const recoveryEmailEncrypted = await encryptSecret(recoveryEmail);
    const usernameHash = hashLookup(username.toLowerCase());
    const recoveryEmailHash = hashLookup(recoveryEmail);
    await updateJson<Record<string, AuthRecord>>('users_auth.json', users => {
        if (Object.values(users).some(user => user.role === 'admin' && user.username_hash === usernameHash)) {
            throw new Error('This admin username is already registered.');
        }
        users[`admin_${usernameHash}`] = {
            role: 'admin', username_encrypted: usernameEncrypted, username_hash: usernameHash,
            recovery_email_encrypted: recoveryEmailEncrypted, recovery_email_hash: recoveryEmailHash,
            password: passwordHash, status: 'active', created_at: new Date().toISOString(),
        };
        return users;
    }, {});
    return { success: true };
}
