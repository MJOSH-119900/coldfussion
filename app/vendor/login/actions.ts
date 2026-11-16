'use server';
import { createSession, findAuthByEmail, verifyPassword } from '../../../lib/auth';
export async function loginAction(email: string, password: string, expectedRole: 'admin' | 'vendor' = 'vendor') { const user = await findAuthByEmail(email); if (!user || user.status !== 'active' || user.role !== expectedRole || !(await verifyPassword(password, user.password)))
    return { success: false, error: 'Invalid credentials or inactive account.' }; await createSession({ role: user.role, vendorId: user.vendor_id, email: email.trim().toLowerCase(), authVersion: Number(user.session_version || 0) }); return { success: true }; }
