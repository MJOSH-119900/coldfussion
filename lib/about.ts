import fs from 'fs/promises';
import path from 'path';
import type { OwnerAbout } from '../app/(public)/components/types/store';
import { readJson, updateJson } from './json-store';

const ABOUT_UPLOAD_DIR = path.resolve('./public/uploads/about');
const ABOUT_IMAGE_PREFIX = '/uploads/about/';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEMO_ABOUT: OwnerAbout = {
    name: 'Your name',
    title: 'Founder & Curator',
    story: 'This is a demo story. Share why you started your store, what inspires your collections, and what you hope shoppers will discover. Replace this sample with your own story from Admin → About.',
    hobbies: ['Discovering new ideas', 'Connecting with people', 'Curating great finds'],
    image: '',
    isDemo: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validAboutImage(file: File, bytes: Buffer) {
    const extension = path.extname(file.name).toLowerCase();
    const isJpeg = (extension === '.jpg' || extension === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = extension === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    return isJpeg || isPng || isWebp;
}

function cleanupPreviousImage(image: string, nextImage: string) {
    if (!image.startsWith(ABOUT_IMAGE_PREFIX) || image === nextImage)
        return;
    const fileName = image.slice(ABOUT_IMAGE_PREFIX.length);
    if (fileName && path.basename(fileName) === fileName)
        return fs.rm(path.join(ABOUT_UPLOAD_DIR, fileName), { force: true });
}

export async function getOwnerAbout(): Promise<OwnerAbout> {
    const settings = await readJson<Record<string, unknown>>('site_settings.json', {});
    const profile = settings.owner_about;
    if (!isRecord(profile))
        return { ...DEMO_ABOUT };

    const storedImage = typeof profile.image === 'string' && profile.image.startsWith(ABOUT_IMAGE_PREFIX)
        ? profile.image.slice(ABOUT_IMAGE_PREFIX.length)
        : '';
    return {
        name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : DEMO_ABOUT.name,
        title: typeof profile.title === 'string' ? profile.title.trim() : DEMO_ABOUT.title,
        story: typeof profile.story === 'string' && profile.story.trim() ? profile.story.trim() : DEMO_ABOUT.story,
        hobbies: Array.isArray(profile.hobbies)
            ? profile.hobbies.filter((hobby): hobby is string => typeof hobby === 'string' && Boolean(hobby.trim())).slice(0, 8)
            : [...DEMO_ABOUT.hobbies],
        image: storedImage && path.basename(storedImage) === storedImage ? `${ABOUT_IMAGE_PREFIX}${storedImage}` : '',
    };
}

export async function saveOwnerAbout(formData: FormData): Promise<OwnerAbout> {
    const name = String(formData.get('name') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const story = String(formData.get('story') || '').trim();
    const hobbies = String(formData.get('hobbies') || '')
        .split(/\r?\n|,/)
        .map(hobby => hobby.trim())
        .filter(Boolean);

    if (!name || name.length > 80)
        throw new Error('Enter your name using no more than 80 characters.');
    if (title.length > 80)
        throw new Error('Keep your title or tagline to 80 characters or fewer.');
    if (!story || story.length > 3000)
        throw new Error('Add your story using no more than 3,000 characters.');
    if (hobbies.length > 8 || hobbies.some(hobby => hobby.length > 50))
        throw new Error('Add up to 8 interests or hobbies, each 50 characters or fewer.');

    const current = await getOwnerAbout();
    const file = formData.get('image_file');
    let image = formData.get('remove_image') === 'true' ? '' : current.image;
    let uploadedImage = '';

    if (file instanceof File && file.size > 0) {
        if (file.size > MAX_IMAGE_BYTES)
            throw new Error('Profile images must be 8 MB or smaller.');
        const bytes = Buffer.from(await file.arrayBuffer());
        if (!validAboutImage(file, bytes))
            throw new Error('Use a valid JPG, PNG or WEBP profile image.');

        await fs.mkdir(ABOUT_UPLOAD_DIR, { recursive: true });
        const extension = path.extname(file.name).toLowerCase();
        const fileName = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
        await fs.writeFile(path.join(ABOUT_UPLOAD_DIR, fileName), bytes);
        uploadedImage = `${ABOUT_IMAGE_PREFIX}${fileName}`;
        image = uploadedImage;
    }

    const profile: OwnerAbout = { name, title, story, hobbies, image };
    try {
        await updateJson<Record<string, unknown>>('site_settings.json', settings => ({
            ...settings,
            owner_about: profile,
        }), {});
    } catch (error) {
        if (uploadedImage)
            await fs.rm(path.join(ABOUT_UPLOAD_DIR, uploadedImage.slice(ABOUT_IMAGE_PREFIX.length)), { force: true });
        throw error;
    }

    await cleanupPreviousImage(current.image, image);
    return profile;
}
