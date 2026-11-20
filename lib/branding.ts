import path from 'path';
import { uploadStoreAsset, deleteStoreAsset, deleteStoreAssetIfUnused } from '../server/storage';
import type { BrandSettings } from '../app/(public)/components/types/store';
import { readJson, updateJson } from './json-store';

const DEFAULT_BRAND: BrandSettings = { companyName: 'Fussion', logo: '' };

export async function getBrandSettings(): Promise<BrandSettings> {
    const settings = await readJson<Record<string, unknown>>('site_settings.json', {});
    return {
        companyName: typeof settings.company_name === 'string' && settings.company_name.trim()
            ? settings.company_name.trim()
            : DEFAULT_BRAND.companyName,
        logo: typeof settings.company_logo === 'string' && settings.company_logo.startsWith('/uploads/branding/')
            ? settings.company_logo
            : DEFAULT_BRAND.logo,
    };
}

export async function saveBrandSettings(companyName: string, file?: File, removeLogo = false): Promise<BrandSettings> {
    const normalizedName = companyName.trim();
    if (!normalizedName || normalizedName.length > 60) {
        throw new Error('Company name must be between 1 and 60 characters.');
    }

    const current = await getBrandSettings();
    let logo = removeLogo ? '' : current.logo;
    let uploadedLogo = '';

    if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Logo images must be 5 MB or smaller.');
        const extension = path.extname(file.name).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
            throw new Error('Use a JPG, PNG or WEBP logo image.');
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const isJpeg = (extension === '.jpg' || extension === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isPng = extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isWebp = extension === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
        if (!(isJpeg || isPng || isWebp)) throw new Error('The selected file is not a valid JPG, PNG or WEBP image.');

        const fileName = `company-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
        uploadedLogo = await uploadStoreAsset(`branding/${fileName}`, bytes, file.type || 'application/octet-stream');
        logo = uploadedLogo;
    }

    try {
        await updateJson<Record<string, unknown>>('site_settings.json', settings => ({
            ...settings,
            company_name: normalizedName,
            company_logo: logo,
        }), {});
    } catch (error) {
        if (uploadedLogo) await deleteStoreAsset(uploadedLogo);
        throw error;
    }

    if (current.logo && current.logo !== logo) {
        const previousFileName = current.logo.slice('/uploads/branding/'.length);
        if (previousFileName && path.basename(previousFileName) === previousFileName) {
            await deleteStoreAssetIfUnused(`branding/${previousFileName}`);
        }
    }

    return { companyName: normalizedName, logo };
}
