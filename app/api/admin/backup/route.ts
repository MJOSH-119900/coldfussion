import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { createAdminBackup, InvalidAdminBackupError, restoreAdminBackup } from '../../../../lib/admin-backup';

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

async function isAdmin() {
    const session = await getSession();
    return session?.role === 'admin';
}

async function readBoundedBody(request: NextRequest) {
    const reader = request.body?.getReader();
    if (!reader)
        throw new InvalidAdminBackupError('No backup file was received.');

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > MAX_ARCHIVE_BYTES) {
            await reader.cancel();
            throw new InvalidAdminBackupError('Backup must be smaller than 100 MB.');
        }
        chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export async function GET() {
    if (!(await isAdmin()))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const archive = await createAdminBackup();
        const date = new Date().toISOString().slice(0, 10);
        return new NextResponse(Buffer.from(archive), {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="fussion-backup-${date}.zip"`,
                'Cache-Control': 'private, no-store',
            },
        });
    }
    catch (error) {
        console.error('Admin backup creation failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Backup could not be created.' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    if (!(await isAdmin()))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (request.headers.get('origin') !== request.nextUrl.origin)
        return NextResponse.json({ error: 'Cross-origin restore requests are not allowed.' }, { status: 403 });
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/zip')
        return NextResponse.json({ error: 'Upload a ZIP backup file.' }, { status: 415 });

    try {
        const archive = await readBoundedBody(request);
        const result = await restoreAdminBackup(archive);
        return NextResponse.json({ success: true, ...result });
    }
    catch (error) {
        const status = error instanceof InvalidAdminBackupError ? 400 : 500;
        console.error('Admin backup restore failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Backup restore failed.' },
            { status },
        );
    }
}
