'use client';

import { useState } from 'react';
import { Product } from '../../../(public)/components/types/store';
import { saveProductAction } from '../actions';

interface FormProps { currentVendorId: string; editProduct?: Product; onSuccess: (product: Product) => void; }

export default function ProductForm({ currentVendorId, editProduct, onSuccess }: FormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const result = await saveProductAction(formData, currentVendorId, editProduct?.id);
      if (!result.success) throw new Error(result.error || 'Could not save product');
      e.currentTarget.reset(); setSelectedCount(0); onSuccess(result.product as Product);
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not save product'); }
    finally { setLoading(false); }
  };

  return <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div><h2 className="text-xl font-bold text-slate-800">{editProduct ? 'Edit product' : 'Add a product'}</h2><p className="mt-1 text-xs text-slate-500">Manage pricing, availability, gallery placement and storefront announcements.</p></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product title</label><input required name="title" defaultValue={editProduct?.title} className="w-full rounded-lg border px-3 py-2" /></div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Selling price (₦)</label><input required min="0" type="number" name="price" defaultValue={editProduct?.price} className="w-full rounded-lg border px-3 py-2" /></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Previous price / slash price (₦)</label><input min="0" type="number" name="compare_at_price" defaultValue={editProduct?.compare_at_price ?? ''} placeholder="Optional" className="w-full rounded-lg border px-3 py-2" /></div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Category</label><input required name="category" defaultValue={editProduct?.category} placeholder="Tech, Fashion..." className="w-full rounded-lg border px-3 py-2" /></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Available quantity</label><input min="0" type="number" name="available_quantity" defaultValue={editProduct?.available_quantity ?? 0} className="w-full rounded-lg border px-3 py-2" /></div>
    </div>

    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Product photos (up to 7)</label>
      <p className="mb-3 text-xs text-slate-500">The first image is the main listing image.</p>
      <input type="file" name="image_files" accept="image/*" multiple onChange={e => setSelectedCount(e.target.files?.length || 0)} className="w-full text-sm" />
      <p className="mt-2 text-xs text-slate-500">{selectedCount ? `${selectedCount} new image(s) selected` : editProduct ? `${editProduct.images?.length || 0} current image(s)` : 'No images selected yet'}</p>
      {editProduct?.images?.length ? <div className="mt-3 flex flex-wrap gap-2">{editProduct.images.slice(0, 7).map((src, i) => <img key={`${src}-${i}`} src={src} alt={`Current product image ${i + 1}`} className="h-14 w-14 rounded-lg border object-cover" />)}</div> : null}
    </div>

    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-800">Availability & storefront</p>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_available" value="true" defaultChecked={editProduct?.is_available ?? true} /> Product available for enquiry/cart</label>
      <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="detail_gallery_enabled" value="true" defaultChecked={editProduct?.detail_gallery_enabled ?? false} /><span><strong>Enable product gallery</strong><span className="block text-xs text-slate-500">Show up to 7 photos on the detail page.</span></span></label>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_latest" value="true" defaultChecked={editProduct?.is_latest ?? false} /> Feature in Latest Drops</label>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_top_selling" value="true" defaultChecked={editProduct?.is_top_selling ?? false} /> Feature in Top Sellers</label>
      <label className="flex items-center gap-3 text-sm font-semibold text-emerald-700"><input type="checkbox" name="giveaway" value="true" defaultChecked={editProduct?.giveaway ?? false} /> Announce this item as a giveaway</label>
      <input name="giveaway_announcement" defaultValue={editProduct?.giveaway_announcement || ''} placeholder="Optional giveaway announcement" className="w-full rounded-lg border px-3 py-2" />
    </div>

    <div><label className="mb-1 block text-sm font-semibold text-slate-700">WhatsApp number</label><input required name="vendor_whatsapp" defaultValue={editProduct?.vendor_whatsapp || '234'} placeholder="2348012345678" className="w-full rounded-lg border px-3 py-2" /></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Search keywords / tags</label><input name="tags" defaultValue={editProduct?.tags?.join(', ')} placeholder="wireless, audio, everyday" className="w-full rounded-lg border px-3 py-2" /></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Description</label><textarea required name="description" rows={4} defaultValue={editProduct?.description} className="w-full rounded-lg border px-3 py-2" /></div>
    <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-950 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">{loading ? 'Saving product...' : editProduct ? 'Save product changes' : 'Publish product'}</button>
  </form>;
}
