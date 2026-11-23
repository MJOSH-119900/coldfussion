'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { registerVendorAction } from '../../(admin)/admin/actions';
import { useToast } from '../../components/ToastProvider';
import { useBranding } from '../../(public)/components/BrandingProvider';
import PasswordInput from '../../components/PasswordInput';
import { optimizeImageInput } from '../../../lib/image-optimizer';
import { getProductSubcategories, PRODUCT_MAIN_CATEGORIES } from '../../../lib/product-categories';

const businessFields = [
    { name: 'business_name', label: 'Business name', type: 'text', placeholder: 'Your store or business name', autoComplete: 'organization' },
    { name: 'owner_name', label: 'Owner full name', type: 'text', placeholder: 'Name of the primary contact', autoComplete: 'name' },
    { name: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
    { name: 'whatsapp_number', label: 'WhatsApp number', type: 'tel', placeholder: 'Include your country code', autoComplete: 'tel' },
    { name: 'business_address', label: 'Business address', type: 'text', placeholder: 'City and business location', autoComplete: 'street-address' },
] as const;

const fieldClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100';
const passwordFieldClass = fieldClass.replace(/^mt-2\s+/, '');

export default function VendorRegister() {
    const { notify } = useToast();
    const { brand } = useBranding();
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [whatsappUrl, setWhatsappUrl] = useState('');
    const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(true);
    const [mainCategory, setMainCategory] = useState('');
    const [subcategory, setSubcategory] = useState('');
    const subcategories = getProductSubcategories(mainCategory);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setError('');
        const form = event.currentTarget;
        try {
            const result = await registerVendorAction(new FormData(form));
            if (!result.success) {
                const message = result.error || 'Registration failed.';
                setError(message);
                notify('error', message, 'Vendor registration');
                return;
            }
            setDone(true);
            setWhatsappUrl(result.whatsappUrl || '');
            setEmailConfirmationRequired(Boolean(result.needsEmailConfirmation));
            notify('success', 'Your seller application is waiting for admin approval.', 'Application submitted');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Could not submit your application.';
            setError(message);
            notify('error', message, 'Vendor registration');
        }
        finally {
            setPending(false);
        }
    }

    return <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50 px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-violet-200/50 blur-3xl"/>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-100/70 blur-3xl"/>
      <div className="relative mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {brand.logo && <Image src={brand.logo} alt="" width={40} height={40} className="h-10 w-10 rounded-xl bg-white p-1 object-contain shadow-sm ring-1 ring-slate-200"/>}
            <span className="truncate text-sm font-extrabold uppercase tracking-[.14em] text-slate-800">{brand.companyName} marketplace</span>
          </Link>
          <Link href="/vendor/login" className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700">Seller sign in</Link>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
          <div className="bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-violet-800">Seller application</span>
              <span className="text-xs font-semibold text-slate-500">A few details to get started</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Grow your business with {brand.companyName}.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Tell us about your business. Our team will review your application, and you can share the details directly with the admin on WhatsApp after submitting.</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">01&nbsp; Business details</span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">02&nbsp; Account security</span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-2">03&nbsp; Admin review</span>
            </div>
          </div>

          <div className="px-6 py-7 sm:px-10 sm:py-9">
            {done ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl font-black text-emerald-700" aria-hidden="true">✓</span>
              <h2 className="mt-4 text-2xl font-black text-emerald-950">Application received</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-900">Your application is saved and pending administrator review. {emailConfirmationRequired ? 'Confirm your email using the link we sent. ' : ''}You can sign in after your seller account is approved.</p>
              {whatsappUrl
                ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200">Share application on WhatsApp ↗</a>
                : <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Admin WhatsApp is not configured. Your application is saved and visible to the administrator.</p>}
              <div><Link href="/" className="mt-6 inline-block text-sm font-bold text-violet-700 hover:text-violet-900">Back to storefront</Link></div>
            </div> : <form encType="multipart/form-data" onSubmit={submit} className="space-y-9">
              <section aria-labelledby="seller-business-heading">
                <div className="mb-5">
                  <h2 id="seller-business-heading" className="text-lg font-black text-slate-900">Business details</h2>
                  <p className="mt-1 text-sm text-slate-500">Use accurate contact details so the admin can review your application.</p>
                </div>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  {businessFields.map(field => <label key={field.name} className="block text-sm font-bold text-slate-700">
                    {field.label}
                    <input required name={field.name} type={field.type} placeholder={field.placeholder} autoComplete={field.autoComplete} className={fieldClass}/>
                  </label>)}
                </div>
                <label className="mt-5 block text-sm font-bold text-slate-700">
                  Business description
                  <textarea required name="business_description" rows={4} placeholder="What do you sell, and what should customers know about your business?" className={`${fieldClass} resize-y`}/>
                  <span className="mt-1.5 block text-xs font-normal text-slate-500">A clear description helps us understand your products and business.</span>
                </label>
                <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:p-5">
                  <h3 className="text-sm font-black text-slate-900">Your first product category</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Your first approved product must match this category and subcategory. You can request approval for additional products later.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Main category
                      <select required name="product_main_category" value={mainCategory} onChange={event => { setMainCategory(event.target.value); setSubcategory(''); }} className={fieldClass}>
                        <option value="" disabled>Select a main category</option>
                        {PRODUCT_MAIN_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-bold text-slate-700">
                      Subcategory
                      <select required name="product_subcategory" value={subcategory} onChange={event => setSubcategory(event.target.value)} disabled={!mainCategory} className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                        <option value="" disabled>Select a subcategory</option>
                        {subcategories.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    {subcategory === 'Other' && <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
                      Specify the product or subcategory
                      <input required maxLength={100} name="product_subcategory_custom" placeholder="For example, handmade baskets" className={fieldClass}/>
                    </label>}
                  </div>
                </div>
              </section>

              <section aria-labelledby="seller-security-heading" className="border-t border-slate-100 pt-8">
                <div className="mb-5">
                  <h2 id="seller-security-heading" className="text-lg font-black text-slate-900">Secure account access</h2>
                  <p className="mt-1 text-sm text-slate-500">New accounts need a password of at least 12 characters and email confirmation. If you already have an account, enter its current password in both fields to apply with it.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="text-sm font-bold text-slate-700">
                    <label htmlFor="vendor-register-password">Password</label>
                    <PasswordInput id="vendor-register-password" required name="password" autoComplete="current-password" placeholder="Current password or 12+ characters" wrapperClassName="mt-2" className={passwordFieldClass} toggleClassName="text-emerald-700 hover:text-emerald-900 focus:ring-emerald-300" />
                  </div>
                  <div className="text-sm font-bold text-slate-700">
                    <label htmlFor="vendor-register-password-confirm">Confirm password</label>
                    <PasswordInput id="vendor-register-password-confirm" required name="password_confirmation" autoComplete="current-password" placeholder="Enter the same password" wrapperClassName="mt-2" className={passwordFieldClass} toggleClassName="text-emerald-700 hover:text-emerald-900 focus:ring-emerald-300" />
                  </div>
                </div>
              </section>

              <section aria-labelledby="seller-logo-heading" className="border-t border-slate-100 pt-8">
                <h2 id="seller-logo-heading" className="text-lg font-black text-slate-900">Business logo <span className="text-sm font-medium text-slate-400">Optional</span></h2>
                <p className="mt-1 text-sm text-slate-500">A clear, high-quality image can help customers recognize your business.</p>
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center transition hover:border-violet-300 hover:bg-violet-50/50">
                  <span className="text-sm font-bold text-slate-700">Choose a logo image</span>
                  <span className="mt-1 text-xs text-slate-500">PNG, JPG, or WEBP</span>
                  <input name="business_logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => { const input = event.currentTarget; input.disabled = true; try { await optimizeImageInput(input); } catch (error) { input.value = ''; const message = error instanceof Error ? error.message : 'Could not prepare the logo.'; setError(message); notify('error', message, 'Image preparation failed'); } finally { input.disabled = false; } }} className="mt-4 block max-w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:font-bold file:text-violet-800 hover:file:bg-violet-200"/>
                </label>
              </section>

              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
              <div className="border-t border-slate-100 pt-6">
                <button disabled={pending} className="w-full rounded-xl bg-violet-700 py-3.5 font-bold text-white shadow-lg shadow-violet-700/15 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Submitting application…' : 'Submit seller application'}</button>
                <p className="mt-4 text-center text-sm text-slate-500">Already approved? <Link href="/vendor/login" className="font-bold text-violet-700 hover:text-violet-900">Sign in to your account</Link></p>
              </div>
            </form>}
          </div>
        </section>
        <p className="mt-6 text-center text-xs text-slate-500">Your application will be reviewed before your seller account is activated.</p>
      </div>
    </main>;
}
