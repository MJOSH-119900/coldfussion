-- Product image objects are scoped as: <vendor_id>/products/<product_id>/<uuid>.webp
-- Application roles are stored in Supabase app_metadata and cannot be changed by users.
drop policy if exists "Product images can be uploaded by owner or admin" on storage.objects;
create policy "Product images can be uploaded by owner or admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    (auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'super_admin'))
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'vendor'
      and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'vendor_id'
    )
  )
);

drop policy if exists "Product images can be removed by owner or admin" on storage.objects;
create policy "Product images can be removed by owner or admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    (auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'super_admin'))
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'vendor'
      and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'vendor_id'
    )
  )
);
