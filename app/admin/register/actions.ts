'use server';
import { hasRegisteredAdmin, hashPassword, encryptSecret, hashLookup } from '../../../lib/auth';
import { updateJson } from '../../../lib/json-store';
export async function registerAdminAction(data: FormData) {
    if (await hasRegisteredAdmin())
        return { success: false, error: 'An admin account already exists. Registration is disabled.' };
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('password_confirmation') || '');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username))
        return { success: false, error: 'Username must be 3–32 characters and use letters, numbers, dots, underscores or hyphens.' };
    if (password.length < 10)
        return { success: false, error: 'Use an admin password of at least 10 characters.' };
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    const passwordHash = await hashPassword(password);
    const usernameEncrypted = await encryptSecret(username);
    const usernameHash = hashLookup(username.toLowerCase());
    await updateJson<Record<string, any>>('users_auth.json', users => {
        if (Object.values(users).some((user: any) => user?.role === 'admin' && user?.username_hash === usernameHash)) {
            throw new Error('This admin username is already registered.');
        }
        users[`admin_${usernameHash}`] = {
            role: 'admin', username_encrypted: usernameEncrypted, username_hash: usernameHash,
            password: passwordHash, status: 'active', created_at: new Date().toISOString(),
        };
        return users;
    }, {});
    return { success: true };
}
