import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { readJson, writeJson, type JsonFileName } from './json-store';

const DATA_FILES: JsonFileName[] = [
    'vendors.json',
    'vendor_requests.json',
    'products.json',
    'orders.json',
    'analytics.json',
    'counters.json',
    'likes.json',
    'music.json',
    'music_settings.json',
    'site_settings.json',
    'customer_inquiries.json',
    'product_feedback.json',
];
const OPTIONAL_LEGACY_DATA_FILES: JsonFileName[] = ['customer_inquiries.json', 'product_feedback.json'];
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ENTRY_BYTES = 75 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5000;
const UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp3', '.m4a', '.ogg', '.wav', '.webm']);
const UPLOAD_ROOT = path.resolve('./public/uploads');
const PUBLIC_ROOT = path.resolve('./public');

type ManifestFile = { path: string; size: number; sha256: string };
type BackupManifest = {
    format: 'fussion-store-backup';
    version: 1;
    createdAt: string;
    files: ManifestFile[];
};
type RestoreFile = { bytes: Uint8Array; jsonValue?: unknown };

export class InvalidAdminBackupError extends Error {}

function sha256(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidUploadPath(name: string) {
    if (!name.startsWith('uploads/') || name.includes('\\') || name.includes('\0') || name.includes(':'))
        return false;
    const segments = name.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.')))
        return false;
    return UPLOAD_EXTENSIONS.has(path.posix.extname(name).toLowerCase());
}

function isValidArchivePath(name: string) {
    if (name === 'manifest.json')
        return true;
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.includes(':'))
        return false;
    if (name.startsWith('data/'))
        return DATA_FILES.includes(name.slice('data/'.length) as JsonFileName) || name === 'data/users_auth.json';
    return isValidUploadPath(name);
}

async function collectUploads(directory: string, prefix = ''): Promise<Array<{ name: string; bytes: Uint8Array }>> {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return [];
        throw error;
    }

    const files: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.'))
            continue;
        const absolute = path.join(directory, entry.name);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...await collectUploads(absolute, relative));
            continue;
        }
        if (!entry.isFile())
            continue;
        const archiveName = `uploads/${relative.split(path.sep).join('/')}`;
        if (!isValidUploadPath(archiveName))
            throw new Error(`Unsupported file in uploads: ${relative}`);
        const bytes = new Uint8Array(await fs.readFile(absolute));
        if (bytes.byteLength > MAX_ENTRY_BYTES)
            throw new Error(`Upload exceeds the backup limit: ${relative}`);
        files.push({ name: archiveName, bytes });
    }
    return files;
}

export async function createAdminBackup() {
    const entries: Zippable = {};
    const manifestFiles: ManifestFile[] = [];
    let totalBytes = 0;
    const addFile = (name: string, bytes: Uint8Array) => {
        totalBytes += bytes.byteLength;
        if (bytes.byteLength > MAX_ENTRY_BYTES || totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
            throw new Error('Backup exceeds the supported size limit.');
        entries[name] = bytes;
        manifestFiles.push({ path: name, size: bytes.byteLength, sha256: sha256(bytes) });
    };

    for (const name of DATA_FILES) {
        const value = await readJson<unknown>(name);
        const contents = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
        const bytes = new Uint8Array(contents);
        parseDataFile(name, bytes);
        addFile(`data/${name}`, bytes);
    }
    for (const file of await collectUploads(UPLOAD_ROOT))
        addFile(file.name, file.bytes);

    const manifest: BackupManifest = {
        format: 'fussion-store-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        files: manifestFiles,
    };
    entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    const archive = zipSync(entries, { level: 6 });
    if (archive.byteLength > MAX_ARCHIVE_BYTES)
        throw new Error('Backup exceeds 100 MB. Reduce stored uploads before downloading a backup.');
    return archive;
}

function parseDataFile(name: string, bytes: Uint8Array): unknown {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        throw new InvalidAdminBackupError(`Backup contains invalid JSON: ${name}`);
    }

    if (name === 'counters.json' || name === 'music_settings.json' || name === 'site_settings.json') {
        if (!isRecord(value))
            throw new InvalidAdminBackupError(`Backup contains invalid data: ${name}`);
    }
    else if (name === 'users_auth.json') {
        if (!isRecord(value))
            throw new InvalidAdminBackupError('Backup contains invalid legacy account data.');
    }
    else if (!Array.isArray(value)) {
        throw new InvalidAdminBackupError(`Backup contains invalid data: ${name}`);
    }

    return value;
}

function parseManifest(bytes: Uint8Array, fileNames: Set<string>): BackupManifest {
    let manifest: unknown;
    try {
        manifest = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        throw new InvalidAdminBackupError('Backup manifest is invalid.');
    }
    if (!isRecord(manifest) || manifest.format !== 'fussion-store-backup' ||
        manifest.version !== 1 || !Array.isArray(manifest.files)) {
        throw new InvalidAdminBackupError('This backup format is not supported.');
    }

    const declaredFiles = new Set<string>();
    for (const item of manifest.files) {
        if (!isRecord(item) || typeof item.path !== 'string' ||
            typeof item.size !== 'number' || !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(item.sha256) || declaredFiles.has(item.path)) {
            throw new InvalidAdminBackupError('Backup manifest contains invalid file information.');
        }
        declaredFiles.add(item.path);
    }
    const actualFiles = new Set([...fileNames].filter(name => name !== 'manifest.json'));
    if (declaredFiles.size !== actualFiles.size ||
        [...declaredFiles].some(name => !actualFiles.has(name))) {
        throw new InvalidAdminBackupError('Backup manifest does not match the archive contents.');
    }

    const requiredData = DATA_FILES
        .filter(name => !OPTIONAL_LEGACY_DATA_FILES.includes(name))
        .map(name => `data/${name}`);
    if (requiredData.some(name => !actualFiles.has(name)))
        throw new InvalidAdminBackupError('Backup is missing required store data.');
    return manifest as BackupManifest;
}

async function snapshotJsonFile(name: JsonFileName): Promise<{ exists: boolean; value?: unknown }> {
    return { exists: true, value: await readJson<unknown>(name) };
}

export async function restoreAdminBackup(archive: Uint8Array) {
    if (!archive.byteLength || archive.byteLength > MAX_ARCHIVE_BYTES)
        throw new InvalidAdminBackupError('Backup must be smaller than 100 MB.');

    let totalUncompressedBytes = 0;
    const inspectedNames = new Set<string>();
    let unzipped: ReturnType<typeof unzipSync>;
    try {
        unzipped = unzipSync(archive, {
            filter: file => {
                if (!isValidArchivePath(file.name) || file.name.length > 1024 || inspectedNames.has(file.name))
                    throw new InvalidAdminBackupError(`Backup contains an invalid or duplicate path: ${file.name}`);
                if (file.compression !== 0 && file.compression !== 8)
                    throw new InvalidAdminBackupError('Backup uses an unsupported compression method.');
                if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0 || file.originalSize > MAX_ENTRY_BYTES)
                    throw new InvalidAdminBackupError('Backup contains a file larger than the restore limit.');
                if (inspectedNames.size >= MAX_ARCHIVE_ENTRIES)
                    throw new InvalidAdminBackupError('Backup contains too many files.');
                totalUncompressedBytes += file.originalSize;
                if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
                    throw new InvalidAdminBackupError('Backup expands beyond the supported size limit.');
                inspectedNames.add(file.name);
                return true;
            },
        });
    }
    catch (error) {
        if (error instanceof InvalidAdminBackupError)
            throw error;
        throw new InvalidAdminBackupError('Could not read the backup archive.');
    }

    if (inspectedNames.size !== Object.keys(unzipped).length || !unzipped['manifest.json'])
        throw new InvalidAdminBackupError('Backup archive is incomplete.');
    const manifest = parseManifest(unzipped['manifest.json'], inspectedNames);
    const manifestByPath = new Map(manifest.files.map(file => [file.path, file]));
    const restoredFiles = new Map<string, RestoreFile>();
    for (const [name, bytes] of Object.entries(unzipped)) {
        if (name === 'manifest.json')
            continue;
        const declaration = manifestByPath.get(name);
        if (!declaration || declaration.size !== bytes.byteLength || declaration.sha256 !== sha256(bytes))
            throw new InvalidAdminBackupError(`Backup integrity check failed for ${name}.`);
        restoredFiles.set(name, {
            bytes,
            ...(name.startsWith('data/') ? { jsonValue: parseDataFile(name.slice('data/'.length), bytes) } : {}),
        });
    }
    const originalData = new Map<JsonFileName, { exists: boolean; value?: unknown }>();
    for (const name of [...DATA_FILES, 'auth_otps.json'] as JsonFileName[])
        originalData.set(name, await snapshotJsonFile(name));

    const restoreId = randomUUID();
    const stagedUploads = path.join(PUBLIC_ROOT, `.uploads-restore-${restoreId}`);
    const previousUploads = path.join(PUBLIC_ROOT, `.uploads-previous-${restoreId}`);
    const uploadsPath = UPLOAD_ROOT;
    const writtenData = new Set<JsonFileName>();
    let previousUploadsMoved = false;
    let stagedUploadsMoved = false;

    try {
        await fs.mkdir(stagedUploads, { recursive: true });
        for (const [name, file] of restoredFiles) {
            if (!name.startsWith('uploads/'))
                continue;
            const relativeParts = name.slice('uploads/'.length).split('/');
            const target = path.join(stagedUploads, ...relativeParts);
            if (!target.startsWith(`${stagedUploads}${path.sep}`))
                throw new Error('Backup contains an unsafe upload path.');
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, file.bytes, { flag: 'wx' });
        }

        for (const name of DATA_FILES) {
            writtenData.add(name);
            const restored = restoredFiles.get(`data/${name}`);
            await writeJson(name, restored?.jsonValue ?? [], true);
        }
        writtenData.add('auth_otps.json');
        await writeJson('auth_otps.json', [], true);

        try {
            await fs.rename(uploadsPath, previousUploads);
            previousUploadsMoved = true;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
        await fs.rename(stagedUploads, uploadsPath);
        stagedUploadsMoved = true;
    }
    catch (error) {
        if (stagedUploadsMoved)
            await fs.rm(uploadsPath, { recursive: true, force: true });
        if (previousUploadsMoved)
            await fs.rename(previousUploads, uploadsPath);
        await fs.rm(stagedUploads, { recursive: true, force: true });

        const rollbackErrors: string[] = [];
        for (const name of [...writtenData].reverse()) {
            try {
                const original = originalData.get(name)!;
                await writeJson(name, original.value, false);
            }
            catch (rollbackError) {
                rollbackErrors.push(`${name}: ${rollbackError instanceof Error ? rollbackError.message : 'rollback failed'}`);
            }
        }
        if (rollbackErrors.length)
            throw new Error(`Restore failed and rollback was incomplete (${rollbackErrors.join('; ')}).`);
        throw new Error(error instanceof Error ? error.message : 'Backup restore failed.');
    }

    if (previousUploadsMoved)
        await fs.rm(previousUploads, { recursive: true, force: true });
    return { dataFiles: DATA_FILES.length, uploadFiles: [...restoredFiles.keys()].filter(name => name.startsWith('uploads/')).length };
}
