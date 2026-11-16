import fs from 'fs/promises';
import path from 'path';
import { nextId, readJson, writeJson } from './json-store';

export interface MusicTrack {
    id: string;
    title: string;
    file: string;
    created_at: string;
}

export const MUSIC_UPLOAD_DIR = path.resolve('./public/uploads/music');
export const MAX_MUSIC_FILE_SIZE = 50 * 1024 * 1024;

export interface MusicSettings { enabled: boolean; updated_at: string | null }

export async function getMusicSettings(): Promise<MusicSettings> {
    const settings = await readJson<MusicSettings>('music_settings.json', { enabled: true, updated_at: null });
    return { enabled: settings.enabled !== false, updated_at: settings.updated_at || null };
}

export async function setMusicEnabled(enabled: boolean): Promise<MusicSettings> {
    const settings = { enabled, updated_at: new Date().toISOString() };
    await writeJson('music_settings.json', settings);
    return settings;
}


export async function getMusicTracks(): Promise<MusicTrack[]> {
    return readJson<MusicTrack[]>('music.json', []);
}

export async function saveMusicTrack(file: File, title: string): Promise<MusicTrack> {
    if (!file || file.size === 0) {
        throw new Error('Choose an audio file.');
    }

    if (file.size > MAX_MUSIC_FILE_SIZE) {
        throw new Error('Audio files must be 50 MB or smaller.');
    }

    const extension = path.extname(file.name).toLowerCase();
    const allowed = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.webm']);

    if (!allowed.has(extension)) {
        throw new Error('Unsupported audio file. Upload an MP3 (.mp3), M4A (.m4a), OGG (.ogg), WAV (.wav) or WebM audio (.webm).');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const isMp3 = extension === '.mp3' && (bytes.subarray(0, 3).toString() === 'ID3' || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    const isM4a = extension === '.m4a' && bytes.subarray(4, 8).toString() === 'ftyp';
    const isOgg = extension === '.ogg' && bytes.subarray(0, 4).toString() === 'OggS';
    const isWav = extension === '.wav' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
    const isWebm = extension === '.webm' && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!(isMp3 || isM4a || isOgg || isWav || isWebm)) {
        throw new Error('The selected file does not appear to be a valid audio file matching its extension. Please choose a genuine MP3, M4A, OGG, WAV or WebM audio file.');
    }

    const cleanTitle = title.trim() || path.basename(file.name, extension);
    const id = await nextId('MUS', 4, 'musicTrack');
    const fileName = `${id}-${Date.now()}${extension}`;

    await fs.mkdir(MUSIC_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(
        path.join(MUSIC_UPLOAD_DIR, fileName),
        bytes,
    );

    const track: MusicTrack = {
        id,
        title: cleanTitle,
        file: `/uploads/music/${fileName}`,
        created_at: new Date().toISOString(),
    };

    const tracks = await getMusicTracks();
    await writeJson('music.json', [...tracks, track]);
    return track;
}

export async function deleteMusicTrack(trackId: string): Promise<void> {
    const tracks = await getMusicTracks();
    const track = tracks.find((item) => item.id === trackId);

    if (!track) {
        throw new Error('Music track not found.');
    }

    if (track.file.startsWith('/uploads/music/')) {
        await fs.rm(path.join(path.resolve('./public'), track.file), {
            force: true,
        });
    }

    await writeJson(
        'music.json',
        tracks.filter((item) => item.id !== trackId),
    );
}
