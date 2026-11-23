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

Configure Supabase Auth email delivery, require email confirmation, and allow the exact `/auth/callback` redirect URL in Supabase Auth URL settings. Set the site's canonical URL to `NEXT_PUBLIC_SITE_URL` in production. See [Fixing production Auth email links](#fixing-production-auth-email-links) if a message points to localhost.

Supabase Auth is the sole identity and password provider. Admin/vendor roles are stored in server-managed Supabase `app_metadata`; vendor profiles and applications remain in Supabase Postgres. Existing pending applications can be approved by inviting the applicant through Supabase Auth. New vendor applications work with or without email confirmation enabled; when enabled, the vendor confirms the address before signing in.

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
- After completion, vendors can send customers a secure receipt confirmation link via WhatsApp or copy it to another channel. The link expires after 30 days, and the admin dashboard displays the customer's acknowledgement and raises an in-app notification while an admin is signed in.

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

