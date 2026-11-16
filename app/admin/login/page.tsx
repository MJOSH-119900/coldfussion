'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { adminLoginAction } from './actions';
import { useToast } from '../../components/ToastProvider';
import { useBranding } from '../../(public)/components/BrandingProvider';

export default function AdminLogin() {
    const [username, setUsername] = useState('');
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
            const result = await adminLoginAction(username, password);
            if (!result.success) {
                const message = result.error || 'Login failed.';
                setError(message);
                notify('error', message, 'Admin sign in');
                return;
            }
            notify('success', 'You are signed in.', 'Welcome back');
            router.push('/admin');
            router.refresh();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not sign in.';
            setError(message);
            notify('error', message, 'Admin sign in');
        }
        finally {
            setPending(false);
        }
    }

    return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl"/>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl"/>
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/30 md:grid-cols-[0.9fr_1.1fr]">
        <section className="relative flex min-h-52 flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-700 via-violet-800 to-slate-950 p-7 text-white sm:p-10 md:min-h-[36rem]">
          <div aria-hidden="true" className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[35px] border-white/10"/>
          <div className="relative flex items-center gap-3">
            {brand.logo && <Image src={brand.logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl bg-white/95 p-1 object-contain"/>}
            <p className="text-sm font-extrabold uppercase tracking-[.16em]">{brand.companyName}</p>
          </div>
          <div className="relative mt-8 md:mt-0">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200">Admin portal</p>
            <h1 className="mt-3 max-w-sm text-3xl font-black leading-tight sm:text-4xl">Your store, all in one place.</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-violet-100/85">Manage your storefront and keep your business moving with a secure administrator sign in.</p>
          </div>
          <Link href="/" className="relative mt-8 w-fit text-sm font-semibold text-white/80 transition hover:text-white">← Back to store</Link>
        </section>

        <section className="flex items-center p-7 sm:p-10 md:p-12">
          <form onSubmit={submit} className="mx-auto w-full max-w-md">
            <p className="text-sm font-bold text-violet-700">Welcome back</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Admin sign in</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter your administrator credentials to continue.</p>

            <label className="mt-8 block text-sm font-bold text-slate-700">
              Username
              <input required value={username} onChange={e => setUsername(e.target.value)} type="text" autoComplete="username" placeholder="Admin username" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"/>
            </label>
            <label className="mt-5 block text-sm font-bold text-slate-700">
              Password
              <input required value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"/>
            </label>
            <div className="mt-2 text-right">
              <Link href="/admin/password-reset" className="text-sm font-bold text-violet-700 underline decoration-violet-300 underline-offset-4 transition hover:text-violet-900">Forgot password?</Link>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={pending} className="mt-6 w-full rounded-xl bg-violet-700 py-3.5 font-bold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Signing in…' : 'Sign in to admin'}</button>
            <p className="mt-6 text-center text-sm text-slate-500">Setting up for the first time? <Link href="/admin/register" className="font-bold text-violet-700 hover:text-violet-900">Create admin account</Link></p>
          </form>
        </section>
      </div>
    </main>;
}
