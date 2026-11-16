'use server';

import fs from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { Product } from '../../(public)/components/types/store';

const PRODUCTS_FILE = path.resolve('./app/(public)/components/data/products.json');
const UPLOAD_DIR = path.resolve('./public/uploads');
const VENDORS_FILE = path.resolve('./app/(public)/components/data/vendors.json');
const USERS_AUTH_FILE = path.resolve('./app/(public)/components/data/users_auth.json');
const REQUESTS_FILE = path.resolve('./app/(public)/components/data/vendor_requests.json');

// Helper to generate a secure random alphanumeric temporary password
function generateRandomPassword(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Action: Create and approve a vendor profile from the Admin UI Page
export async function createVendorFromRequestAction(requestId: string) {
  try {
    // 1. Read files
    const requestsData = await fs.readFile(REQUESTS_FILE, 'utf-8').catch(() => '[]');
    const vendorsData = await fs.readFile(VENDORS_FILE, 'utf-8').catch(() => '[]');
    const authData = await fs.readFile(USERS_AUTH_FILE, 'utf-8').catch(() => '{}');

    const requests: any[] = JSON.parse(requestsData);
    const vendors: any[] = JSON.parse(vendorsData);
    const authTable: Record<string, any> = JSON.parse(authData);

    // 2. Find the target request profile
    const targetRequest = requests.find(r => r.request_id === requestId);
    if (!targetRequest) throw new Error('Request not found in pool');

    const uniqueVendorId = `vendor-${Date.now()}`;
    const generatedPassword = generateRandomPassword();

    // 3. Create the vendor record profile
    const newVendorProfile = {
      vendor_id: uniqueVendorId,
      business_name: targetRequest.business_name,
      whatsapp_number: targetRequest.whatsapp_number,
      email: targetRequest.email.toLowerCase(),
      status: 'approved',
      created_at: new Date().toISOString()
    };

    // 4. Create the authentication profile wrapper
    authTable[targetRequest.email.toLowerCase()] = {
      role: 'vendor',
      vendor_id: uniqueVendorId,
      password: createHash('sha256').update(generatedPassword).digest('hex'), // Never store or return the plaintext password
      current_otp: null,
      otp_expires_at: null,
      status: 'active'
    };

    // 5. Append data and filter out the handled request queue item
    vendors.push(newVendorProfile);
    const remainingRequests = requests.filter(r => r.request_id !== requestId);

    // 6. Write changes back to the exact project path locations
    await fs.writeFile(VENDORS_FILE, JSON.stringify(vendors, null, 2), 'utf-8');
    await fs.writeFile(USERS_AUTH_FILE, JSON.stringify(authTable, null, 2), 'utf-8');
    await fs.writeFile(REQUESTS_FILE, JSON.stringify(remainingRequests, null, 2), 'utf-8');

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to provision vendor credentials:', error);
    return { success: false, error: error.message };
  }
}

async function readProductsFile(): Promise<Product[]> {
  try {
    const fileData = await fs.readFile(PRODUCTS_FILE, 'utf-8');
    return JSON.parse(fileData || '[]');
  } catch (error: any) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}


export async function saveProductAction(formData: FormData, vendorId: string, productId?: string) {
  const products = await readProductsFile();
  const existing = productId ? products.find(p => p.id === productId) : undefined;
  const uploadedFiles = formData.getAll('image_files').filter((value): value is File => value instanceof File && value.size > 0);
  const uploadedImages: string[] = [];

  if (uploadedFiles.length) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    for (const imageFile of uploadedFiles.slice(0, 7)) {
      const extension = path.extname(imageFile.name).toLowerCase() || '.jpg';
      const safeExtension = /^\.(jpg|jpeg|png|webp|gif|avif)$/.test(extension) ? extension : '.jpg';
      const fileName = `${vendorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExtension}`;
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await imageFile.arrayBuffer()));
      uploadedImages.push(`/uploads/${fileName}`);
    }
  }

  const images = (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 7);
  const availableQuantity = Math.max(0, Number(formData.get('available_quantity') || 0));
  const compareAtRaw = Number(formData.get('compare_at_price') || 0);
  const compareAt = compareAtRaw > Number(formData.get('price') || 0) ? compareAtRaw : undefined;

  const productData: Product = {
    id: productId || `prod-${Date.now()}`,
    vendor_id: existing?.vendor_id || vendorId,
    title: String(formData.get('title') || ''),
    description: String(formData.get('description') || ''),
    price: Number(formData.get('price') || 0),
    compare_at_price: compareAt,
    available_quantity: availableQuantity,
    is_available: formData.get('is_available') === 'true' && availableQuantity > 0,
    giveaway: formData.get('giveaway') === 'true',
    giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined,
    images,
    category: String(formData.get('category') || 'Other'),
    tags: String(formData.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    likes_count: existing?.likes_count || 0,
    vendor_whatsapp: String(formData.get('vendor_whatsapp') || ''),
    detail_gallery_enabled: formData.get('detail_gallery_enabled') === 'true',
    is_latest: formData.get('is_latest') === 'true',
    is_top_selling: formData.get('is_top_selling') === 'true',
  };

  const updatedProducts = productId
    ? products.map(p => p.id === productId ? productData : p)
    : [...products, productData];

  await fs.writeFile(PRODUCTS_FILE, JSON.stringify(updatedProducts, null, 2), 'utf-8');
  revalidatePath('/');
  revalidatePath('/admin');
  if (productId) revalidatePath(`/product/${productId}`);
  return { success: true, product: productData };
}

export async function deleteProductAction(id: string) {
  const products = await readProductsFile();
  const targetProduct = products.find(p => p.id === id);

  // Optional: Clean up disk storage when product is deleted
  if (targetProduct && targetProduct.images[0]?.startsWith('/uploads/')) {
    try {
      const absoluteImagePath = path.join(path.resolve('./public'), targetProduct.images[0]);
      await fs.unlink(absoluteImagePath);
    } catch (e) {
      console.log('File already deleted or missing from disk storage');
    }
  }

  const filtered = products.filter(p => p.id !== id);
  await fs.writeFile(PRODUCTS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  revalidatePath('/');
  revalidatePath('/admin');
  return { success: true };
}
