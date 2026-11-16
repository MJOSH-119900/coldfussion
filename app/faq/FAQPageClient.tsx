'use client';

import { FormEvent, useState } from 'react';
import { submitCustomerInquiryAction } from '../(public)/components/public-actions';

const faqEntries = [
    {
        question: 'What does this marketplace do?',
        answer: 'The marketplace connects shoppers with independent vendors. It provides a place to discover products and reliable sellers; each vendor remains responsible for their own listings, conversations, payment arrangements, and delivery.',
        keywords: 'platform store marketplace buy order',
    },
    {
        question: 'Are vendors checked before they can sell?',
        answer: 'Vendors are reviewed by the admin before approval, including their application and business details. Approval is a screening step, not a guarantee of any particular product, transaction, or delivery.',
        keywords: 'verified vetted approval trust seller',
    },
    {
        question: 'How do I make sure I am choosing the right product?',
        answer: 'Read the complete listing and check the model, size, colour, condition, quantity, and photos. Ask the vendor to confirm any detail that matters to you before arranging payment.',
        keywords: 'product model size condition quality photos',
    },
    {
        question: 'How do payment and delivery work?',
        answer: 'You contact the vendor directly to confirm stock, the full price, accepted payment method, delivery cost, delivery timing, and any return terms. Vendors arrange fulfilment themselves; the marketplace does not handle payment or delivery.',
        keywords: 'payment delivery shipping dispatch pickup refund',
    },
    {
        question: 'How can I report a vendor or a problem?',
        answer: 'Use the enquiry form below and choose “Report a vendor”. Include the vendor or product details and a clear description. The admin will receive a dashboard notification and you can open WhatsApp to send the same report.',
        keywords: 'report complaint dispute problem seller vendor',
    },
    {
        question: 'Can I leave product feedback?',
        answer: 'Yes. Submit a rating and comment on the product page. Feedback is reviewed by the admin before it appears publicly. Reviews are shopper-submitted and are not represented as verified purchases.',
        keywords: 'feedback review rating stars comment',
    },
    {
        question: 'What information should I never share?',
        answer: 'Never share your card PIN, one-time password (OTP), banking password, or other security codes with a vendor or anyone claiming to be support. Confirm the recipient and payment details independently before paying.',
        keywords: 'security scam safe fraud otp pin',
    },
];

const inquiryCategories = [
    ['general', 'General question'],
    ['product', 'Product question'],
    ['delivery', 'Payment or delivery'],
    ['report_vendor', 'Report a vendor'],
    ['other', 'Other'],
];

export default function FAQPageClient({ companyName }: { companyName: string }) {
    const [query, setQuery] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [category, setCategory] = useState('general');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [whatsappUrl, setWhatsappUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const normalizedQuery = query.trim().toLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(term => term.length > 2);
    const matches = !normalizedQuery
        ? faqEntries
        : !terms.length
            ? faqEntries.filter(item => `${item.question} ${item.keywords}`.toLowerCase().includes(normalizedQuery))
            : faqEntries.map(item => {
            const searchable = `${item.question} ${item.answer} ${item.keywords}`.toLowerCase();
            return { item, score: terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
        }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.item);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        setError('');
        setStatus('');
        setWhatsappUrl('');
        try {
            const result = await submitCustomerInquiryAction(new FormData(event.currentTarget));
            if (!result.success)
                throw new Error(result.error || 'Could not save your enquiry.');
            setStatus('Your enquiry has been recorded for the admin. If WhatsApp is configured, use the button below to send it directly as well.');
            setWhatsappUrl(result.whatsappUrl || '');
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Could not save your enquiry.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
            <section className="overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white sm:px-10 sm:py-14">
                <p className="text-xs font-bold uppercase tracking-[.22em] text-violet-300">Help &amp; safety</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Questions before you shop?</h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">Search the answers below or send a question to the {companyName} admin. Reports and enquiries are saved to the admin inbox.</p>
                <label className="mt-7 block max-w-2xl">
                    <span className="sr-only">Search frequently asked questions</span>
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ask a question, e.g. “How does delivery work?”" className="w-full rounded-xl border border-white/15 bg-white px-4 py-3.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-violet-300/30" />
                </label>
            </section>

            <section aria-labelledby="marketplace-safety" className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-7">
                <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-xl text-amber-800">!</span>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-800">Please trade with care</p>
                        <h2 id="marketplace-safety" className="mt-1 text-xl font-black text-slate-950">A safer shopping checklist</h2>
                    </div>
                </div>
                <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
                    <li className="flex gap-2"><span className="font-black text-amber-700">✓</span><span>Vendors are reviewed by the admin before approval, but vetting is not a guarantee of a product or transaction.</span></li>
                    <li className="flex gap-2"><span className="font-black text-amber-700">✓</span><span>Check product details, size, condition, photos, stock, and the total price; ask the vendor to confirm anything unclear.</span></li>
                    <li className="flex gap-2"><span className="font-black text-amber-700">✓</span><span>Agree directly with the vendor on payment, delivery charges, delivery timing, and return terms before paying.</span></li>
                    <li className="flex gap-2"><span className="font-black text-amber-700">✓</span><span>Keep your conversation and payment evidence. Never share an OTP, card PIN, or banking password.</span></li>
                </ul>
                <p className="mt-5 border-t border-amber-200 pt-4 text-sm font-semibold leading-6 text-amber-950">
                    Remember: {companyName} provides a platform for vendors to sell and shoppers to find and connect with sellers. You contact the vendor directly, so use due diligence when choosing a product and arranging payment or delivery. You can report a vendor to the admin using the form below.
                </p>
            </section>

            <section className="mt-10">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">FAQ assistant</p><h2 className="mt-1 text-2xl font-black text-slate-950">Frequently asked questions</h2></div>
                    {normalizedQuery && <p className="text-sm text-slate-500">{matches.length} answer{matches.length === 1 ? '' : 's'} found</p>}
                </div>
                <div className="space-y-3">
                    {matches.map(item => <details key={item.question} open={Boolean(normalizedQuery)} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900">
                            <span>{item.question}</span>
                            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700 transition group-open:rotate-45">+</span>
                        </summary>
                        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{item.answer}</p>
                    </details>)}
                    {!matches.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                        <p className="font-bold text-slate-800">No matching answer yet</p>
                        <p className="mt-1 text-sm text-slate-500">Send your question below and the admin will receive it in the dashboard inbox.</p>
                        <button type="button" onClick={() => {
                            setMessage(query);
                            document.getElementById('contact-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Ask the admin</button>
                    </div>}
                </div>
            </section>

            <section id="contact-admin" className="mt-12 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Need more help?</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Ask the admin or report a vendor</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Your message and WhatsApp number are saved in the admin dashboard. When configured, you can also open WhatsApp with your message ready to send. Opening WhatsApp does not send it automatically.</p>
                <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-700">Your WhatsApp number (include country code)
                        <input required name="whatsapp" value={whatsapp} onChange={event => setWhatsapp(event.target.value)} inputMode="tel" placeholder="2348012345678" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Topic
                        <select name="category" value={category} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-violet-500">
                            {inquiryCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Your question or report
                        <textarea required name="message" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={1500} rows={5} placeholder="Tell us what happened or what you need help with..." className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    </label>
                    {error && <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2">{error}</p>}
                    {status && <p role="status" className="text-sm font-semibold text-emerald-700 sm:col-span-2">{status}</p>}
                    {status && !whatsappUrl && <p className="text-sm text-slate-600 sm:col-span-2">Admin WhatsApp is not configured. Your message is saved in the admin inbox.</p>}
                    <div className="flex flex-wrap gap-3 sm:col-span-2">
                        <button type="submit" disabled={isSubmitting} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? 'Saving enquiry…' : 'Send enquiry'}</button>
                        {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100">Continue in WhatsApp ↗</a>}
                    </div>
                </form>
            </section>
        </main>
    );
}
