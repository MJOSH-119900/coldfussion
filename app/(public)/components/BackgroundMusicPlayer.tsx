'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type MusicTrack = {
    id: string;
    title: string;
    file: string;
    created_at: string;
};

export default function BackgroundMusicPlayer({ visible = true }: { visible?: boolean }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const shopperHasInteracted = useRef(false);
    const adminEnabledRef = useRef(true);
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(0.35);
    const [open, setOpen] = useState(false);
    const [adminEnabled, setAdminEnabled] = useState(true);

    const currentTrack = tracks[currentIndex];

    useEffect(() => {
        let cancelled = false;
        let interval: ReturnType<typeof setInterval> | undefined;

        async function loadStorefrontMusic() {
            try {
                const response = await fetch('/api/music', { cache: 'no-store' });
                if (!response.ok) return;
                const payload = await response.json();
                const data = Array.isArray(payload) ? payload : payload.tracks;
                const enabled = Array.isArray(payload) ? true : payload.enabled !== false;
                if (!cancelled) {
                    if (!adminEnabledRef.current && enabled && shopperHasInteracted.current) setPlaying(true);
                    adminEnabledRef.current = enabled;
                    setAdminEnabled(enabled);
                    setTracks(Array.isArray(data) ? data : []);
                    setCurrentIndex((current) => Math.min(current, Math.max(0, (Array.isArray(data) ? data.length : 0) - 1)));
                    if (!enabled) {
                        audioRef.current?.pause();
                        setPlaying(false);
                    }
                }
            } catch { /* Keep the last known playlist during a temporary network issue. */ }
        }

        void loadStorefrontMusic();
        interval = setInterval(() => { void loadStorefrontMusic(); }, 5000);
        return () => { cancelled = true; if (interval) clearInterval(interval); };
    }, []);

    // Keep the audio element in sync with the selected playlist item.
    // Playback is only attempted after the shopper has pressed Play once,
    // because browsers block unsolicited autoplay with sound.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack || !adminEnabled) return;

        audio.volume = volume;
        audio.src = currentTrack.file;
        audio.load();

        if (playing) {
            void audio.play().catch(() => setPlaying(false));
        }
    }, [currentTrack?.file, playing, volume, adminEnabled]);

    const nextTrack = useCallback(() => {
        if (!tracks.length) return;
        setCurrentIndex((index) => (index + 1) % tracks.length);
    }, [tracks.length]);

    const previousTrack = useCallback(() => {
        if (!tracks.length) return;
        setCurrentIndex((index) => (index - 1 + tracks.length) % tracks.length);
    }, [tracks.length]);

    function playCurrent() {
        const audio = audioRef.current;
        if (!audio || !currentTrack || !adminEnabled) return;

        shopperHasInteracted.current = true;
        audio.volume = volume;
        void audio.play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
    }

    function togglePlayback() {
        const audio = audioRef.current;
        if (!audio) return;

        if (audio.paused) {
            playCurrent();
        } else {
            audio.pause();
            setPlaying(false);
        }
    }

    function selectTrack(index: number) {
        setCurrentIndex(index);
        setPlaying(true);
    }

    if (!tracks.length || !adminEnabled) return null;

    return (
        <div className={visible ? "fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]" : "hidden"}>
            <audio
                ref={audioRef}
                preload="metadata"
                loop={tracks.length === 1}
                onEnded={nextTrack}
                onPlay={() => setPlaying(true)}
            />

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-3 p-3">
                    <button
                        type="button"
                        onClick={togglePlayback}
                        aria-label={playing ? 'Pause background music' : 'Play background music'}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white hover:bg-violet-700"
                    >
                        {playing ? 'Ⅱ' : '▶'}
                    </button>

                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">
                            Fussion sounds · Playlist repeat
                        </p>
                        <p className="truncate text-sm font-black text-slate-950">
                            {currentTrack?.title ?? 'No song selected'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                        aria-label="Open music playlist"
                    >
                        {tracks.length} songs
                    </button>
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                    <button
                        type="button"
                        onClick={previousTrack}
                        className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                        aria-label="Previous song"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        onClick={nextTrack}
                        className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                        aria-label="Next song"
                    >
                        ›
                    </button>
                    <span className="text-[10px] font-semibold text-slate-400">Volume</span>
                    <input
                        aria-label="Music volume"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(event) => setVolume(Number(event.target.value))}
                        className="min-w-0 flex-1 accent-violet-600"
                    />
                </div>

                {open && (
                    <div className="max-h-52 overflow-y-auto border-t border-slate-100 p-2">
                        {tracks.map((track, index) => (
                            <button
                                key={track.id}
                                type="button"
                                onClick={() => selectTrack(index)}
                                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs ${index === currentIndex ? 'bg-violet-50 text-violet-800' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                <span className="w-5 text-[10px] font-black">{index + 1}</span>
                                <span className="min-w-0 flex-1 truncate font-semibold">{track.title}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
