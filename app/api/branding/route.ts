import { NextResponse } from 'next/server';
import { getBrandSettings } from '../../../lib/branding';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    const brand = await getBrandSettings();
    return NextResponse.json(brand, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
    });
}
