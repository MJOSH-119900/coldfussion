const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export function isValidProductImage(extension: string, bytes: Uint8Array) {
    const ext = extension.toLowerCase();
    const isJpeg = (ext === '.jpg' || ext === '.jpeg') &&
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = ext === '.png' && pngSignature.every((value, index) => bytes[index] === value);
    const isWebp = ext === '.webp' && text(bytes.subarray(0, 4)) === 'RIFF' && text(bytes.subarray(8, 12)) === 'WEBP';
    const signature = text(bytes.subarray(0, 6));
    const isGif = ext === '.gif' && (signature === 'GIF87a' || signature === 'GIF89a');
    const isAvif = ext === '.avif' && text(bytes.subarray(4, 12)).includes('ftypavif');
    return isJpeg || isPng || isWebp || isGif || isAvif;
}

export function productImageContentType(extension: string) {
    switch (extension.toLowerCase()) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.avif': return 'image/avif';
        default: return 'application/octet-stream';
    }
}
