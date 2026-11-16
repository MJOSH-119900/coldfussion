'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerAdminAction } from './actions';
import { useToast } from '../../components/ToastProvider';
import { useBranding } from '../../(public)/components/BrandingProvider';
export default function AdminRegisterPage() {
    const router = useRouter();
    const { notify } = useToast();
    const { brand } = useBranding();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        setPending(true);
        try {
            const result = await registerAdminAction(new FormData(e.currentTarget));
            if (!result.success) {
                setError(result.error || 'Registration failed.');
                notify('error', result.error || 'Registration failed.', 'Admin registration');
                return;
            }
            notify('success', 'Admin account created. Sign in with your username and password.', 'Registration complete');
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
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl ring-1 ring-slate-200"><div className="flex items-center gap-2">{brand.logo && <img src={brand.logo} alt="" className="h-8 w-8 rounded bg-slate-50 object-contain"/>}<p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">{brand.companyName}</p></div><h1 className="mt-2 text-3xl font-black">Create admin account</h1><p className="mt-2 text-sm text-slate-500">Create the first administrator account. Your username and recovery email are encrypted at rest, and your password is securely hashed.</p><label className="mt-6 block text-sm font-semibold">Username<input required name="username" autoComplete="username" className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="admin"/></label><label className="mt-3 block text-sm font-semibold">Recovery email<input required name="recovery_email" type="email" autoComplete="email" className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="you@example.com"/></label><label className="mt-3 block text-sm font-semibold">Password<input required minLength={10} name="password" type="password" autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-3"/></label><label className="mt-3 block text-sm font-semibold">Confirm password<input required name="password_confirmation" type="password" autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-3"/></label>{error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}<button disabled={pending} className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">{pending ? 'Creating…' : 'Create admin account'}</button><Link href="/admin/login" className="mt-4 block text-center text-sm font-semibold text-slate-500">Back to admin sign in</Link></form></main>;
}
