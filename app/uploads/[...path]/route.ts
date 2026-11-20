import { NextResponse } from 'next/server';
import { getStoreAssetUrl } from '../../../server/storage';

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.length || path.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\\')))
    return new Response('Not found', { status: 404 });
  try {
    return NextResponse.redirect(await getStoreAssetUrl(path.join('/')), 302);
  } catch {
    return new Response('Asset unavailable', { status: 404 });
  }
}
