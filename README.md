# Fussion Store

Fussion Store is a Next.js 16 marketplace using Supabase Postgres through Prisma and WhatsApp checkout.

## Marketplace upgrade

- Public vendor registration with pending approval.
- Supabase Auth JWT sessions with stable user IDs, verified email sign-in, and server-side admin/vendor role checks.
- Server-side vendor ownership checks for products and orders.
- Vendor dashboard for products, orders and sales metrics.
- Persistent WhatsApp order records with sequential `ORD000001` references.
- Multi-vendor cart checkout is split into one order per vendor.
- Orders move through Pending → Acknowledged → Processing → Sold (or Rejected/Cancelled). Each vendor sees only their own vendor-specific order, while multi-vendor orders share a customer checkout reference. Only Sold orders count as sales and deduct inventory; the final stock deduction is protected against duplicate completion requests.
- Product view, like and WhatsApp enquiry analytics with anonymous visitor deduplication.
- Public Top Sellers ranking is based on completed Sold order quantities.
- Trending ranking uses recent recorded engagement.
- Admin vendor approval/suspension, marketplace metrics and CSV exports.
- Existing cart/wishlist localStorage persistence, slash pricing, giveaway and related-product features are preserved.

## Supabase database and server boundary

Runtime records are stored in Supabase Postgres. The server-only Prisma client lives in `server/db.ts`; `lib/json-store.ts` maps the existing application API to relational tables. Products, vendors, vendor requests, orders, order items/status history, analytics, likes, music, enquiries, feedback, settings, and counters are stored in PostgreSQL tables. There is no local JSON data store. Existing Next.js Server Actions and Route Handlers authorize the current session before accessing private data.

The normalized schema is managed by Prisma migrations. For a new environment run `npm run db:deploy`; when converting a database that still has the old JSONB collections, run `npm run db:normalize-store` after applying the relational-table migration. That backfill verifies row counts and removes only the old collections it successfully copied.

Set `DATABASE_URL` to Supabase's session pooler URL and `DIRECT_URL` to its direct database URL. Keep both in `.env.local` or the hosting provider's server-side environment settings. Never prefix these values with `NEXT_PUBLIC_`, send them to the browser, or expose a Supabase service-role/secret key in client code. The publishable key used by `utils/supabase.ts` is public and does not replace server-side authorization.

The app's current admin/vendor session checks are application-level authorization. Prisma connects directly to Postgres, so do not assume Supabase Row Level Security protects Prisma queries when the connection uses a privileged database role. Keep access behind authenticated Server Actions/Route Handlers, and use a least-privilege database role and explicit RLS policies if direct client access is later introduced.

## Supabase Auth and account migration

Supabase Auth issues the signed access/refresh tokens and stable user IDs. The server refreshes Auth cookies in `proxy.ts`; `lib/auth.ts` verifies the user with Supabase and reads the trusted role from server-managed `app_metadata`. Vendor access also requires an approved or active vendor profile in the server-side store. Role authorization must never rely on user-editable `user_metadata`.

Configure these values in `.env.local` and in production server settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` — server-only; needed for uploads to Supabase Storage, role assignment, vendor invitations, and bulk legacy migration. The older `SUPABASE_SERVICE_ROLE_KEY` name remains a temporary fallback.
- `NEXT_PUBLIC_SITE_URL` — canonical HTTPS URL used in Auth callbacks; development defaults to `http://localhost:3000`

Configure Supabase Auth email delivery, require email confirmation, and allow the exact `/auth/callback` redirect URL in the Supabase Auth URL settings. Set the site's canonical URL to `NEXT_PUBLIC_SITE_URL` in production.

Supabase Auth is the sole identity and password provider. Admin/vendor roles are stored in server-managed Supabase `app_metadata`; vendor profiles and applications remain in Supabase Postgres. Existing pending applications can be approved by inviting the applicant through Supabase Auth. New vendor applications work with or without email confirmation enabled; when enabled, the vendor confirms the address before signing in.

The legacy `users_auth` registry is no longer read or written by the app, and is excluded from new backups and JSON imports. The one-time migration script remains under `scripts/` for reference; do not rerun it after accounts have been migrated because it sends setup emails.

To clear admin/vendor credentials while preserving vendor profiles, applications, and store content, run `npm run auth:reset` for a dry run, then `npm run auth:reset -- --apply` to execute. The reset deletes Auth users with admin/vendor roles or links to stored vendor/legacy account records, clears the legacy auth registry, reset tokens, and first-admin setup claim, and removes credential/UID fields from vendor applications and local JSON copies. Keep `FUSSION_ADMIN_SETUP_TOKEN` configured (at least 32 characters) to register a new first admin at `/admin/register`.

## Admin backups and upgrade announcements

Admin → **Backups** downloads a ZIP containing the store's data and files under `public/uploads/`. Supabase Auth accounts and secrets are not included. Restore verifies file checksums and paths, then replaces current store data and uploads. Archives are limited to 100 MB compressed and 250 MB expanded.

Admin → **Upgrade notice** publishes a text announcement in the storefront and vendor dashboard. It is an in-app notice only and does not send email or SMS.

## Admin authentication

The first administrator registers at `/admin/register` with an email, a password they choose, and the one-time `FUSSION_ADMIN_SETUP_TOKEN` from the server environment. Registration closes as soon as the first admin is created; the server checks Supabase Auth and holds an atomic Postgres setup claim, so concurrent requests cannot create a second admin. Confirm the email when Supabase email confirmation is enabled. Admin sign-in uses email and password. Keep the setup token private and remove it from the environment after setup. Additional admin accounts must be created through a trusted server-side Supabase Admin operation, not public registration.

Vendors can apply at `/vendor/register`. Supabase creates their identity; an administrator must approve the application before vendor access is enabled. Approval assigns the vendor role in Supabase Auth and links it to the vendor profile in Postgres.

`SUPABASE_SECRET_KEY` must remain server-only. Add it to Vercel as an encrypted environment variable; never prefix it with `NEXT_PUBLIC_` or expose it to browser code. It is used for uploads, role assignment, and vendor invitations.

### Rotate an exposed Supabase secret key

In Supabase Dashboard, open **Project Settings → API Keys** and create a new Secret API key. Set it as `SUPABASE_SECRET_KEY` in `.env.local` and in Vercel's server-side environment settings. Verify uploads and admin/vendor invitations with the new key, then delete the exposed key in the dashboard. Do not paste either key into chat or commit it. Supabase's [leaked API key rotation guide](https://supabase.com/docs/guides/security/rotate-leaked-api-keys) explains the dashboard steps.

Do not put encryption keys, service-role keys, session secrets or passwords in JSON or client-side code.

New passwords are checked against the Have I Been Pwned password corpus through its k-anonymity range API. Only the first five characters of a SHA-1 digest are sent; the password and full digest remain on the server. Password creation/change/reset fails explicitly if the check service is unavailable.

## Password recovery

Admins and vendors can change a password from the **Security** section of their dashboard after re-entering their current password. Password changes revoke active Supabase sessions. Reset and invitation link expiry and rate limits should be configured in Supabase Auth.

Password reset and vendor invitation links use Supabase Auth email delivery. Configure and test SMTP/email delivery in the Supabase project before enabling account registration.

Vendors use the email on their account. Admin recovery uses the email address configured at admin registration.

## Development

```bash
npm install
npm run dev
```

## Vercel deployment

Import the Git repository into Vercel as a Next.js project and use the default install/build settings. Add these values to the Vercel environments before the first build (do not commit or upload `.env.local` as a file):

- `DATABASE_URL` — Supabase pooled Postgres URL used by the app.
- `DIRECT_URL` — Supabase direct Postgres URL used when applying Prisma migrations.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public Supabase client configuration.
- `SUPABASE_SECRET_KEY` — server-only secret used by guarded server actions for Storage and Auth administration.
- `NEXT_PUBLIC_SITE_URL` — the canonical production HTTPS URL used in Auth redirects.

Apply pending Prisma migrations with `npm run db:deploy` before sending production traffic. Add `https://<production-domain>/auth/callback` to Supabase Auth's allowed redirect URLs. Local JSON files are not required at build or runtime.

## Important deployment note

Supabase Postgres provides durable storage for application records and settings. Uploaded product, vendor, branding, banner, about, and music files use the public `store-assets` Supabase Storage bucket. The admin and vendor application handlers upload through server-only Supabase credentials; no client-side Storage write policies are enabled.

## Vendor applications from the storefront

The storefront now includes **Sell on Fussion**. The basic vendor application is saved in Supabase, appears in the Admin Dashboard under Vendor applications, and returns a WhatsApp handoff URL for the configured admin WhatsApp number.

Set `FUSSION_ADMIN_WHATSAPP` to the admin WhatsApp number in international digits only, for example `2348012345678`. The application remains stored in Supabase even if WhatsApp is not configured.

## Encryption fallback

The app no longer needs the legacy auth encryption/session secrets or a local JSON data directory for authentication. Keep the Supabase URL, publishable key, database URLs, and service role key in server environment configuration; never expose the service role key to client code.

## Vendor approval and sales workflow (v12 update)

- A storefront application is saved with a unique `VREQ0001`-style application ID. The application ID and business details are included in the WhatsApp handoff to `FUSSION_ADMIN_WHATSAPP`; no password is requested or sent.
- In Admin → Vendors, enter the application ID from WhatsApp, then choose Approve or Reject. Approval creates the vendor account and a separate `VEN0001`-style vendor ID, then sends a Supabase Auth invitation so the vendor can set a password.
- Vendors acknowledge each vendor-specific order, move it to Processing, and finally confirm the completed sale. Rejected/cancelled orders do not count as revenue.
- Every vendor order has its own `ORD000001`-style ID and shares the customer's checkout reference across a multi-vendor cart.
- Inventory is deducted only when a vendor confirms completion; the order is atomically claimed during completion to prevent double deduction from repeated clicks.

Vendor and admin passwords are managed by Supabase Auth and are never stored in the app database.


## Storefront music and media uploads (v14 repair)

- Admin → Music has a global storefront Play/Pause switch. Open storefront pages check the setting every 5 seconds; pausing stops their current audio. A shopper must still initiate playback once because browsers block unsolicited autoplay with sound.
- Audio upload accepts MP3 (.mp3), M4A (.m4a), OGG (.ogg), WAV (.wav) and WebM audio (.webm). Each file and the full admin music library are capped at 10 MB total.
- Product photos accept JPG/JPEG, PNG, WEBP, GIF and AVIF, up to 4 images per product upload. The browser converts them to WebP at 80% quality and scales the longest edge to at most 1200 px. File size is content-dependent and commonly lands around 40–150 KB; the browser and server enforce a 500 KB ceiling without repeatedly degrading complex photos. Use actual image files, not URLs, PDFs, SVGs or HEIC/HEIF photos. Convert iPhone HEIC images to JPG or PNG first.
- Next.js Server Action request limit is set to 100 MB to support multiple photos or larger music files in one submission.
- New uploads are stored in the Supabase Storage `store-assets` bucket. Existing media was copied into that bucket; the local directory can remain as a legacy fallback.

## Owner About page

Admin → **About** lets the store owner publish a name, title, profile photo, personal story, and up to eight hobbies or interests. The storefront links to the full About page and includes a short owner-story preview on the homepage. Before the first save, a clearly labeled demo profile is shown. Profile photos accept JPG, PNG or WEBP up to 8 MB and are included in the existing uploads backup.

## Shopper help and product feedback

The storefront **Help & safety** page provides searchable FAQ answers, marketplace due-diligence guidance, and a support/report form. Enquiries are stored in the Admin → **Inbox** and open a pre-filled WhatsApp message when the admin WhatsApp number is configured. The FAQ uses curated answers and local search; it does not call a generative AI service.

Shoppers can submit a rating and comment from a product page. Reviews remain pending until approved in the Admin inbox. The database retains the 10 most recent feedback submissions per product, based on submission time; the public product page shows up to 10 latest approved reviews in a horizontal, collapsible panel. New enquiry and review records are included in admin ZIP backups; older backups without these records restore with empty inboxes.
