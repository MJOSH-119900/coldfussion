'use client';
import { useState } from 'react';
import { Product } from '../../../(public)/components/types/store';
import { saveProductAction } from '../actions';
import { useToast } from '../../../components/ToastProvider';
interface FormProps {
    currentVendorId: string;
    editProduct?: Product;
    products: Product[];
    onSuccess: (product: Product) => void | Promise<void>;
    isAdmin?: boolean;
}
export default function ProductForm({ currentVendorId, editProduct, products, onSuccess, isAdmin = false }: FormProps) {
    const [loading, setLoading] = useState(false);
    const [selectedCount, setSelectedCount] = useState(0);
    const { notify } = useToast();
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formElement = e.currentTarget;
        setLoading(true);
        try {
            const formData = new FormData(formElement);
            const result = await saveProductAction(formData, currentVendorId, editProduct?.id);
            if (!result.success)
                throw new Error(result.error || 'Could not save product');
            formElement.reset();
            setSelectedCount(0);
            await onSuccess(result.product as Product);
            notify('success', editProduct ? 'Your product changes have been saved.' : 'Your product is now in the catalog.', editProduct ? 'Product updated' : 'Product published');
        }
        catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not save product', 'Save failed');
        }
        finally {
            setLoading(false);
        }
    };
    return <form onSubmit={handleSubmit} encType="multipart/form-data" className="admin-product-form max-h-[calc(100dvh-7rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="min-w-0 space-y-5">
    <div><h2 className="text-xl font-bold text-slate-800">{editProduct ? 'Edit product' : 'Add a product'}</h2><p className="mt-1 text-xs text-slate-500">Manage pricing, availability, gallery placement and storefront announcements.</p></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product title</label><input required name="title" defaultValue={editProduct?.title} className="w-full rounded-lg border px-3 py-2"/></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Selling price (₦)</label><input required min="0" step="0.01" type="number" name="price" defaultValue={editProduct?.price ?? ''} placeholder="Enter current selling price" className="w-full rounded-lg border px-3 py-2"/></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Previous price / slash price (₦)</label><input min="0" step="0.01" type="number" name="compare_at_price" defaultValue={editProduct?.compare_at_price ?? ''} placeholder="Optional — must exceed selling price" className="w-full rounded-lg border px-3 py-2"/>{editProduct?.compare_at_price && editProduct.compare_at_price > editProduct.price ? <p className="mt-1 text-xs text-slate-500">Current discount: <span className="font-semibold text-slate-700">₦{editProduct.price.toLocaleString()}</span> <span className="ml-1 text-slate-400 line-through">₦{editProduct.compare_at_price.toLocaleString()}</span></p> : <p className="mt-1 text-xs text-slate-500">Enter a previous price higher than the selling price to show a slash discount.</p>}</div>
    </div>
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Sizes with separate prices (optional)</label>
      <p className="mb-2 text-xs text-slate-600">Enter one size and price per line, for example: Small = 5000, Medium = 6500, Large = 8000. Leave blank for a single-price product.</p>
      <textarea name="size_prices_text" rows={4} defaultValue={(editProduct?.size_prices || []).map(v => `${v.size} = ${v.price}`).join('\n')} placeholder={'Small = 5000\nMedium = 6500\nLarge = 8000'} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm" />
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Category</label><input required name="category" defaultValue={editProduct?.category} placeholder="Tech, Fashion..." className="w-full rounded-lg border px-3 py-2"/></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Available quantity</label><input min="0" type="number" name="available_quantity" defaultValue={editProduct?.available_quantity ?? 0} className="w-full rounded-lg border px-3 py-2"/></div>
    </div>

    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Product photos (up to 7)</label>
      <p className="mb-3 text-xs text-slate-500">The first image is the main listing image. Upload up to 7 pictures, maximum 12 MB each. Supported files: JPG, JPEG, PNG, WEBP, GIF or AVIF. Use the original picture file, not a web-page link, PDF, HEIC or SVG.</p>
      <input type="file" name="image_files" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={e => setSelectedCount(e.target.files?.length || 0)} className="w-full text-sm"/>
      <p className="mt-2 text-xs text-slate-500">{selectedCount ? `${selectedCount} new image(s) selected` : editProduct ? `${editProduct.images?.length || 0} current image(s)` : 'No images selected yet'}</p>
      {editProduct?.images?.length ? <div className="mt-3 flex flex-wrap gap-2">{editProduct.images.slice(0, 7).map((src, i) => <img key={`${src}-${i}`} src={src} alt={`Current product image ${i + 1}`} className="h-14 w-14 rounded-lg border object-cover"/>)}</div> : null}
    </div>

    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-800">You may also like</p>
      <p className="text-xs text-slate-500">Choose how related products are selected on this product's detail page. Category is the recommended default.</p>
      <select name="related_products_mode" defaultValue={editProduct?.related_products_mode || 'category'} className="w-full rounded-lg border px-3 py-2">
        <option value="category">Same category</option>
        <option value="random">Random products</option>
        <option value="manual">Choose products manually</option>
      </select>
      <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
        {products.filter(p => p.id !== editProduct?.id).map(p => (<label key={p.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
            <input type="checkbox" name="related_product_ids" value={p.id} defaultChecked={editProduct?.related_product_ids?.includes(p.id)}/>
            <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{p.title}</span><span className="block truncate text-slate-500">{p.category}</span></span>
          </label>))}
      </div>
      <p className="text-[11px] text-slate-500">Manual mode uses the checked items (up to 4). Category/random mode ignores these selections.</p>
    </div>

    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-800">Availability & storefront</p>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_available" value="true" defaultChecked={editProduct?.is_available ?? true}/> Product available for enquiry/cart</label>
      <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="detail_gallery_enabled" value="true" defaultChecked={editProduct?.detail_gallery_enabled ?? false}/><span><strong>Enable product gallery</strong><span className="block text-xs text-slate-500">Show up to 7 photos on the detail page.</span></span></label>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_latest" value="true" defaultChecked={editProduct?.is_latest ?? false}/> Feature in Latest Drops</label>
      {isAdmin && <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_top_selling" value="true" defaultChecked={editProduct?.is_top_selling ?? false}/> Feature in Top Sellers (admin only)</label>}
      <label className="flex items-center gap-3 text-sm font-semibold text-emerald-700"><input type="checkbox" name="giveaway" value="true" defaultChecked={editProduct?.giveaway ?? false}/> Announce this item as a giveaway</label>
      <input name="giveaway_announcement" defaultValue={editProduct?.giveaway_announcement || ''} placeholder="Optional giveaway announcement" className="w-full rounded-lg border px-3 py-2"/>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product location</label><input name="location" defaultValue={editProduct?.location || ''} placeholder="e.g. Ikeja, Lagos" className="w-full rounded-lg border px-3 py-2"/><p className="mt-1 text-xs text-slate-500">Where the item is available for pickup or dispatch.</p></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Item condition</label><select name="condition" defaultValue={editProduct?.condition || 'new'} className="w-full rounded-lg border px-3 py-2"><option value="new">New</option><option value="used">Used</option><option value="spare-part">Spare part</option></select></div>
    </div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product WhatsApp fallback (optional)</label><input name="vendor_whatsapp" defaultValue={editProduct?.vendor_whatsapp || ''} placeholder="Leave blank to use your vendor profile WhatsApp" className="w-full rounded-lg border px-3 py-2"/><p className="mt-1 text-xs text-slate-500">Customers are directed to your vendor profile WhatsApp number at checkout.</p></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Search keywords / tags</label><input name="tags" defaultValue={editProduct?.tags?.join(', ')} placeholder="wireless, audio, everyday" className="w-full rounded-lg border px-3 py-2"/></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Description</label><textarea required name="description" rows={4} defaultValue={editProduct?.description} className="w-full rounded-lg border px-3 py-2"/></div>
    <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-950 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">{loading ? 'Saving product...' : editProduct ? 'Save product changes' : 'Publish product'}</button>
    </div>
  </form>;
}
