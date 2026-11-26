'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

function safeNextPath(value: string | null) {
    const path = value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
    try {
        return new URL(path, window.location.origin).origin === window.location.origin ? path : '/';
    } catch {
        return '/';
    }
}

export default function AuthCallbackPage() {
    useEffect(() => {
        let cancelled = false;
        const finish = async () => {
            const currentUrl = new URL(window.location.href);
            const requestedPath = safeNextPath(currentUrl.searchParams.get('next'));
            const failurePath = requestedPath === '/vendor/setup'
                ? '/vendor/setup?authError=invalid-link'
                : '/?authError=invalid-link';
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (!supabaseUrl || !supabaseKey) {
                window.location.replace(failurePath);
                return;
            }

            // This callback processes the URL itself; disable the client's automatic URL
            // detection so it cannot consume the PKCE code or invite fragment a second time.
            const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
                auth: { detectSessionInUrl: false },
            });
            const code = currentUrl.searchParams.get('code');
            const tokenHash = currentUrl.searchParams.get('token_hash') || currentUrl.searchParams.get('token');
            const otpType = currentUrl.searchParams.get('type');
            let authError: Error | null = null;

            if (code) {
                const result = await supabase.auth.exchangeCodeForSession(code);
                authError = result.error;
            } else if (tokenHash && ['signup', 'invite', 'magiclink', 'recovery', 'email_change'].includes(otpType || '')) {
                const result = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: otpType as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change',
                });
                authError = result.error;
            } else {
                // Some Supabase invite templates return an implicit-flow session in the URL fragment.
                const fragment = new URLSearchParams(currentUrl.hash.slice(1));
                const accessToken = fragment.get('access_token');
                const refreshToken = fragment.get('refresh_token');
                if (accessToken && refreshToken) {
                    const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                    authError = result.error;
                } else {
                    authError = new Error('The invitation URL did not contain a usable authentication token.');
                }
            }

            if (cancelled) return;
            if (authError) {
                console.error('Supabase auth callback failed:', authError.message);
                window.location.replace(failurePath);
                return;
            }

            const { data, error } = await supabase.auth.getUser();
            if (cancelled) return;
            if (error || !data.user) {
                console.error('Supabase callback user lookup failed:', error?.message || 'No authenticated user.');
                window.location.replace(failurePath);
                return;
            }

            // Remove one-time codes and access tokens from the browser address bar.
            window.location.replace(requestedPath);
        };

        void finish().catch(error => {
            console.error('Could not complete Supabase auth callback:', error);
            if (!cancelled) {
                const currentUrl = new URL(window.location.href);
                window.location.replace(safeNextPath(currentUrl.searchParams.get('next')) === '/vendor/setup'
                    ? '/vendor/setup?authError=invalid-link'
                    : '/?authError=invalid-link');
            }
        });
        return () => { cancelled = true; };
    }, []);

    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
      <div role="status" className="text-center">
        <p className="text-lg font-bold">Verifying your secure link…</p>
        <p className="mt-2 text-sm text-slate-300">You’ll be sent to your account setup when verification is complete.</p>
      </div>
    </main>;
}
