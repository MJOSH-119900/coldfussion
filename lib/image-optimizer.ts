'use client';

const MAX_OUTPUT_BYTES = 500 * 1024;
const MAX_EDGE = 1200;
const WEBP_QUALITY = 0.8;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Your browser could not convert this image.')),
    'image/webp', quality,
  ));
}

async function optimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image file.`);
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`Could not read ${file.name} as an image.`); });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare images for upload.');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasBlob(canvas, WEBP_QUALITY);
    if (blob.size > MAX_OUTPUT_BYTES)
      throw new Error(`${file.name} is still over 500 KB at 80% WebP quality. Choose a smaller image or crop it before uploading.`);
    const basename = file.name.replace(/\.[^.]+$/, '').slice(0, 90) || 'image';
    return new File([blob], `${basename}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/** Replaces selected input files with resized WebP files before form submission. */
export async function optimizeImageInput(input: HTMLInputElement): Promise<File[]> {
  const selected = Array.from(input.files ?? []);
  if (!selected.length) return [];
  const optimized = await Promise.all(selected.map(optimizeImage));
  const transfer = new DataTransfer();
  optimized.forEach(file => transfer.items.add(file));
  input.files = transfer.files;
  return optimized;
}
