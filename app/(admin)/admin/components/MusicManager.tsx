'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import { MusicTrack } from '../../../../lib/music';
import { useToast } from '../../../components/ToastProvider';
import { deleteMusicTrackAction, getMusicSettingsAction, setMusicPlaybackAction, uploadMusicTrackAction } from '../actions';

export default function MusicManager({ initialTracks }: { initialTracks: MusicTrack[] }) {
    const [tracks, setTracks] = useState(initialTracks);
    const [musicEnabled, setMusicEnabled] = useState(true);
    const [savingPlayback, setSavingPlayback] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { notify, confirm } = useToast();

    useEffect(() => {
        void getMusicSettingsAction().then((settings) => setMusicEnabled(settings.enabled)).catch(() => undefined);
    }, []);

    async function toggleStorefrontMusic() {
        setSavingPlayback(true);
        try {
            const result = await setMusicPlaybackAction(!musicEnabled);
            if (!result.success) throw new Error('Could not update storefront music.');
            setMusicEnabled(result.settings.enabled);
            notify('success', result.settings.enabled ? 'Background music is enabled on the storefront.' : 'Background music has been paused for all shoppers.', result.settings.enabled ? 'Music enabled' : 'Music paused');
        } catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not update music.', 'Update failed');
        } finally { setSavingPlayback(false); }
    }

    async function handleUpload(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        startTransition(async () => {
            try {
                const result = await uploadMusicTrackAction(formData);

                if (!result.success) {
                    throw new Error(result.error);
                }

                if (!result.track) throw new Error('The uploaded song could not be saved.');
                setTracks((current) => [...current, result.track]);
                form.reset();
                notify(
                    'success',
                    'The song has been added to the shopper playlist.',
                    'Song added',
                );
            } catch (error) {
                notify(
                    'error',
                    error instanceof Error ? error.message : 'Could not add the song.',
                    'Upload failed',
                );
            }
        });
    }

    async function handleDelete(id: string) {
        const accepted = await confirm({
            title: 'Remove this song?',
            message: 'The song will no longer appear in the shopper playlist.',
            confirmText: 'Remove song',
            cancelText: 'Keep song',
            danger: true,
        });

        if (!accepted) {
            return;
        }

        startTransition(async () => {
            try {
                const result = await deleteMusicTrackAction(id);

                if (!result.success) {
                    throw new Error(result.error);
                }

                setTracks((current) => current.filter((track) => track.id !== id));
                notify('success', 'The song was removed from the playlist.', 'Song removed');
            } catch (error) {
                notify(
                    'error',
                    error instanceof Error ? error.message : 'Could not remove the song.',
                    'Remove failed',
                );
            }
        });
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">
                    Shopper experience
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Background music</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Manage the playlist and control whether background music is available to shoppers. Your global Play/Pause setting reaches open storefronts within a few seconds. Browsers still require a shopper to press Play before sound can start.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4">
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">Storefront music: {musicEnabled ? 'Enabled' : 'Paused'}</p><p className="text-xs text-slate-600">{musicEnabled ? 'Shoppers can play the playlist.' : 'Playback is paused for all shoppers.'}</p></div>
                    <button type="button" onClick={toggleStorefrontMusic} disabled={savingPlayback} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{savingPlayback ? 'Updating...' : musicEnabled ? 'Pause on storefront' : 'Play on storefront'}</button>
                </div>
            </div>

            <form
                onSubmit={handleUpload}
                encType="multipart/form-data"
                className="grid gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Song title
                    </label>
                    <input
                        required
                        name="title"
                        placeholder="e.g. Morning playlist"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">
                        Audio file
                    </label>
                    <input
                        required
                        name="audio_file"
                        type="file"
                        accept=".mp3,.m4a,.ogg,.wav,.webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">MP3, M4A, OGG, WAV or WebM · each song is limited to 10 MB, with a 10 MB total library limit.</p>
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                    {isPending ? 'Saving...' : 'Add song'}
                </button>
            </form>

            <div className="mt-6 space-y-3">
                {tracks.length ? (
                    tracks.map((track, index) => (
                        <div
                            key={track.id}
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                        >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">
                                    {index + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate font-bold text-slate-900">{track.title}</p>
                                    <p className="text-xs text-slate-500">{track.id}</p>
                                </div>
                            </div>

                            <audio controls preload="none" className="w-full sm:max-w-xs" src={track.file} />

                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleDelete(track.id)}
                                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                        No songs have been added yet.
                    </div>
                )}
            </div>
        </section>
    );
}
