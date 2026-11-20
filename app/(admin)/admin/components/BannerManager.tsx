'use client';

import { FormEvent, useState, useTransition } from 'react';
import { BannerIntervalUnit, BannerSettings, BannerSlide } from '../../../(public)/components/types/store';
import { useToast } from '../../../components/ToastProvider';
import { deleteBannerAction, saveBannerAction, saveBannerIntervalAction } from '../actions';
import { optimizeImageInput } from '../../../../lib/image-optimizer';

export default function BannerManager({ initialSettings }: { initialSettings: BannerSettings }) {
    const [slides, setSlides] = useState(initialSettings.slides);
    const [intervalValue, setIntervalValue] = useState(String(initialSettings.intervalValue));
    const [intervalUnit, setIntervalUnit] = useState<BannerIntervalUnit>(initialSettings.intervalUnit);
    const [editing, setEditing] = useState<BannerSlide>();
    const [isPending, startTransition] = useTransition();
    const { notify, confirm } = useToast();
    const maxIntervalValue = intervalUnit === 'days' ? 365 : intervalUnit === 'hours' ? 8760 : 31536000;

    function handleSaveBanner(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
            try {
                const result = await saveBannerAction(formData);
                if (!result.success || !result.slide) throw new Error(result.error || 'The banner could not be saved.');
                setSlides(current => {
                    const exists = current.some(slide => slide.id === result.slide.id);
                    return exists
                        ? current.map(slide => slide.id === result.slide.id ? result.slide : slide)
                        : [...current, result.slide];
                });
                setEditing(undefined);
                form.reset();
                notify('success', 'The banner is now available on the storefront.', 'Banner saved');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not save the banner.', 'Save failed');
            }
        });
    }

    async function handleDelete(id: string) {
        const accepted = await confirm({
            title: 'Delete this banner?',
            message: 'This banner will be removed from the storefront carousel.',
            confirmText: 'Delete banner',
            cancelText: 'Keep banner',
            danger: true,
        });
        if (!accepted) return;

        startTransition(async () => {
            try {
                const result = await deleteBannerAction(id);
                if (!result.success) throw new Error(result.error);
                setSlides(current => current.filter(slide => slide.id !== id));
                if (editing?.id === id) setEditing(undefined);
                notify('success', 'The banner was removed.', 'Banner deleted');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not delete the banner.', 'Delete failed');
            }
        });
    }

    function handleSaveInterval() {
        startTransition(async () => {
            try {
                const result = await saveBannerIntervalAction(Number(intervalValue), intervalUnit);
                if (!result.success) throw new Error(result.error);
                notify('success', 'The carousel rotation interval has been updated.', 'Interval saved');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not update the carousel interval.', 'Update failed');
            }
        });
    }

    return (
        <section className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Storefront appearance</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Homepage banners</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Add banners with your own image and copy. Multiple banners rotate automatically using the interval below.
                </p>

                <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4">
                    <label className="text-sm font-semibold text-slate-700">
                        Change banner every
                        <input
                            type="number"
                            min="1"
                            max={maxIntervalValue}
                            step="1"
                            value={intervalValue}
                            onChange={event => setIntervalValue(event.target.value)}
                            className="mt-1 block w-28 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                        Time unit
                        <select
                            value={intervalUnit}
                            onChange={event => setIntervalUnit(event.target.value as BannerIntervalUnit)}
                            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        >
                            <option value="seconds">Seconds</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                        </select>
                    </label>
                    <button
                        type="button"
                        disabled={isPending || !Number.isInteger(Number(intervalValue)) || Number(intervalValue) < 1 || Number(intervalValue) > maxIntervalValue}
                        onClick={handleSaveInterval}
                        className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                        Save interval
                    </button>
                    <p className="w-full text-xs text-slate-500">The interval applies when at least two banners are published. Maximum: 365 days.</p>
                </div>
            </div>

            <form
                key={editing?.id || 'new-banner'}
                onSubmit={handleSaveBanner}
                encType="multipart/form-data"
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
                <h3 className="text-lg font-black">{editing ? 'Edit banner' : 'Create a banner'}</h3>
                <input type="hidden" name="id" value={editing?.id || ''} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-700">
                        Heading
                        <input
                            required
                            name="title"
                            defaultValue={editing?.title || ''}
                            maxLength={120}
                            placeholder="A headline shoppers will see"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500"
                        />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                        Banner image {editing && <span className="font-normal text-slate-500">(optional to keep current image)</span>}
                        <input
                            name="image_file"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/*"
                            required={!editing}
                            onChange={async event => { const input = event.currentTarget; input.disabled = true; try { await optimizeImageInput(input); } catch (error) { input.value = ''; notify('error', error instanceof Error ? error.message : 'Could not prepare the banner image.', 'Image preparation failed'); } finally { input.disabled = false; } }}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG, WEBP, GIF or AVIF · maximum 12 MB.</span>
                    </label>
                    <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                        Supporting text
                        <textarea
                            name="description"
                            defaultValue={editing?.description || ''}
                            maxLength={300}
                            rows={3}
                            placeholder="Optional details for the banner"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500"
                        />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                        Button label <span className="font-normal text-slate-500">(optional)</span>
                        <input
                            name="button_label"
                            defaultValue={editing?.button_label || ''}
                            maxLength={40}
                            placeholder="Shop now"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500"
                        />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                        Button link <span className="font-normal text-slate-500">(optional)</span>
                        <input
                            name="button_url"
                            type="text"
                            defaultValue={editing?.button_url || ''}
                            maxLength={500}
                            placeholder="/#all-products"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-violet-500"
                        />
                    </label>
                </div>
                {editing && <img src={editing.image} alt="Current banner preview" className="mt-4 h-36 w-full rounded-xl object-cover sm:max-w-sm" />}
                <div className="mt-4 flex flex-wrap gap-2">
                    <button type="submit" disabled={isPending} className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                        {isPending ? 'Saving…' : editing ? 'Save changes' : 'Add banner'}
                    </button>
                    {editing && <button type="button" onClick={() => setEditing(undefined)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600">Cancel edit</button>}
                </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-black">Published banners <span className="text-sm font-semibold text-slate-400">({slides.length})</span></h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {slides.map((slide, index) => (
                        <article key={slide.id} className="overflow-hidden rounded-xl border border-slate-200">
                            <img src={slide.image} alt="" className="h-40 w-full object-cover" />
                            <div className="p-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Banner {index + 1}</p>
                                <h4 className="mt-1 font-black">{slide.title}</h4>
                                {slide.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{slide.description}</p>}
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={() => setEditing(slide)} className="rounded-lg border px-3 py-1.5 text-xs font-bold hover:border-violet-400">Edit</button>
                                    <button type="button" disabled={isPending} onClick={() => handleDelete(slide.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
                                </div>
                            </div>
                        </article>
                    ))}
                    {!slides.length && <p className="py-8 text-center text-sm text-slate-500 md:col-span-2">No banners published. The default storefront hero is currently shown.</p>}
                </div>
            </div>
        </section>
    );
}
