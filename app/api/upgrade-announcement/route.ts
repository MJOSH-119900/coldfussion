import { NextResponse } from 'next/server';
import { getUpgradeAnnouncement } from '../../../lib/announcements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const announcement = await getUpgradeAnnouncement();
    return NextResponse.json(announcement.enabled ? announcement : null, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
