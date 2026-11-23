'use server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkPasswordAgainstBreaches } from '../../../lib/password-security';
import { hasRegisteredAdmin } from '../../../lib/auth';
import { prisma } from '../../../server/db';
import { Prisma } from '../../../generated/prisma/client';
import { createSupabaseServerClient, getAuthCallbackUrl } from '../../../server/supabase';
import { createSupabaseAdminClient } from '../../../server/supabase-admin';

const ADMIN_SETUP_COLLECTION = 'system_flags';
const ADMIN_SETUP_RECORD = 'first_admin_registration';

async function releaseAdminSetupClaim() {
    try {
        await prisma.storeRecord.deleteMany({
            where: { collection: ADMIN_SETUP_COLLECTION, recordId: ADMIN_SETUP_RECORD },
        });
    }
    catch (error) {
        console.error('Could not release first-admin registration claim:', error);
    }
}

async function adminSetupClaimExists() {
    return Boolean(await prisma.storeRecord.findUnique({
        where: { collection_recordId: { collection: ADMIN_SETUP_COLLECTION, recordId: ADMIN_SETUP_RECORD } },
        select: { recordId: true },
    }));
}

export async function adminRegistrationStatusAction() {
    try {
        const setupToken = process.env.FUSSION_ADMIN_SETUP_TOKEN;
        if (!setupToken || setupToken.length < 32)
            return { available: false, reason: 'token_missing' as const };
        if (await hasRegisteredAdmin() || await adminSetupClaimExists())
            return { available: false, reason: 'closed' as const };
        return { available: true, reason: null };
    }
    catch (error) {
        console.error('Could not verify first-admin registration status:', error);
        return { available: false, reason: 'status_error' as const };
    }
}

export async function registerAdminAction(data: FormData) {
    const setupToken = String(data.get('setup_token') || '').trim();
    const expectedSetupToken = process.env.FUSSION_ADMIN_SETUP_TOKEN;
    if (!expectedSetupToken || expectedSetupToken.length < 32)
        return { success: false, error: 'Admin setup is not configured. Set FUSSION_ADMIN_SETUP_TOKEN on the server.' };
    const suppliedTokenHash = createHash('sha256').update(setupToken).digest();
    const expectedTokenHash = createHash('sha256').update(expectedSetupToken).digest();
    if (!timingSafeEqual(suppliedTokenHash, expectedTokenHash))
        return { success: false, error: 'The one-time setup token is invalid.' };

    const username = String(data.get('username') || '').trim();
    const recoveryEmail = String(data.get('recovery_email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('password_confirmation') || '');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username))
        return { success: false, error: 'Username must be 3–32 characters and use letters, numbers, dots, underscores or hyphens.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))
        return { success: false, error: 'Enter a valid admin recovery email address.' };
    if (password.length < 12)
        return { success: false, error: 'Use an admin password of at least 12 characters.' };
    if (password !== confirmation)
        return { success: false, error: 'Passwords do not match.' };
    const breachStatus = await checkPasswordAgainstBreaches(password);
    if (breachStatus === 'breached')
        return { success: false, error: 'This password appears in known data breaches. Choose a different password.' };
    if (breachStatus === 'unavailable')
        return { success: false, error: 'Could not check the password against breach data. Try again shortly.' };

    try {
        if (await hasRegisteredAdmin() || await adminSetupClaimExists())
            return { success: false, error: 'An admin account already exists. Admin registration is closed.' };
    }
    catch (error) {
        console.error('Could not verify first-admin registration status:', error);
        return { success: false, error: 'Could not verify admin setup. Try again later.' };
    }

    try {
        await prisma.storeRecord.create({
            data: {
                collection: ADMIN_SETUP_COLLECTION,
                recordId: ADMIN_SETUP_RECORD,
                data: { claimedAt: new Date().toISOString() },
            },
        });
    }
    catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            return { success: false, error: 'An admin account is being created or already exists. Admin registration is closed.' };
        console.error('Could not reserve first-admin registration:', error);
        return { success: false, error: 'Could not start admin setup. Try again later.' };
    }

    let keepClaim = false;
    try {
        // Close the race where another first admin completed between our initial check and claim.
        if (await hasRegisteredAdmin())
            return { success: false, error: 'An admin account already exists. Admin registration is closed.' };

        const supabase = await createSupabaseServerClient();
        const { data: signup, error } = await supabase.auth.signUp({
            email: recoveryEmail,
            password,
            options: {
                emailRedirectTo: getAuthCallbackUrl('/admin'),
                data: { username },
            },
        });
        if (error || !signup.user || !signup.user.identities?.length)
            return { success: false, error: 'Could not create the administrator account. Check the email and try again.' };

        const admin = createSupabaseAdminClient();
        const { error: roleError } = await admin.auth.admin.updateUserById(signup.user.id, {
            app_metadata: { role: 'super_admin' },
        });
        if (roleError) {
            try {
                await admin.auth.admin.deleteUser(signup.user.id);
            }
            catch {
                keepClaim = true;
            }
            return { success: false, error: 'Could not complete administrator setup. Try again later.' };
        }

        keepClaim = true;
        return { success: true, needsEmailConfirmation: !signup.session };
    }
    catch (error) {
        console.error('First-admin registration failed:', error);
        return { success: false, error: 'Could not complete administrator setup. Try again later.' };
    }
    finally {
        if (!keepClaim) await releaseAdminSetupClaim();
    }
}
