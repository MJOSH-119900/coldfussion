'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';
import { useToast } from '../../components/ToastProvider';
import { useBranding } from '../../(public)/components/BrandingProvider';

export default function VendorLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const router = useRouter();
    const { notify } = useToast();
    const { brand } = useBranding();

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setPending(true);
        try {
            const result = await loginAction(email, password, 'vendor');
            if (!result.success) {
                const message = result.error || 'Login failed.';
                setError(message);
                notify('error', message, 'Vendor sign in');
                return;
            }
            notify('success', 'Welcome back to your seller dashboard.', 'Signed in');
            router.push('/vendor/dashboard');
            router.refresh();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not sign in.';
            setError(message);
            notify('error', message, 'Vendor sign in');
        }
        finally {
            setPending(false);
        }
    }

    return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl"/>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-teal-400/20 blur-3xl"/>
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/30 md:grid-cols-[0.9fr_1.1fr]">
        <section className="relative flex min-h-52 flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-700 via-teal-800 to-slate-950 p-7 text-white sm:p-10 md:min-h-[36rem]">
          <div aria-hidden="true" className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[35px] border-white/10"/>
          <div className="relative flex items-center gap-3">
            {brand.logo && <Image src={brand.logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl bg-white/95 p-1 object-contain"/>}
            <p className="text-sm font-extrabold uppercase tracking-[.16em]">{brand.companyName} seller</p>
          </div>
          <div className="relative mt-8 md:mt-0">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-100">Vendor portal</p>
            <h1 className="mt-3 max-w-sm text-3xl font-black leading-tight sm:text-4xl">Ready for your next sale?</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-emerald-50/85">Sign in to manage your products, orders, and seller dashboard.</p>
          </div>
          <Link href="/" className="relative mt-8 w-fit text-sm font-semibold text-white/80 transition hover:text-white">← Back to store</Link>
        </section>

        <section className="flex items-center p-7 sm:p-10 md:p-12">
          <form onSubmit={submit} className="mx-auto w-full max-w-md">
            <p className="text-sm font-bold text-emerald-700">Welcome back</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Vendor sign in</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your seller account details to continue.</p>

            <label className="mt-8 block text-sm font-bold text-slate-700">
              Email address
              <input required value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"/>
            </label>
            <label className="mt-5 block text-sm font-bold text-slate-700">
              Password
              <input required value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"/>
            </label>
            <div className="mt-2 text-right">
              <Link href="/vendor/password-reset" className="text-sm font-bold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-900">Forgot password?</Link>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={pending} className="mt-6 w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Signing in…' : 'Sign in to seller dashboard'}</button>
            <p className="mt-6 text-center text-sm text-slate-500">New to selling? <Link href="/vendor/register" className="font-bold text-emerald-700 hover:text-emerald-900">Apply as a vendor</Link></p>
          </form>
        </section>
      </div>
    </main>;
}
