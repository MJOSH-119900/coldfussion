import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasValidCronSecret(request: Request, expectedSecret: string) {
  const authorization = request.headers.get('authorization') || '';
  const suppliedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const supplied = Buffer.from(suppliedSecret);
  const expected = Buffer.from(expectedSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || expectedSecret.length < 32) {
    console.error('CRON_SECRET must be set to a random value of at least 32 characters.');
    return NextResponse.json({ error: 'Cron endpoint is not configured.' }, { status: 503 });
  }
  if (!hasValidCronSecret(request, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Database activity ping failed:', error);
    return NextResponse.json({ error: 'Database ping failed.' }, { status: 503 });
  }
}
