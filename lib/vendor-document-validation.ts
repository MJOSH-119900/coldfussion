import path from 'path';
import { MAX_VENDOR_DOCUMENT_BYTES } from '../server/storage';

export type VendorDocumentFile = {
    bytes: Buffer;
    contentType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
    extension: string;
};

export async function validateVendorDocumentFile(value: FormDataEntryValue | null): Promise<VendorDocumentFile> {
    if (!(value instanceof File) || value.size === 0) throw new Error('Choose a verification document and payment receipt.');
    if (value.size > MAX_VENDOR_DOCUMENT_BYTES) throw new Error('Each verification document and payment receipt must be 1 MB or smaller.');
    const bytes = Buffer.from(await value.arrayBuffer());
    const extension = path.extname(value.name).toLowerCase();
    const isPdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (isPdf && extension === '.pdf') return { bytes, contentType: 'application/pdf', extension };
    if (isJpeg && ['.jpg', '.jpeg'].includes(extension)) return { bytes, contentType: 'image/jpeg', extension };
    if (isPng && extension === '.png') return { bytes, contentType: 'image/png', extension };
    if (isWebp && extension === '.webp') return { bytes, contentType: 'image/webp', extension };
    throw new Error('Use a valid PDF, JPG, PNG, or WEBP document.');
}
