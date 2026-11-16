'use client';
import { useState } from 'react';
import Link from 'next/link';
import { registerVendorAction } from '../../(admin)/admin/actions';
import { useToast } from '../../components/ToastProvider';
export default function VendorRegister() {
    const { notify } = useToast();
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    const [whatsappUrl, setWhatsappUrl] = useState('');
    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setPending(true);
        const form = e.currentTarget;
        const r = await registerVendorAction(new FormData(form));
        setPending(false);
        if (!r.success) {
            notify('error', r.error || 'Registration failed', 'Vendor registration');
            return;
        }
        setDone(true);
        setWhatsappUrl(r.whatsappUrl || '');
        notify('success', 'Your seller application is waiting for admin approval.', 'Application submitted');
    }
    return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Fussion Marketplace</p><h1 className="mt-2 text-3xl font-black">Become a seller</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Submit your basic business details. The application is saved for admin review, then you can send the same application directly to the Fussion admin on WhatsApp.</p>
    {done ? <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><p className="font-bold">Application received.</p><p className="mt-1 text-sm">Your application is saved and pending administrator verification. The administrator will review your details before making an approval decision.</p>{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">Send details to admin on WhatsApp ↗</a> : <p className="mt-4 text-xs font-semibold text-amber-700">Admin WhatsApp is not configured yet. The application is saved and visible to the administrator.</p>}<div><Link href="/" className="mt-5 inline-block text-sm font-bold text-violet-700">Back to storefront</Link></div></div> : <form encType="multipart/form-data" onSubmit={submit}>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">{[['business_name', 'Business name', 'text'], ['owner_name', 'Owner full name', 'text'], ['email', 'Email', 'email'], ['whatsapp_number', 'WhatsApp number', 'text'], ['business_address', 'Business address', 'text'], ['business_category', 'Business category', 'text']].map(([name, label, type]) => <label key={name} className="text-sm font-semibold text-slate-700">{label}<input required name={name} type={type} className="mt-1 w-full rounded-xl border px-3 py-3 outline-none focus:border-violet-500"/></label>)}</div>
      <label className="mt-4 block text-sm font-semibold text-slate-700">Business description<textarea required name="business_description" rows={4} className="mt-1 w-full rounded-xl border px-3 py-3 outline-none focus:border-violet-500"/></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Password<input required minLength={8} name="password" type="password" className="mt-1 w-full rounded-xl border px-3 py-3"/></label><label className="text-sm font-semibold text-slate-700">Confirm password<input required name="password_confirmation" type="password" className="mt-1 w-full rounded-xl border px-3 py-3"/></label></div>
      <label className="mt-4 block text-sm font-semibold text-slate-700">Business logo <span className="font-normal text-slate-400">(optional)</span><input name="business_logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
      <button disabled={pending} className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">{pending ? 'Submitting application…' : 'Submit & continue to WhatsApp'}</button>
      <p className="mt-4 text-center text-sm text-slate-500">Already approved? <Link href="/vendor/login" className="font-bold text-violet-700">Sign in</Link></p>
    </form>}
  </div></main>;
}
