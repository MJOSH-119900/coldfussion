'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import AboutPortraitPlaceholder from '../../../(public)/components/AboutPortraitPlaceholder';
import type { OwnerAbout } from '../../../(public)/components/types/store';
import { useToast } from '../../../components/ToastProvider';
import { saveOwnerAboutAction } from '../actions';
import { optimizeImageInput } from '../../../../lib/image-optimizer';

export default function AboutManager({ initialProfile }: { initialProfile: OwnerAbout }) {
    const [profile, setProfile] = useState(initialProfile);
    const [name, setName] = useState(initialProfile.name);
    const [title, setTitle] = useState(initialProfile.title);
    const [story, setStory] = useState(initialProfile.story);
    const [hobbies, setHobbies] = useState(initialProfile.hobbies.join('\n'));
    const [preview, setPreview] = useState(initialProfile.image);
    const [imageFileSelected, setImageFileSelected] = useState(false);
    const [removeImage, setRemoveImage] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { notify } = useToast();

    useEffect(() => () => {
        if (preview.startsWith('blob:'))
            URL.revokeObjectURL(preview);
    }, [preview]);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set('remove_image', String(removeImage));
        startTransition(async () => {
            try {
                const result = await saveOwnerAboutAction(formData);
                if (!result.success || !result.profile)
                    throw new Error(result.error || 'The About profile could not be saved.');
                setProfile(result.profile);
                setName(result.profile.name);
                setTitle(result.profile.title);
                setStory(result.profile.story);
                setHobbies(result.profile.hobbies.join('\n'));
                setPreview(result.profile.image);
                setImageFileSelected(false);
                setRemoveImage(false);
                form.reset();
                notify('success', 'Your About story is now published on the storefront.', 'About page updated');
            } catch (error) {
                notify('error', error instanceof Error ? error.message : 'Could not save your About profile.', 'Save failed');
            }
        });
    }

    const hobbyList = hobbies.split(/\r?\n|,/).map(hobby => hobby.trim()).filter(Boolean).slice(0, 8);

    return (
        <section className="space-y-5">
            {profile.isDemo && <div role="status" className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
                <strong>Demo preview:</strong> The storefront currently shows sample copy so you can see how this page will look. Replace it with your own details and photo, then save to publish your story.
            </div>}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
                <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Storefront story</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">About the owner</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">Share who you are, how the store began, and a few things you enjoy. Your saved story appears on the storefront About page.</p>
                    </div>

                    <label className="block text-sm font-semibold text-slate-700">
                        Your name
                        <input required name="name" value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="e.g. Alex Morgan" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                        Role or short tagline <span className="font-normal text-slate-400">(optional)</span>
                        <input name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="e.g. Founder & Curator" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                        Profile photo <span className="font-normal text-slate-400">(optional)</span>
                        <input name="image_file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={async event => {
                            const input = event.currentTarget;
                            input.disabled = true;
                            try { await optimizeImageInput(input); } catch (error) { input.value = ''; notify('error', error instanceof Error ? error.message : 'Could not prepare the profile image.', 'Image preparation failed'); }
                            finally { input.disabled = false; }
                            const file = input.files?.[0];
                            setImageFileSelected(Boolean(file));
                            setRemoveImage(false);
                            setPreview(file ? URL.createObjectURL(file) : profile.image);
                        }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        <span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG or WEBP · maximum 8 MB.</span>
                    </label>

                    {!!profile.image && <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <input type="checkbox" checked={removeImage} disabled={imageFileSelected} onChange={event => {
                            setRemoveImage(event.target.checked);
                            if (event.target.checked)
                                setPreview('');
                            else
                                setPreview(profile.image);
                        }} />
                        Remove the current profile photo
                    </label>}

                    <label className="block text-sm font-semibold text-slate-700">
                        Your story
                        <textarea required name="story" value={story} onChange={event => setStory(event.target.value)} maxLength={3000} rows={7} placeholder="Tell shoppers why you started the store and what inspires you..." className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 leading-6 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                        <span className="mt-1 block text-right text-xs font-normal text-slate-400">{story.length}/3000</span>
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                        Hobbies and interests
                        <textarea name="hobbies" value={hobbies} onChange={event => setHobbies(event.target.value)} rows={3} placeholder={'One per line, e.g.\nPhotography\nTravel\nDiscovering local makers'} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                        <span className="mt-1 block text-xs font-normal text-slate-500">Add up to 8, one per line. Comma-separated entries also work.</span>
                    </label>

                    <button type="submit" disabled={isPending} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50">
                        {isPending ? 'Publishing…' : 'Save and publish About page'}
                    </button>
                </form>

                <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4">
                        <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Live preview</p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">How shoppers will see it</h3>
                    </div>
                    <div className="p-5">
                        <div className="overflow-hidden rounded-2xl bg-slate-100">
                            {preview ? <img src={preview} alt="About profile preview" className="aspect-[4/3] w-full object-cover" /> : <AboutPortraitPlaceholder className="aspect-[4/3] w-full" />}
                        </div>
                        <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-violet-600">Meet the person behind the store</p>
                        <h4 className="mt-2 text-2xl font-black text-slate-950">{name || 'Your name'}</h4>
                        {title && <p className="mt-1 text-sm font-semibold text-slate-500">{title}</p>}
                        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{story || 'Your story preview will appear here.'}</p>
                        {!!hobbyList.length && <div className="mt-5 flex flex-wrap gap-2">{hobbyList.map(hobby => <span key={hobby} className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">{hobby}</span>)}</div>}
                    </div>
                </aside>
            </div>
        </section>
    );
}
