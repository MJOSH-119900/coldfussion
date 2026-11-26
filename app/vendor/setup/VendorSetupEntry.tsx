'use client';

import { useEffect, useState } from 'react';
import { PasswordResetCompleteForm, VendorSetupLinkRecovery } from '../../components/PasswordSecurity';
import { getVendorWhatsAppSetupInfoAction } from '../../(admin)/admin/actions';
import VendorOneTimeSetupForm from './VendorOneTimeSetupForm';

export default function VendorSetupEntry({ email }: { email: string }) {
    const [token, setToken] = useState('');
    const [tokenInfo, setTokenInfo] = useState<{ email: string; ownerName: string } | null>(null);
    const [tokenChecked, setTokenChecked] = useState(false);

    useEffect(() => {
        const setupToken = new URLSearchParams(window.location.hash.slice(1)).get('setup_token') || '';
        if (!setupToken) {
            setTokenChecked(true);
            return;
        }
        setToken(setupToken);
        void getVendorWhatsAppSetupInfoAction(setupToken).then(result => {
            if (result.success) setTokenInfo({ email: result.email, ownerName: result.ownerName });
        }).catch(error => console.error('Could not validate vendor setup link:', error)).finally(() => setTokenChecked(true));
    }, []);

    if (!tokenChecked) return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white"><p role="status" className="font-semibold">Checking your secure setup link…</p></main>;
    if (token) {
        if (tokenInfo) return <VendorOneTimeSetupForm token={token} email={tokenInfo.email} ownerName={tokenInfo.ownerName}/>;
        return <main className="grid min-h-screen place-items-center bg-slate-950 px-4"><div className="max-w-lg rounded-2xl bg-white p-7 text-center"><h1 className="text-2xl font-black">This setup link is no longer valid</h1><p className="mt-3 text-sm leading-6 text-slate-600">The link may have expired or already been used. Contact the administrator and ask them to generate a new one-time WhatsApp setup link.</p></div></main>;
    }
    return email ? <PasswordResetCompleteForm role="vendor" email={email}/> : <VendorSetupLinkRecovery/>;
}
