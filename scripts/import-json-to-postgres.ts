import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJson, type JsonFileName } from '../lib/json-store';
import { prisma } from '../server/db';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const dataDir = path.resolve(process.env.FUSSION_DATA_DIR || './data');
const files: JsonFileName[] = [
    'vendors.json', 'vendor_requests.json', 'products.json', 'orders.json',
    'analytics.json', 'counters.json', 'likes.json', 'auth_otps.json', 'music.json',
    'music_settings.json', 'site_settings.json', 'customer_inquiries.json', 'product_feedback.json',
];

try {
    for (const file of files) {
        const value: unknown = JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
        if (!Array.isArray(value) && (!value || typeof value !== 'object'))
            throw new Error(`${file} must contain a JSON object or array.`);
        await writeJson(file, value);
        console.log(`${file}: imported ${Array.isArray(value) ? `${value.length} records` : 'document'}`);
    }
} finally {
    await prisma.$disconnect();
}
