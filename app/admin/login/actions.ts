'use server';
import { createSession, findAuthByUsername, verifyPassword } from '../../../lib/auth';
export async function adminLoginAction(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    const user = await findAuthByUsername(normalized);
    if (!user || user.status !== 'active' || user.role !== 'admin' || !(await verifyPassword(password, user.password))) {
        return { success: false, error: 'Invalid admin username or password.' };
    }
    await createSession({ role: 'admin', email: normalized, authVersion: Number(user.session_version || 0) });
    return { success: true };
}
