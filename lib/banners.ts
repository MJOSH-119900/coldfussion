import path from 'path';
import { uploadStoreAsset, deleteStoreAsset, deleteStoreAssetIfUnused } from '../server/storage';
import type { BannerIntervalUnit, BannerSettings, BannerSlide } from '../app/(public)/components/types/store';
import { nextId, readJson, updateJson } from './json-store';

const DEFAULT_SETTINGS: BannerSettings = {
    slides: [],
    intervalValue: 5,
    intervalUnit: 'seconds',
};


export async function getBannerSettings(): Promise<BannerSettings> {
    const settings = await readJson<Record<string, unknown>>('site_settings.json', {});
    const slides = Array.isArray(settings.banner_slides)
        ? settings.banner_slides.filter((slide): slide is BannerSlide => {
            if (!slide || typeof slide !== 'object') return false;
            const item = slide as Record<string, unknown>;
            return ['id', 'title', 'description', 'image', 'button_label', 'button_url']
                .every(key => typeof item[key] === 'string');
        })
        : DEFAULT_SETTINGS.slides;
    const intervalValue = Number(settings.banner_interval_value);
    const intervalUnit = settings.banner_interval_unit;
    const multiplier = intervalUnit === 'days' ? 86400 : intervalUnit === 'hours' ? 3600 : 1;
    return {
        slides,
        intervalValue: Number.isInteger(intervalValue) && intervalValue > 0 && intervalValue * multiplier <= 365 * 86400
            ? intervalValue
            : DEFAULT_SETTINGS.intervalValue,
        intervalUnit: intervalUnit === 'hours' || intervalUnit === 'days' || intervalUnit === 'seconds'
            ? intervalUnit
            : DEFAULT_SETTINGS.intervalUnit,
    };
}

export async function saveBanner(
    input: Omit<BannerSlide, 'id' | 'image'> & { id?: string; image?: string; file?: File },
): Promise<BannerSlide> {
    const title = input.title.trim();
    if (!title) throw new Error('Enter a banner heading.');
    if (title.length > 120 || input.description.length > 300 || input.button_label.length > 40 || input.button_url.length > 500) {
        throw new Error('One or more banner fields exceed the allowed length.');
    }
    if (input.button_url && !(
        input.button_url.startsWith('/') && !input.button_url.startsWith('//')
        || input.button_url.startsWith('#')
        || /^https?:\/\/\S+$/i.test(input.button_url)
    )) {
        throw new Error('Use a relative link or a full HTTP/HTTPS URL for the banner button.');
    }

    const settings = await getBannerSettings();
    const existing = input.id ? settings.slides.find(slide => slide.id === input.id) : undefined;
    if (input.id && !existing) throw new Error('Banner not found.');

    let image = existing?.image || '';
    let uploadedPath = '';
    if (input.file && input.file.size > 0) {
        if (input.file.size > 12 * 1024 * 1024) throw new Error('Banner images must be 12 MB or smaller.');
        const extension = path.extname(input.file.name).toLowerCase();
        const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
        if (!allowed.has(extension)) throw new Error('Use a JPG, PNG, WEBP, GIF or AVIF banner image.');

        const bytes = Buffer.from(await input.file.arrayBuffer());
        const isJpeg = (extension === '.jpg' || extension === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const isPng = extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isWebp = extension === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
        const isGif = extension === '.gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
        const isAvif = extension === '.avif' && bytes.subarray(4, 12).toString().includes('ftypavif');
        if (!(isJpeg || isPng || isWebp || isGif || isAvif)) {
            throw new Error('The selected file is not a valid image matching its extension.');
        }

        const fileName = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
        uploadedPath = await uploadStoreAsset(`banners/${fileName}`, bytes, input.file.type || 'application/octet-stream');
        image = uploadedPath;
    }

    if (!image) throw new Error('Choose an image for this banner.');
    const slide: BannerSlide = {
        id: existing?.id || await nextId('BAN', 4, 'banner'),
        title,
        description: input.description.trim(),
        image,
        button_label: input.button_label.trim(),
        button_url: input.button_url.trim(),
    };
    try {
        await updateJson<Record<string, unknown>>('site_settings.json', current => {
            const currentSlides = Array.isArray(current.banner_slides) ? current.banner_slides as BannerSlide[] : [];
            return {
                ...current,
                banner_slides: existing
                    ? currentSlides.map(item => item.id === existing.id ? slide : item)
                    : [...currentSlides, slide],
            };
        }, {});
    } catch (error) {
        if (uploadedPath) await deleteStoreAsset(uploadedPath);
        throw error;
    }

    if (existing && existing.image !== image && existing.image.startsWith('/uploads/banners/')) {
        await deleteStoreAssetIfUnused(existing.image);
    }
    return slide;
}

export async function removeBanner(id: string): Promise<void> {
    const settings = await getBannerSettings();
    const target = settings.slides.find(slide => slide.id === id);
    if (!target) throw new Error('Banner not found.');

    await updateJson<Record<string, unknown>>('site_settings.json', current => {
        const currentSlides = Array.isArray(current.banner_slides) ? current.banner_slides as BannerSlide[] : [];
        return { ...current, banner_slides: currentSlides.filter(slide => slide.id !== id) };
    }, {});

    if (target.image.startsWith('/uploads/banners/')) {
        await deleteStoreAssetIfUnused(target.image);
    }
}

export async function saveBannerInterval(value: number, unit: BannerIntervalUnit): Promise<BannerSettings> {
    if (unit !== 'seconds' && unit !== 'hours' && unit !== 'days') {
        throw new Error('Choose seconds, hours, or days as the rotation unit.');
    }
    const multiplier = unit === 'days' ? 86400 : unit === 'hours' ? 3600 : 1;
    if (!Number.isInteger(value) || value < 1 || value * multiplier > 365 * 86400) {
        throw new Error('Choose a rotation interval between 1 second and 365 days.');
    }
    await updateJson<Record<string, unknown>>('site_settings.json', current => ({
        ...current,
        banner_interval_value: value,
        banner_interval_unit: unit,
    }), {});
    return getBannerSettings();
}
