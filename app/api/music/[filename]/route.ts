import fs from 'node:fs/promises';
import path from 'node:path';
import { MUSIC_UPLOAD_DIR } from '../../../../lib/music';

const contentTypes: Record<string, string> = {
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
};

function rangeNotSatisfiable(size: number) {
    return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
    });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return body;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> },
) {
    const { filename } = await params;
    const extension = path.extname(filename).toLowerCase();
    const contentType = contentTypes[extension];

    if (!contentType || path.basename(filename) !== filename) {
        return new Response('Not found', { status: 404 });
    }

    let file: Buffer;
    try {
        file = await fs.readFile(path.join(MUSIC_UPLOAD_DIR, filename));
    } catch {
        return new Response('Not found', { status: 404 });
    }

    const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': contentType,
    });
    const range = request.headers.get('range');

    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
            return rangeNotSatisfiable(file.length);
        }

        const start = match[1]
            ? Number(match[1])
            : Math.max(file.length - Number(match[2]), 0);
        const end = match[2] && match[1]
            ? Number(match[2])
            : file.length - 1;

        if (start > end || start >= file.length) {
            return rangeNotSatisfiable(file.length);
        }

        const chunk = file.subarray(start, end + 1);
        headers.set('Content-Length', String(chunk.length));
        headers.set('Content-Range', `bytes ${start}-${start + chunk.length - 1}/${file.length}`);
        return new Response(toArrayBuffer(chunk), { status: 206, headers });
    }

    headers.set('Content-Length', String(file.length));
    return new Response(toArrayBuffer(file), { headers });
}