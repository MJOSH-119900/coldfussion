'use client';

import { FormEvent, useState, useTransition } from 'react';
import type { BrandSettings } from '../../../(public)/components/types/store';
import { useBranding } from '../../../(public)/components/BrandingProvider';
import { useToast } from '../../../components/ToastProvider';
import { saveBrandSettingsAction } from '../actions';

export default function BrandManager({ initialBrand }: { initialBrand: BrandSettings }) {
    const [companyName, setCompanyName] = useState(initialBrand.companyName);
    const [logo, setLogo] = useState(initialBrand.logo);
    const [removeLogo, setRemoveLogo] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { setBrand } = useBranding();
    const { notify } = useToast();

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set('remove_logo', String(removeLogo));
        startTransition(async () => {
            try {
                const result = await saveBrandSettingsAction(formData);
                if (!result.success || !result.brand) throw new Error(result.error || 'Branding could not be saved.');
                setCompanyName(result.brand.companyName);
                setLogo(result.brand.logo);
                setRemoveLogo(false);
                setBrand(result.brand);
                form.reset();
                notify('success', 'Your company name and logo are now updated across the site.', 'Branding saved');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not save company branding.', 'Save failed');
            }
        });
    }

    return (
        <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Store identity</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Company name and logo</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Your branding is used across the storefront, navigation, dashboards and page title. Changes reach open pages automatically.</p>

            <form onSubmit={handleSubmit} encType="multipart/form-data" className="mt-5 space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                    Company name
                    <input
                        required
                        name="company_name"
                        value={companyName}
                        onChange={event => setCompanyName(event.target.value)}
                        maxLength={60}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                    />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                    Logo image <span className="font-normal text-slate-500">(optional)</span>
                    <input
                        name="logo_file"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG or WEBP · maximum 5 MB.</span>
                </label>

                {logo && <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {!removeLogo && <img src={logo} alt={`${companyName} logo preview`} className="h-16 w-16 rounded-lg bg-white object-contain p-1" />}
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input type="checkbox" checked={removeLogo} onChange={event => setRemoveLogo(event.target.checked)} />
                        Remove current logo and use the company name as text
                    </label>
                </div>}

                <button type="submit" disabled={isPending} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                    {isPending ? 'Saving…' : 'Save branding'}
                </button>
            </form>
        </section>
    );
}
