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
- Checkout shows a storefront receipt with vendor-specific order references. After marking an order Sold, the vendor can issue a single-use receipt confirmation link for the customer; the admin dashboard displays and polls for customer confirmations.
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
- `SUPABASE_SECRET_KEY` — server-only; needed for uploads to Supabase Storage, role assignment, vendor invitations, and bulk legacy migration.
- `NEXT_PUBLIC_SITE_URL` — canonical HTTPS URL used in Auth callbacks; development defaults to `http://localhost:3000`
- `CRON_SECRET` — a random server-only value of at least 32 characters used to protect the database activity ping endpoint.

Configure Supabase Auth email delivery, require email confirmation, and allow `https://coldfussion.vercel.app/auth/callback` in Supabase Auth URL settings. The Invite user email template must link to `{{ .ConfirmationURL }}` so Supabase preserves the requested `/vendor/setup` destination. Set the site's canonical URL to `NEXT_PUBLIC_SITE_URL` in production. See [Fixing production Auth email links](#fixing-production-auth-email-links) if a message points to localhost or the storefront.

Supabase Auth is the sole identity and password provider. Login email/password credentials live in Supabase Auth's `auth.users`; admin/vendor roles are stored in server-managed `app_metadata`. Vendor applications and profiles are stored in the existing Postgres `vendor_requests` and `vendors` tables. A new vendor application is saved first, then Supabase Auth emails a secure password setup link. The vendor can set a password immediately but cannot sign in to the vendor dashboard until an administrator approves the application and assigns the vendor role and ID. If the setup email cannot be sent, the application remains saved and approval retries the invitation without requiring a new application.

Vendor onboarding requires a unique username, email, business details, and one CAC or NIN document. Identity documents and payment receipts are capped at 1 MB, stored in the private `vendor-verification-private` Storage bucket, and shown to admins through five-minute signed URLs. Admin → Vendors can set whether payment is required, the amount and instructions, a default access period, then verify a receipt and assign access days during approval. New vendor access expires after the assigned period; existing vendors without an expiry remain unchanged. The application review target is 24 hours for weekday submissions.

The legacy `users_auth` registry is no longer read or written by the app, and is excluded from new backups and JSON imports. The one-time migration script remains under `scripts/` for reference; do not rerun it after accounts have been migrated because it sends setup emails.

To clear admin/vendor credentials while preserving vendor profiles, applications, and store content, run `npm run auth:reset` for a dry run, then `npm run auth:reset -- --apply` to execute. The reset deletes Auth users with admin/vendor roles or links to stored vendor/legacy account records, clears the legacy auth registry, reset tokens, and first-admin setup claim, and removes credential/UID fields from vendor applications and local JSON copies. Keep `FUSSION_ADMIN_SETUP_TOKEN` configured (at least 32 characters) to register a new first admin at `/admin/register`.

## Admin backups and upgrade announcements

Admin → **Backups** downloads a ZIP containing the store's data and files under `public/uploads/`. Supabase Auth accounts and secrets are not included. Restore verifies file checksums and paths, then replaces current store data and uploads. Archives are limited to 100 MB compressed and 250 MB expanded.

Admin → **Upgrade notice** publishes a text announcement in the storefront and vendor dashboard. It is an in-app notice only and does not send email or SMS.

## Admin authentication

The first administrator registers at `/admin/register` with an email, a password they choose, and the one-time `FUSSION_ADMIN_SETUP_TOKEN` from the server environment. Registration closes as soon as the first admin is created; the server checks Supabase Auth and holds an atomic Postgres setup claim, so concurrent requests cannot create a second admin. Confirm the email when Supabase email confirmation is enabled. Admin sign-in uses email and password. Keep the setup token private and remove it from the environment after setup. The original setup-token account is the super admin. From Admin ? Sub-admins, the super admin can invite sub-admins, revoke their access, or delete their Auth accounts. No additional public registration is available.

Vendors can apply at `/vendor/register`. Supabase creates their identity; an administrator must approve the application before vendor access is enabled. Approval assigns the vendor role in Supabase Auth and links it to the vendor profile in Postgres.

`SUPABASE_SECRET_KEY` must remain server-only. Add it to Vercel as an encrypted environment variable; never prefix it with `NEXT_PUBLIC_` or expose it to browser code. It is used for uploads, role assignment, and vendor invitations.

### Rotate an exposed Supabase secret key

The old key was exposed in diagnostic output. Treat it as compromised and rotate it. The application now reads only `SUPABASE_SECRET_KEY`; it no longer falls back to `SUPABASE_SERVICE_ROLE_KEY`.

1. **Create a replacement key.** In the Supabase Dashboard, open **Project Settings → API Keys** and create a new **Secret API key**. Keep this page private and do not paste the key into chat, a ticket, or a command. A new secret key normally starts with `sb_secret_`.
2. **Set it locally.** Add this line to the ignored `.env.local` file at the repository root, replacing the placeholder locally:

   ```dotenv
   SUPABASE_SECRET_KEY=sb_secret_replace_with_the_new_key
   ```

   Remove any old `SUPABASE_SERVICE_ROLE_KEY=...` line from `.env.local`. Confirm `.env.local` is ignored with `git check-ignore .env.local`; never commit it. Restart the local dev server after changing environment variables.
3. **Verify locally without printing the key.** Run `npm run supabase:verify-secret`. It makes a read-only Supabase Auth Admin API request and prints only success or an HTTP error code. Do not use `echo`, `Write-Output`, or a command that prints the key.
4. **Set Vercel Production.** In Vercel, open **Project → Settings → Environment Variables**. Add `SUPABASE_SECRET_KEY` with the new value and select **Production** (also select Preview/Development only if those deployments need admin operations). Mark it sensitive/encrypted. Remove `SUPABASE_SERVICE_ROLE_KEY` if it exists. Do not use a `NEXT_PUBLIC_` name.
5. **Redeploy and verify.** Create a new Production deployment so it receives the new environment value. In the deployed site, verify a server-side admin operation that uses the secret, such as uploading an image/music asset or approving/inviting a vendor. Confirm it succeeds; the key must not appear in browser bundles, page source, or logs. The browser-facing Supabase setting remains `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
6. **Retire the exposed key.** After the replacement is working, return to **Supabase → Project Settings → API Keys**. If the exposed item is a modern Secret API key, delete that specific old key. If it is the legacy `service_role` key, Supabase treats the legacy `anon` and `service_role` keys together: first ensure every browser client uses the publishable key (this app does), then disable the legacy keys. Do not revoke a legacy JWT signing secret unless you have completed Supabase's signing-key migration and checked every dependent service.
7. **Clean up and confirm.** Remove old key values from local environment files and Vercel settings; confirm the exposed key is no longer listed/active in Supabase. If it ever entered Git history, rotating it is still required even after removing the text from the latest commit.

Follow Supabase's current [leaked API key rotation guide](https://supabase.com/docs/guides/security/rotate-leaked-api-keys) for the exact dashboard flow for the key type you exposed. Secret keys bypass RLS and must stay server-side.

### Fixing production Auth email links

If a password reset email opens `http://localhost:3000`, Supabase is falling back to its Site URL or the email template is overriding the redirect. The app sends reset emails to `https://coldfussion.vercel.app/auth/callback?next=%2Fpassword-reset%2Fcomplete` in production.

1. In **Vercel → Project → Settings → Environment Variables**, set `NEXT_PUBLIC_SITE_URL` to `https://coldfussion.vercel.app` for Production. Do not include a trailing path such as `/auth/callback`. Redeploy after changing it; existing deployments keep their previous environment.
2. In **Supabase Dashboard → Authentication → URL Configuration**, set **Site URL** to `https://coldfussion.vercel.app`.
3. In **Redirect URLs**, add the exact production callback `https://coldfussion.vercel.app/auth/callback`. For local development, also add `http://localhost:3000/**`. If password reset is sent from Vercel Preview deployments, add the Vercel preview pattern shown in Supabase's [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), scoped to this Vercel team/account.
4. In **Authentication → Email Templates → Reset Password**, make the button use Supabase's `{{ .ConfirmationURL }}` (or its redirect target) rather than a hard-coded localhost URL or `{{ .SiteURL }}`. The app's callback exchanges the Supabase code, then sends the user to `/password-reset/complete`.
5. Save the settings, request a **new** reset email at `https://coldfussion.vercel.app/admin/password-reset`, and confirm the link begins at `https://coldfussion.vercel.app/auth/callback`. Old reset messages keep their old link and should not be reused.

For vendor invitations, also open **Authentication → Email Templates → Invite user** and make its invitation button use `{{ .ConfirmationURL }}`. The app sends invitations to `https://coldfussion.vercel.app/auth/callback?next=%2Fvendor%2Fsetup`; if that callback is absent from **Redirect URLs**, Supabase falls back to the Site URL and the link can open the storefront. Confirm custom SMTP is enabled for delivery to vendor addresses, not only project team addresses.

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
- `CRON_SECRET` — random server-only value of at least 32 characters. Set this before enabling an external scheduled ping.

Apply pending Prisma migrations with `npm run db:deploy` before sending production traffic. Add `https://<production-domain>/auth/callback` to Supabase Auth's allowed redirect URLs. Local JSON files are not required at build or runtime.

### Keep a Free Supabase project active

The protected `GET /api/cron/db-ping` endpoint runs `SELECT 1` against Postgres. Set a random `CRON_SECRET` in Vercel's Production environment, then redeploy. In cron-job.org, create a GET request to `https://coldfussion.vercel.app/api/cron/db-ping`, schedule it once per day, and set the request header `Authorization: Bearer <the same CRON_SECRET>`. A successful request returns `{"ok":true}`. Keep the secret private. Supabase may still pause Free projects if activity is considered too low; this ping is a best-effort workaround, not a guarantee.

## Important deployment note

Supabase Postgres provides durable storage for application records and settings. Product photos use the public `product-images` Supabase Storage bucket; vendor, branding, banner, about, and music files use `store-assets`. Product photos are converted to WebP in the browser, limited to 70 KB per image, and uploaded with unique names. The product bucket enforces WebP and a 75 KB maximum. Product uploads and removals run through authenticated server actions; the optional Storage RLS policies for authenticated owner/admin operations are in `supabase/migrations/20261126120000_product_image_storage_policies.sql`.

## Vendor applications from the storefront

The storefront now includes **Sell on Fussion**. The basic vendor application is saved in Supabase, appears in the Admin Dashboard under Vendor applications, and returns a WhatsApp handoff URL for the configured admin WhatsApp number.

Set `FUSSION_ADMIN_WHATSAPP` to the admin WhatsApp number in international digits only, for example `2348012345678`. The application remains stored in Supabase even if WhatsApp is not configured.

## Encryption fallback

The app no longer needs the legacy auth encryption/session secrets or a local JSON data directory for authentication. Keep the Supabase URL, publishable key, database URLs, and service role key in server environment configuration; never expose the service role key to client code.

## Vendor approval and sales workflow (v12 update)

- A storefront application is saved with a unique `VREQ0001`-style application ID, a private CAC/NIN document, and a private payment receipt when payment is enabled. The applicant can open a WhatsApp handoff with the application details. Supabase Auth emails a secure password setup link to `/vendor/setup`; no password is collected on the application form.
- In Admin → Vendors, review the documents, authorize the payment receipt when required, assign access days, and approve or reject. Approval assigns a separate `VEN0001`-style vendor ID and enables the same Supabase Auth user. The vendor signs in with the application email and the password set from the invitation link.
- Vendors acknowledge each vendor-specific order, move it to Processing, and finally confirm the completed sale. Rejected/cancelled orders do not count as revenue.
- Every vendor order has its own `ORD000001`-style ID and shares the customer's checkout reference across a multi-vendor cart.
- Inventory is deducted only when a vendor confirms completion; the order is atomically claimed during completion to prevent double deduction from repeated clicks.
- After completion, vendors can send customers a secure receipt confirmation link via WhatsApp or copy it to another channel. The link expires after 30 days, and the admin dashboard displays the customer's acknowledgement and raises an in-app notification while an admin is signed in.

Vendor and admin passwords are managed by Supabase Auth and are never stored in the app database.

## Vendor base plan and manual add-ons

Newly approved vendors receive five product slots, their approved category, and the brand selected in their application. Existing vendors retain their current per-product approval rules. Vendor → **Product access** shows the current plan and provides bank-transfer requests for monthly renewal (₦1,000), one brand in an unlocked category (₦500), one extra category (₦1,000), five product slots (₦300), or a seven-day featured boost for one product (₦500). The vendor includes the generated `VND-XXXXXX` reference in the transfer narration; an admin verifies the transfer and reviews it under **Vendor Add-ons**. Renewal approval adds 30 days and restores dashboard access for expired vendors.

The add-on requests reuse the bank transfer instructions configured in Admin → **Vendors**. Product boosts are time-limited and display at the top of storefront search with a Featured badge. Product photos are limited to three per product, converted to WebP at up to 800 px and 70 KB, and removed from Storage after the product record is deleted or an image is replaced.

Apply the ordered Prisma migrations with `npm run db:deploy` before deployment. The corresponding SQL Editor scripts are `supabase/migrations/20261126130000_vendor_monetization.sql`, `supabase/migrations/20261126140000_fair_product_discovery.sql`, and `supabase/migrations/20261126150000_vendor_whatsapp_setup.sql`, in that order. They add vendor entitlements and requests, the fair product RPC and indexes, product discovery history, entitlement triggers, direct-client RLS policies, and short-lived one-time vendor setup token fields. The storefront uses paged RPC results for its main feed, with category and brand filtering, search, and Load more. A persisted first-published fingerprint keeps deleting and re-uploading the same listing from making it fresh again. The server actions also enforce ownership and plan limits; the app's privileged Prisma connection does not rely on RLS for its checks.


## Storefront music and media uploads (v14 repair)

- Admin → Music has a global storefront Play/Pause switch. Open storefront pages check the setting every 5 seconds; pausing stops their current audio. A shopper must still initiate playback once because browsers block unsolicited autoplay with sound.
- Audio upload accepts MP3 (.mp3), M4A (.m4a), OGG (.ogg), WAV (.wav) and WebM audio (.webm). Each file and the full admin music library are capped at 10 MB total.
- Product photos accept JPG, PNG, or WebP, up to 3 images per product. The browser converts them to WebP, scales the longest edge to at most 800 px, and enforces a strict 70 KB limit; the server also checks WebP data and size. Use actual image files, not URLs, PDFs, SVGs, GIFs, AVIF, or HEIC/HEIF photos. Convert unsupported formats to JPG or PNG first.
- Next.js Server Action request limit is set to 100 MB to support multiple photos or larger music files in one submission.
- Product photos are stored in the Supabase Storage `product-images` bucket. Other new media uses `store-assets`; legacy uploads can remain in the local directory as a fallback.

## Owner About page

Admin → **About** lets the store owner publish a name, title, profile photo, personal story, and up to eight hobbies or interests. The storefront links to the full About page and includes a short owner-story preview on the homepage. Before the first save, a clearly labeled demo profile is shown. Profile photos accept JPG, PNG or WEBP up to 8 MB and are included in the existing uploads backup.

## Shopper help and product feedback

The storefront **Help & safety** page provides searchable FAQ answers, marketplace due-diligence guidance, and a support/report form. Enquiries are stored in the Admin → **Inbox** and open a pre-filled WhatsApp message when the admin WhatsApp number is configured. The FAQ uses curated answers and local search; it does not call a generative AI service.

Shoppers can submit a rating and comment from a product page. Reviews remain pending until approved in the Admin inbox. The database retains the 10 most recent feedback submissions per product, based on submission time; the public product page shows up to 10 latest approved reviews in a horizontal, collapsible panel. New enquiry and review records are included in admin ZIP backups; older backups without these records restore with empty inboxes.

