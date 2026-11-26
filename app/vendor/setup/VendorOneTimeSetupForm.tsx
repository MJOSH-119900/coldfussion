'use client';

import { FormEvent, useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useBranding } from '../../(public)/components/BrandingProvider';
import { completeVendorWhatsAppSetupAction } from '../../(admin)/admin/actions';

export default function VendorOneTimeSetupForm({ token, email, ownerName }: { token: string; email: string; ownerName: string }) {
    const { brand } = useBranding();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [pending, setPending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setPending(true);
        try {
            const result = await completeVendorWhatsAppSetupAction(token, password, confirmation);
            if (!result.success) {
                setError(result.error || 'Could not complete account setup.');
                return;
            }
            setSuccess(true);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Could not complete account setup.');
        } finally {
            setPending(false);
        }
    }

    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">{brand.companyName} vendor setup</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Set up your account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{ownerName ? `Hello ${ownerName}, ` : ''}choose a password for the email on your vendor application.</p>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block text-sm font-bold text-slate-700">Application email
            <input type="email" readOnly value={email} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3.5 text-slate-700"/>
            <span className="mt-1 block text-xs font-normal text-slate-500">This email will be your sign-in name.</span>
          </label>
          <div className="text-sm font-bold text-slate-700">
            <label htmlFor="vendor-onetime-password">Password</label>
            <PasswordInput id="vendor-onetime-password" required minLength={12} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" wrapperClassName="mt-2" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" toggleClassName="text-emerald-700 hover:text-emerald-900 focus:ring-emerald-300"/>
          </div>
          <div className="text-sm font-bold text-slate-700">
            <label htmlFor="vendor-onetime-password-confirm">Confirm password</label>
            <PasswordInput id="vendor-onetime-password-confirm" required minLength={12} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Enter the same password again" wrapperClassName="mt-2" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" toggleClassName="text-emerald-700 hover:text-emerald-900 focus:ring-emerald-300"/>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          {success
            ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">Your account password is set. Your application is still awaiting admin approval; you can sign in with the email above after approval.</p>
            : <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-bold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">{pending ? 'Setting up account…' : 'Set password'}</button>}
        </form>
      </section>
    </main>;
}
