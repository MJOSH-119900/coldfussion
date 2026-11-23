'use client';
import { useState } from 'react';
import { Product } from '../../../(public)/components/types/store';
import type { VendorProductAccess } from '../../../(public)/components/types/store';
import { saveProductAction } from '../actions';
import { useToast } from '../../../components/ToastProvider';
import { optimizeImageInput } from '../../../../lib/image-optimizer';
import { getProductSubcategories, isProductMainCategory, PRODUCT_MAIN_CATEGORIES } from '../../../../lib/product-categories';
interface FormProps {
    currentVendorId: string;
    editProduct?: Product;
    products: Product[];
    onSuccess: (product: Product) => void | Promise<void>;
    onCancel?: () => void;
    isAdmin?: boolean;
    vendorProductAccess?: VendorProductAccess;
    preferredRequestId?: string;
}
export default function ProductForm({ currentVendorId, editProduct, products, onSuccess, onCancel, isAdmin = false, vendorProductAccess, preferredRequestId }: FormProps) {
    const [loading, setLoading] = useState(false);
    const [selectedCount, setSelectedCount] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState(editProduct?.category || '');
    const [selectedSubcategory, setSelectedSubcategory] = useState(editProduct?.subcategory || '');
    const [customSubcategory, setCustomSubcategory] = useState('');
    const [permissionId, setPermissionId] = useState(
        preferredRequestId && vendorProductAccess?.approved_requests.some(request => request.request_id === preferredRequestId)
            ? preferredRequestId
            : vendorProductAccess?.initial_permission_available
                ? 'initial'
                : vendorProductAccess?.approved_requests[0]?.request_id || '',
    );
    const initialRequest = vendorProductAccess?.approved_requests.find(request => request.request_id === permissionId);
    const [title, setTitle] = useState(editProduct?.title || initialRequest?.product_name || '');
    const [description, setDescription] = useState(editProduct?.description || initialRequest?.product_description || '');
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
            if (!vendorProductAccess) {
                setSelectedCategory('');
                setSelectedSubcategory('');
                setTitle('');
                setDescription('');
            }
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
    const selectedRequest = vendorProductAccess?.approved_requests.find(request => request.request_id === permissionId);
    const permissionCategory = selectedRequest?.main_category || vendorProductAccess?.main_category || '';
    const permissionSubcategory = selectedRequest?.subcategory || vendorProductAccess?.subcategory || '';
    const legacySubcategory = editProduct?.subcategory &&
        selectedCategory === editProduct.category &&
        !getProductSubcategories(selectedCategory).includes(editProduct.subcategory)
        ? editProduct.subcategory
        : undefined;
    const handlePermissionChange = (nextId: string) => {
        const request = vendorProductAccess?.approved_requests.find(item => item.request_id === nextId);
        setPermissionId(nextId);
        setSelectedCategory(request?.main_category || vendorProductAccess?.main_category || '');
        setSelectedSubcategory(request?.subcategory || vendorProductAccess?.subcategory || '');
        setTitle(request?.product_name || '');
        setDescription(request?.product_description || '');
    };
    return <form onSubmit={handleSubmit} encType="multipart/form-data" className="admin-product-form max-h-[calc(100dvh-7rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="min-w-0 space-y-5">
    <div><h2 className="text-xl font-bold text-slate-800">{editProduct ? 'Edit product' : 'Add a product'}</h2><p className="mt-1 text-xs text-slate-500">Manage pricing, availability, gallery placement and storefront announcements.</p></div>
    {!editProduct && vendorProductAccess && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Upload permission</label>
      <select required value={permissionId} onChange={event => handlePermissionChange(event.target.value)} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2">
        {vendorProductAccess.initial_permission_available && <option value="initial">First product — {vendorProductAccess.main_category} / {vendorProductAccess.subcategory}</option>}
        {vendorProductAccess.approved_requests.map(request => <option key={request.request_id} value={request.request_id}>{request.product_name} — approved request {request.request_id}</option>)}
      </select>
      {selectedRequest && <p className="mt-2 text-xs leading-5 text-violet-900">This approval is for the exact proposed product. Its name, description, category, and subcategory are locked to the request.</p>}
      <input type="hidden" name="product_permission_request_id" value={selectedRequest?.request_id || ''}/>
    </div>}
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product title</label><input required maxLength={150} name="title" value={title} onChange={event => setTitle(event.target.value)} readOnly={Boolean(selectedRequest)} className="w-full rounded-lg border px-3 py-2 read-only:bg-slate-50"/></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Selling price (₦)</label><input required min="0" step="0.01" type="number" name="price" defaultValue={editProduct?.price ?? ''} placeholder="Enter current selling price" className="w-full rounded-lg border px-3 py-2"/></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Previous price for all sizes (₦)</label><input min="0" step="0.01" type="number" name="compare_at_price" defaultValue={editProduct?.compare_at_price ?? ''} placeholder="Optional — applies to all sizes" className="w-full rounded-lg border px-3 py-2"/><p className="mt-1 text-xs text-slate-500">This is the default slash price for every size. A previous price after a semicolon below overrides it for that size only.</p></div>
    </div>
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Custom sizes and prices (optional)</label>
      <p className="mb-2 text-xs leading-5 text-slate-600">Add up to 20 sizes, one per line. The main previous-price field applies to all sizes. Add a previous price after a semicolon to override it for that size only. Format: <strong>Size = Price | Equivalent; Previous price</strong>. For example, with a main previous price of 8000, S = 5000; 6500 gives S its own 6500 previous price, while M = 7000 keeps the main 8000 previous price.</p>
      <textarea name="size_prices_text" rows={5} defaultValue={(editProduct?.size_prices || []).map(v => `${v.size} = ${v.price}${v.conventional_size ? ` | ${v.conventional_size}` : ''}${v.compare_at_price ? `; ${v.compare_at_price}` : ''}`).join('\n')} placeholder={'S = 5000; 6500\nM = 7000\nXL = 8000'} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm" />
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {vendorProductAccess
        ? <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-semibold text-slate-700">Main category</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{editProduct?.category || permissionCategory || 'Select an upload permission'}</p>
            <input type="hidden" name="category" value={editProduct?.category || permissionCategory}/>
            <input type="hidden" name="subcategory" value={editProduct?.subcategory || (editProduct ? '' : permissionSubcategory)}/>
            <p className="mt-1 text-xs text-slate-500">Subcategory: {editProduct?.subcategory || (editProduct ? 'Legacy / not set' : permissionSubcategory)}</p>
          </div>
        : <>
            <div><label className="mb-1 block text-sm font-semibold text-slate-700">Main category</label><select required name="category" value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value); setSelectedSubcategory(''); setCustomSubcategory(''); }} className="w-full rounded-lg border bg-white px-3 py-2"><option value="" disabled>Select a main category</option>{PRODUCT_MAIN_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}{editProduct && !isProductMainCategory(editProduct.category) && <option value={editProduct.category}>{editProduct.category} (existing category)</option>}</select></div>
            <div><label className="mb-1 block text-sm font-semibold text-slate-700">Subcategory</label><select name="subcategory" value={selectedSubcategory} onChange={event => { setSelectedSubcategory(event.target.value); setCustomSubcategory(''); }} required={!editProduct || selectedCategory !== editProduct.category || Boolean(editProduct.subcategory)} className="w-full rounded-lg border bg-white px-3 py-2"><option value="" disabled={!editProduct || selectedCategory !== editProduct.category || Boolean(editProduct.subcategory)}>{selectedCategory ? 'Select a subcategory' : 'Select a main category first'}</option>{getProductSubcategories(selectedCategory).map(value => <option key={value} value={value}>{value}</option>)}{legacySubcategory && <option value={legacySubcategory}>{legacySubcategory} (existing subcategory)</option>}</select></div>
            {selectedSubcategory === 'Other' && <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Specify the product or subcategory<input required maxLength={100} name="subcategory_custom" value={customSubcategory} onChange={event => setCustomSubcategory(event.target.value)} placeholder="For example, handmade baskets" className="mt-1 w-full rounded-lg border px-3 py-2"/></label>}
          </>}
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Available quantity</label><input min="0" type="number" name="available_quantity" defaultValue={editProduct?.available_quantity ?? 0} className="w-full rounded-lg border px-3 py-2"/></div>
      {vendorProductAccess && <div className="sm:col-span-2"><p className="mt-1 text-xs text-slate-500">Product category and subcategory are fixed by the selected upload permission.</p></div>}
    </div>

    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="mb-1 block text-sm font-bold text-slate-800">Product photos (up to 4)</label>
      <p className="mb-3 text-xs text-slate-500">The first image is the main listing image. Upload up to 4 pictures. Supported files: JPG, JPEG, PNG, WEBP, GIF or AVIF. Use the original picture file, not a web-page link, PDF, HEIC or SVG.</p>
      {!isAdmin && <p className="mb-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900">Photo tip: Use sharp, well-lit pictures of the actual item, with a clean background and a few helpful angles. Quality photos can build trust and attract more buyers.</p>}
      {selectedRequest?.product_image && <div className="mb-3"><p className="mb-2 text-xs font-semibold text-violet-800">The approved request image will be used for this product.</p><img src={selectedRequest.product_image} alt={`Approved image for ${selectedRequest.product_name}`} className="h-24 w-24 rounded-lg border object-cover"/></div>}
      <input type="file" name="image_files" disabled={Boolean(selectedRequest?.product_image)} accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={async e => { const input = e.currentTarget; setSelectedCount(-1); input.disabled = true; try { const files = await optimizeImageInput(input); setSelectedCount(files.length); } catch (error) { input.value = ''; setSelectedCount(0); notify('error', error instanceof Error ? error.message : 'Could not optimize the selected images.', 'Image preparation failed'); } finally { input.disabled = false; } }} className="w-full text-sm"/>
      <p className="mt-2 text-xs text-slate-500">{selectedRequest?.product_image ? 'The approved request image is fixed to this product permission.' : selectedCount < 0 ? 'Optimizing selected images…' : selectedCount ? `${selectedCount} WebP image(s) selected · 80% quality, max 1200px; usually 40–150 KB (500 KB ceiling)` : editProduct ? `${editProduct.images?.length || 0} current image(s)` : 'Images are resized to at most 1200px and converted to WebP at 80% quality before upload.'}</p>
      {editProduct?.images?.length ? <div className="mt-3 flex flex-wrap gap-2">{editProduct.images.slice(0, 4).map((src, i) => <img key={`${src}-${i}`} src={src} alt={`Current product image ${i + 1}`} className="h-14 w-14 rounded-lg border object-cover"/>)}</div> : null}
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
      <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="detail_gallery_enabled" value="true" defaultChecked={editProduct?.detail_gallery_enabled ?? false}/><span><strong>Enable product gallery</strong><span className="block text-xs text-slate-500">Show up to 4 photos on the detail page.</span></span></label>
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_latest" value="true" defaultChecked={editProduct?.is_latest ?? false}/> Feature in Latest Drops</label>
      {isAdmin && <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="is_top_selling" value="true" defaultChecked={editProduct?.is_top_selling ?? false}/> Feature in Top Sellers (admin only)</label>}
      <label className="flex items-center gap-3 text-sm font-semibold text-emerald-700"><input type="checkbox" name="giveaway" value="true" defaultChecked={editProduct?.giveaway ?? false}/> Announce this item as a giveaway</label>
      <input name="giveaway_announcement" defaultValue={editProduct?.giveaway_announcement || ''} placeholder="Optional giveaway announcement" className="w-full rounded-lg border px-3 py-2"/>
      <p className="text-xs leading-5 text-slate-500">Giveaways appear as clickable storefront announcements and in the shopper giveaway pop-up. This setting is available to admins and vendors.</p>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product location</label><input name="location" defaultValue={editProduct?.location || ''} placeholder="e.g. Ikeja, Lagos" className="w-full rounded-lg border px-3 py-2"/><p className="mt-1 text-xs text-slate-500">Where the item is available for pickup or dispatch.</p></div>
      <div><label className="mb-1 block text-sm font-semibold text-slate-700">Item condition</label><select name="condition" defaultValue={editProduct?.condition || 'new'} className="w-full rounded-lg border px-3 py-2"><option value="new">New</option><option value="used">Used</option><option value="spare-part">Spare part</option></select></div>
    </div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Product WhatsApp fallback (optional)</label><input name="vendor_whatsapp" defaultValue={editProduct?.vendor_whatsapp || ''} placeholder="Leave blank to use your vendor profile WhatsApp" className="w-full rounded-lg border px-3 py-2"/><p className="mt-1 text-xs text-slate-500">Customers are directed to your vendor profile WhatsApp number at checkout.</p></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Search keywords / tags</label><input name="tags" defaultValue={editProduct?.tags?.join(', ')} placeholder="wireless, audio, everyday" className="w-full rounded-lg border px-3 py-2"/></div>
    <div><label className="mb-1 block text-sm font-semibold text-slate-700">Description</label><textarea required maxLength={5000} name="description" rows={4} value={description} onChange={event => setDescription(event.target.value)} readOnly={Boolean(selectedRequest)} className="w-full rounded-lg border px-3 py-2 read-only:bg-slate-50"/></div>
    <div className={`grid gap-3 ${editProduct && onCancel ? 'sm:grid-cols-[auto_1fr]' : ''}`}>
      {editProduct && onCancel && <button type="button" disabled={loading} onClick={onCancel} className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition-transform group-hover:rotate-90"><path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18"/></svg>
        <span>Cancel edit</span>
      </button>}
      <button type="submit" disabled={loading || selectedCount < 0} className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-50">{selectedCount < 0 ? 'Optimizing photos...' : loading ? 'Saving product...' : editProduct ? 'Save product changes' : 'Publish product'}</button>
    </div>
    </div>
  </form>;
}
