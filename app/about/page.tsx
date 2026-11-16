import type { Metadata } from 'next';
import Link from 'next/link';
import AboutPortraitPlaceholder from '../(public)/components/AboutPortraitPlaceholder';
import { getBrandSettings } from '../../lib/branding';
import { getOwnerAbout } from '../../lib/about';

export async function generateMetadata(): Promise<Metadata> {
    const [brand, profile] = await Promise.all([getBrandSettings(), getOwnerAbout()]);
    return {
        title: `About ${profile.name} | ${brand.companyName}`,
        description: profile.story.slice(0, 160),
    };
}

export default async function AboutPage() {
    const [brand, profile] = await Promise.all([getBrandSettings(), getOwnerAbout()]);

    return (
        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700">
                <span aria-hidden="true">←</span> Back to {brand.companyName}
            </Link>

            {profile.isDemo && <div role="status" className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">
                <strong>Demo profile:</strong> This sample shows how the owner story will look. The store owner can replace it from the Admin dashboard.
            </div>}

            <section className="mt-6 overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl shadow-violet-950/10">
                <div className="grid md:grid-cols-[1.05fr_.95fr]">
                    <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
                        <p className="text-xs font-bold uppercase tracking-[.24em] text-violet-300">The story behind {brand.companyName}</p>
                        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{profile.name}</h1>
                        {profile.title && <p className="mt-2 text-lg font-semibold text-violet-200">{profile.title}</p>}
                        <div className="mt-6 h-1 w-16 rounded-full bg-violet-400" />
                        <p className="mt-6 whitespace-pre-line text-sm leading-7 text-slate-200 sm:text-base sm:leading-8">{profile.story}</p>
                    </div>
                    <div className="min-h-72 bg-slate-900 p-4 sm:min-h-96 sm:p-6">
                        <div className="h-full min-h-72 overflow-hidden rounded-[1.5rem] ring-1 ring-white/10 sm:min-h-96">
                            {profile.image
                                ? <img src={profile.image} alt={`${profile.name}, owner of ${brand.companyName}`} className="h-full min-h-72 w-full object-cover sm:min-h-96" />
                                : <AboutPortraitPlaceholder className="h-full min-h-72 w-full sm:min-h-96" label="Demo portrait placeholder; add a profile photo from Admin" />}
                        </div>
                    </div>
                </div>
            </section>

            {!!profile.hobbies.length && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Away from the shop</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Things I enjoy</h2>
                <p className="mt-2 text-sm text-slate-500">A few interests that inspire me and the way I curate the store.</p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                    {profile.hobbies.map(hobby => <span key={hobby} className="rounded-full border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900">{hobby}</span>)}
                </div>
            </section>}

            <section className="mt-8 flex flex-col gap-4 rounded-3xl bg-violet-50 p-6 ring-1 ring-violet-100 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Thanks for stopping by</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">Find something you’ll love.</h2>
                    <p className="mt-2 text-sm text-slate-600">Explore the collection and discover what’s new at {brand.companyName}.</p>
                </div>
                <Link href="/#all-products" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700">Explore products <span className="ml-2" aria-hidden="true">→</span></Link>
            </section>
        </main>
    );
}
