'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';
import { useToast } from '../../components/ToastProvider';
export default function VendorLogin() { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const router = useRouter(); const { notify } = useToast(); return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><form onSubmit={async (e) => { e.preventDefault(); const r = await loginAction(email, password, 'vendor'); if (!r.success) {
    setError(r.error || 'Login failed');
    notify('error', r.error || 'Login failed', 'Vendor sign in');
    return;
} notify('success', 'Welcome back to your seller dashboard.', 'Signed in'); router.push('/vendor/dashboard'); router.refresh(); }} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl ring-1 ring-slate-200"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Fussion Seller</p><h1 className="mt-2 text-3xl font-black">Vendor sign in</h1><input required value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="mt-6 w-full rounded-xl border px-3 py-3"/><input required value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" className="mt-3 w-full rounded-xl border px-3 py-3"/>{error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}<button className="mt-5 w-full rounded-xl bg-slate-950 py-3 font-bold text-white">Sign in</button><p className="mt-4 text-center text-sm text-slate-500">Need an account? <Link href="/vendor/register" className="font-bold text-violet-700">Apply as a vendor</Link></p></form></main>; }
