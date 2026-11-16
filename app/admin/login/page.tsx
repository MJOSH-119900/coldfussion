'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminLoginAction } from './actions';
import { useToast } from '../../components/ToastProvider';
export default function AdminLogin() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const router = useRouter();
    const { notify } = useToast();
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
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Fussion</p>
      <h1 className="mt-2 text-3xl font-black">Admin sign in</h1>
      <p className="mt-2 text-sm text-slate-500">Sign in with your admin username and password.</p>
      <input required value={username} onChange={e => setUsername(e.target.value)} type="text" autoComplete="username" placeholder="Admin username" className="mt-6 w-full rounded-xl border px-3 py-3"/>
      <input required value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Password" className="mt-3 w-full rounded-xl border px-3 py-3"/>
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      <button disabled={pending} className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">{pending ? 'Signing in…' : 'Sign in'}</button>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="font-semibold text-slate-500">Back to store</Link>
        <Link href="/admin/register" className="font-bold text-violet-700">First-time admin setup</Link>
      </div>
    </form>
  </main>;
}
