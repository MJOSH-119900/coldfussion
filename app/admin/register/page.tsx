'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminRegistrationStatusAction, registerAdminAction } from './actions';
import { useToast } from '../../components/ToastProvider';
import { useBranding } from '../../(public)/components/BrandingProvider';
import PasswordInput from '../../components/PasswordInput';

export default function AdminRegisterPage() {
    const router = useRouter();
    const { notify } = useToast();
    const { brand } = useBranding();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [registrationStatus, setRegistrationStatus] = useState<{ available: boolean; reason?: string | null } | null>(null);

    useEffect(() => {
        adminRegistrationStatusAction().then(setRegistrationStatus);
    }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setPending(true);
        try {
            const result = await registerAdminAction(new FormData(event.currentTarget));
            if (!result.success) {
                const message = result.error || 'Registration failed.';
                setError(message);
                notify('error', message, 'Admin registration');
                return;
            }
            notify(
                'success',
                result.needsEmailConfirmation
                    ? 'Check your email to confirm the administrator account before signing in.'
                    : 'Administrator account created. Sign in with your email and password.',
                'Registration complete',
            );
            router.push('/admin/login');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Registration failed.';
            setError(message);
            notify('error', message, 'Admin registration');
        }
        finally {
            setPending(false);
        }
    }

    return (
        <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                    {brand.logo && <img src={brand.logo} alt="" className="h-8 w-8 rounded bg-slate-50 object-contain" />}
                    <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">{brand.companyName}</p>
                </div>
                <h1 className="mt-2 text-3xl font-black">Create admin account</h1>
                <p className="mt-2 text-sm text-slate-500">
                    Create the first admin account using the one-time setup token from the server environment. Registration closes after the first account is created. Confirm your email before signing in when email confirmation is enabled.
                </p>
                {registrationStatus === null ? <p role="status" className="mt-6 text-sm text-slate-500">Checking admin registration status…</p> : !registrationStatus.available ? <div role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{registrationStatus.reason === 'closed' ? 'An admin account already exists, so admin registration is closed.' : registrationStatus.reason === 'token_missing' ? 'Admin setup token is missing from the server environment.' : 'Could not verify admin setup right now.'} <Link href="/admin/login" className="ml-1 font-bold underline">Go to admin sign in</Link></div> : <>
                <label className="mt-6 block text-sm font-semibold">
                    One-time setup token
                    <input required name="setup_token" type="password" autoComplete="off" className="mt-1 w-full rounded-xl border px-3 py-3" />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Copy only the value after `FUSSION_ADMIN_SETUP_TOKEN=` in your project’s `.env.local` file.</span>
                </label>
                <label className="mt-6 block text-sm font-semibold">
                    Username
                    <input required name="username" autoComplete="username" className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="admin" />
                </label>
                <label className="mt-3 block text-sm font-semibold">
                    Admin email
                    <input required name="recovery_email" type="email" autoComplete="email" className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="you@example.com" />
                </label>
                <div className="mt-3 text-sm font-semibold">
                    <label htmlFor="admin-register-password">Password</label>
                    <PasswordInput id="admin-register-password" required minLength={12} name="password" autoComplete="new-password" wrapperClassName="mt-1" className="w-full rounded-xl border px-3 py-3" toggleClassName="text-slate-700 hover:text-slate-950 focus:ring-slate-300" />
                </div>
                <div className="mt-3 text-sm font-semibold">
                    <label htmlFor="admin-register-password-confirm">Confirm password</label>
                    <PasswordInput id="admin-register-password-confirm" required minLength={12} name="password_confirmation" autoComplete="new-password" wrapperClassName="mt-1" className="w-full rounded-xl border px-3 py-3" toggleClassName="text-slate-700 hover:text-slate-950 focus:ring-slate-300" />
                </div>
                {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
                <button disabled={pending} className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">
                    {pending ? 'Creating…' : 'Create admin account'}
                </button>
                </>}
                <Link href="/admin/login" className="mt-4 block text-center text-sm font-semibold text-slate-500">Back to admin sign in</Link>
            </form>
        </main>
    );
}
