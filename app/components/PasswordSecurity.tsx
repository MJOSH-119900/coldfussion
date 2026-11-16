'use client';
import { FormEvent, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { changePasswordAction, completePasswordResetAction, requestPasswordResetAction } from '../password-reset/actions';
import { useToast } from './ToastProvider';
import { useBranding } from '../(public)/components/BrandingProvider';

function PasswordFlowShell({
    role,
    eyebrow,
    headline,
    description,
    backHref,
    backLabel,
    children,
}: {
    role: 'admin' | 'vendor';
    eyebrow: string;
    headline: string;
    description: string;
    backHref?: string;
    backLabel?: string;
    children: ReactNode;
}) {
    const { brand } = useBranding();
    const colors = role === 'vendor'
        ? {
            glow: 'bg-emerald-500/25',
            glowSecondary: 'bg-teal-400/20',
            panel: 'from-emerald-700 via-teal-800 to-slate-950',
            eyebrow: 'text-emerald-100',
            action: 'text-emerald-700 hover:text-emerald-900',
        }
        : {
            glow: 'bg-violet-600/30',
            glowSecondary: 'bg-fuchsia-500/20',
            panel: 'from-violet-700 via-violet-800 to-slate-950',
            eyebrow: 'text-violet-200',
            action: 'text-violet-700 hover:text-violet-900',
        };

    return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-10 sm:px-6">
      <div aria-hidden="true" className={`pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full ${colors.glow} blur-3xl`}/>
      <div aria-hidden="true" className={`pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full ${colors.glowSecondary} blur-3xl`}/>
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/30 md:grid-cols-[0.9fr_1.1fr]">
        <section className={`relative flex min-h-52 flex-col justify-between overflow-hidden bg-gradient-to-br ${colors.panel} p-7 text-white sm:p-10 md:min-h-[36rem]`}>
          <div aria-hidden="true" className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[35px] border-white/10"/>
          <div className="relative flex items-center gap-3">
            {brand.logo && <Image src={brand.logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl bg-white/95 p-1 object-contain"/>}
            <p className="text-sm font-extrabold uppercase tracking-[.16em]">{brand.companyName}{role === 'vendor' ? ' seller' : ''}</p>
          </div>
          <div className="relative mt-8 md:mt-0">
            <p className={`text-xs font-bold uppercase tracking-[.2em] ${colors.eyebrow}`}>{eyebrow}</p>
            <h1 className="mt-3 max-w-sm text-3xl font-black leading-tight sm:text-4xl">{headline}</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/85">{description}</p>
          </div>
          <Link href="/" className="relative mt-8 w-fit text-sm font-semibold text-white/80 transition hover:text-white">← Back to store</Link>
        </section>
        <section className="flex items-center p-7 sm:p-10 md:p-12">
          <div className="mx-auto w-full max-w-md">
            {children}
            {backHref && backLabel && <Link href={backHref} className={`mt-6 block text-center text-sm font-bold ${colors.action}`}>← {backLabel}</Link>}
          </div>
        </section>
      </div>
    </main>;
}

export function PasswordResetRequestForm({ role }: { role: 'admin' | 'vendor' }) {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const isAdmin = role === 'admin';
    const inputFocusClass = isAdmin
        ? 'focus:border-violet-500 focus:ring-violet-100'
        : 'focus:border-emerald-500 focus:ring-emerald-100';

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setError('');
        setMessage('');
        try {
            const result = await requestPasswordResetAction(email, role);
            if (!result.success) {
                setError(result.error || 'Could not request a password reset.');
                return;
            }
            setMessage(('message' in result && result.message) || 'If an active account matches that email, password reset instructions will be sent.');
        }
        catch {
            setError('Could not process the request. Try again later.');
        }
        finally {
            setPending(false);
        }
    }

    return <PasswordFlowShell
      role={role}
      eyebrow={isAdmin ? 'Administrator access' : 'Seller account'}
      headline="Let’s get you back in."
      description="Request a secure, one-time password reset link sent to the recovery email on your account."
      backHref={isAdmin ? '/admin/login' : '/vendor/login'}
      backLabel="Back to sign in"
    >
      <form onSubmit={submit}>
        <p className={`text-sm font-bold ${isAdmin ? 'text-violet-700' : 'text-emerald-700'}`}>Account recovery</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Reset your password</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Enter the recovery email address for your {role} account.</p>
        <label className="mt-8 block text-sm font-bold text-slate-700">
          Recovery email
          <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className={`mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 ${inputFocusClass}`}/>
        </label>
        {message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={pending} className={`mt-6 w-full rounded-xl py-3.5 font-bold text-white shadow-lg transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${isAdmin ? 'bg-violet-700 shadow-violet-700/20 hover:bg-violet-800 focus:ring-violet-200' : 'bg-emerald-700 shadow-emerald-700/20 hover:bg-emerald-800 focus:ring-emerald-200'}`}>{pending ? 'Sending…' : 'Email me a reset link'}</button>
      </form>
    </PasswordFlowShell>;
}

export function PasswordResetCompleteForm({ token }: { token: string }) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setMessage('');
        if (password !== confirmation) {
            setError('Passwords do not match.');
            return;
        }
        setPending(true);
        try {
            const result = await completePasswordResetAction(token, password);
            if (!result.success) {
                setError(result.error || 'Could not reset the password.');
                return;
            }
            setMessage('Your password has been changed. Sign in with your new password.');
        }
        catch {
            setError('Could not reset your password. Request a new reset link.');
        }
        finally {
            setPending(false);
        }
    }

    return <PasswordFlowShell
      role="admin"
      eyebrow="Secure account recovery"
      headline="Choose a new password."
      description="Your reset link expires after 30 minutes and can only be used once."
    >
      <form onSubmit={submit}>
        <p className="text-sm font-bold text-violet-700">Set a new password</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Secure your account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Choose a strong password with at least 12 characters.</p>
        <label className="mt-8 block text-sm font-bold text-slate-700">
          New password
          <input required minLength={12} autoComplete="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"/>
        </label>
        <label className="mt-5 block text-sm font-bold text-slate-700">
          Confirm new password
          <input required minLength={12} autoComplete="new-password" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Enter the password again" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"/>
        </label>
        {message && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><p>{message}</p><div className="mt-3 flex flex-wrap gap-4"><Link className="font-bold text-violet-700" href="/admin/login">Admin sign in</Link><Link className="font-bold text-emerald-700" href="/vendor/login">Vendor sign in</Link></div></div>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={pending || !token} className="mt-6 w-full rounded-xl bg-violet-700 py-3.5 font-bold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Updating…' : 'Update password'}</button>
      </form>
    </PasswordFlowShell>;
}

export default function AccountPasswordSecurity({ role }: { role: 'admin' | 'vendor' }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [pending, setPending] = useState(false);
    const { notify } = useToast();
    const router = useRouter();

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (newPassword !== confirmation) {
            notify('error', 'New passwords do not match.', 'Password change');
            return;
        }
        setPending(true);
        try {
            const result = await changePasswordAction(currentPassword, newPassword, recoveryEmail);
            if (!result.success) {
                notify('error', result.error || 'Could not change your password.', 'Password change');
                return;
            }
            notify('success', 'Password updated. Sign in again with your new password.', 'Password changed');
            router.push(role === 'admin' ? '/admin/login' : '/vendor/login');
            router.refresh();
        }
        catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not change your password.', 'Password change');
        }
        finally {
            setPending(false);
        }
    }

    return <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Account security</h2>
      <p className="mt-1 text-sm text-slate-500">Changing your password signs out all active sessions.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block text-sm font-semibold">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
        <label className="block text-sm font-semibold">New password<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
        <label className="block text-sm font-semibold">Confirm new password<input required minLength={12} type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
        {role === 'admin' && <label className="block text-sm font-semibold">Admin recovery email<input type="email" autoComplete="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} placeholder="Needed for email reset links" className="mt-1 w-full rounded-xl border px-3 py-3"/><span className="mt-1 block text-xs font-normal text-slate-500">Saving a recovery email requires your current password and updates it with this password change.</span></label>}
        <button disabled={pending} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? 'Updating…' : 'Change password'}</button>
      </form>
    </section>;
}
