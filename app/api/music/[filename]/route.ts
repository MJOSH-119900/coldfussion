import path from 'node:path';
import { NextResponse } from 'next/server';
import { getStoreAssetUrl } from '../../../../server/storage';

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (path.basename(filename) !== filename || !/\.(m4a|mp3|ogg|wav|webm)$/i.test(filename))
    return new Response('Not found', { status: 404 });
  return NextResponse.redirect(await getStoreAssetUrl(`music/${filename}`), 302);
}
