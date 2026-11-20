# Supabase and Prisma ORM

The project uses Prisma ORM 7 with PostgreSQL. Runtime data reads and writes
go through Prisma to Supabase. The former local JSON data files have been
removed. The app and Prisma config load `.env.local` first, then `.env` as a
fallback. Both files are gitignored.

Set `DATABASE_URL` to Supabase's session pooler URL for application traffic,
and `DIRECT_URL` to Supabase's direct database URL for Prisma migrations.

1. Fill in `DATABASE_URL` and `DIRECT_URL` in `.env.local` using Supabase's
   Connect panel. Keep the password private.
2. Apply the checked-in schema migration with `npm run db:deploy` (or create
   future migrations locally with `npm run db:migrate -- --name <name>`).
3. The structured records were imported into the relational tables. Counters
   and settings use `store_counters` and `store_settings`.

Product, vendor, order, and other business data is stored in column-based
tables. Supabase Storage holds uploaded assets in the `store-assets` bucket.
