import { NextResponse } from 'next/server';
import { getMusicTracks, getMusicSettings } from '../../../lib/music';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const [tracks, settings] = await Promise.all([getMusicTracks(), getMusicSettings()]);
    return NextResponse.json({ tracks, enabled: settings.enabled, updated_at: settings.updated_at }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', Pragma: 'no-cache', Expires: '0' },
    });
}
