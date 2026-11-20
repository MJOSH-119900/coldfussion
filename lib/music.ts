import path from 'path';
import { uploadStoreAsset, deleteStoreAsset, deleteStoreAssetIfUnused } from '../server/storage';
import { createSupabaseAdminClient } from '../server/supabase-admin';
import { nextId, readJson, writeJson } from './json-store';

export interface MusicTrack {
    id: string;
    title: string;
    file: string;
    created_at: string;
}

export const MAX_MUSIC_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_MUSIC_LIBRARY_BYTES = 10 * 1024 * 1024;

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
        throw new Error('Audio files must be 10 MB or smaller.');
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
    await pruneUnusedMusicAssets();
    const storage = createSupabaseAdminClient().storage.from('store-assets');
    let totalBytes = 0;
    for (let offset = 0; ; offset += 100) {
        const { data, error } = await storage.list('music', { limit: 100, offset });
        if (error) throw new Error(`Could not check the music storage limit: ${error.message}`);
        for (const item of data ?? []) totalBytes += Number(item.metadata?.size ?? 0);
        if (!data || data.length < 100) break;
    }
    if (totalBytes + file.size > MAX_MUSIC_LIBRARY_BYTES) {
        const remaining = Math.max(0, MAX_MUSIC_LIBRARY_BYTES - totalBytes);
        throw new Error(`The music library is limited to 10 MB total. It currently uses ${(totalBytes / 1024 / 1024).toFixed(2)} MB, leaving ${(remaining / 1024 / 1024).toFixed(2)} MB.`);
    }

    const id = await nextId('MUS', 4, 'musicTrack');
    const fileName = `${id}-${Date.now()}${extension}`;

    const storagePath = await uploadStoreAsset(`music/${fileName}`, bytes, file.type || 'application/octet-stream', MAX_MUSIC_FILE_SIZE);

    const track: MusicTrack = {
        id,
        title: cleanTitle,
        file: storagePath,
        created_at: new Date().toISOString(),
    };

    const tracks = await getMusicTracks();
    try {
        await writeJson('music.json', [...tracks, track]);
    } catch (error) {
        await deleteStoreAsset(storagePath);
        throw error;
    }
    return track;
}

export async function deleteMusicTrack(trackId: string): Promise<void> {
    const tracks = await getMusicTracks();
    const track = tracks.find((item) => item.id === trackId);

    if (!track) {
        throw new Error('Music track not found.');
    }

    await writeJson(
        'music.json',
        tracks.filter((item) => item.id !== trackId),
    );
    if (track.file.startsWith('/uploads/music/')) await deleteStoreAssetIfUnused(track.file);
    await pruneUnusedMusicAssets();
}

export async function pruneUnusedMusicAssets() {
    const referenced = new Set((await getMusicTracks()).map(track => track.file.replace(/^\/uploads\//, '')));
    const storage = createSupabaseAdminClient().storage.from('store-assets');
    const unused: string[] = [];
    for (let offset = 0; ; offset += 100) {
        const { data, error } = await storage.list('music', { limit: 100, offset });
        if (error) throw new Error(`Could not inspect music storage: ${error.message}`);
        unused.push(...(data ?? []).filter(item => item.id && !referenced.has(`music/${item.name}`)).map(item => `music/${item.name}`));
        if (!data || data.length < 100) break;
    }
    for (let index = 0; index < unused.length; index += 100) {
        const { error } = await storage.remove(unused.slice(index, index + 100));
        if (error) throw new Error(`Could not remove unused music files: ${error.message}`);
    }
}
