# Fussion Store

Fussion Store is a Next.js 16 marketplace using JSON persistence and WhatsApp checkout.

## Marketplace upgrade

- Public vendor registration with pending approval.
- Secure vendor authentication using HTTP-only signed session cookies and Node scrypt password hashing.
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

## JSON persistence

Runtime data lives in `data/` by default and is not inside `public/`, so private JSON files are not public assets. Set `FUSSION_DATA_DIR` to a persistent writable directory on production hosting. `lib/json-store.ts` provides file locking, atomic replacement and backup files. Runtime JSON is kept in this single server-side data directory; the old duplicate `app/(public)/components/data` JSON store has been removed.

The storage API is intentionally isolated so it can later be replaced with SQLite/MySQL without changing marketplace business rules.

## Admin backups and upgrade announcements

Admin → **Backups** downloads a ZIP containing the store's JSON data and files under `public/uploads/`. The backup includes account password hashes, so store it securely; encryption/session keys are not included and must be retained separately. Restore accepts only ZIPs produced in this format, verifies file checksums and paths, replaces current data/uploads, revokes reset links and invalidates saved sessions. JSON files are backed up before replacement. Archives are limited to 100 MB compressed and 250 MB expanded.

Admin → **Upgrade notice** publishes a text announcement in the storefront and vendor dashboard. It is an in-app notice only and does not send email or SMS.

## Admin authentication

The first administrator is created at `/admin/register`. Registration is disabled after an active admin exists. Admin records use encrypted email/username fields plus deterministic hashes for lookup and duplicate detection; passwords are one-way scrypt hashes and are never stored in plaintext.

Admin sign-in uses the administrator username and password. Passwords are stored as one-way scrypt hashes; the username is encrypted at rest.

Required server environment variables:

- `FUSSION_AUTH_ENCRYPTION_KEY` — optional secret used to encrypt the admin username at rest; a server-only local key is generated if omitted.
- `FUSSION_SESSION_SECRET` — random secret of at least 32 bytes used to sign HTTP-only sessions. Production startup fails if it is missing, too short, or set to the previously hardcoded default. Generate one with `node -p "require('crypto').randomBytes(32).toString('base64url')"` and keep it private.
- `FUSSION_DATA_DIR` (recommended for persistent hosting)

Optional environment fallback: `FUSSION_ADMIN_USERNAME` and `FUSSION_ADMIN_PASSWORD`. Prefer creating the administrator through `/admin/register`.

Do not put encryption keys, session secrets or passwords in JSON or client-side code.

New passwords are checked against the Have I Been Pwned password corpus through its k-anonymity range API. Only the first five characters of a SHA-1 digest are sent; the password and full digest remain on the server. Password creation/change/reset fails explicitly if the check service is unavailable.

## Password recovery

Admins and vendors can change a password from the **Security** section of their dashboard, using their current password. This rotates the account's session version, signing out existing sessions. Reset links are single-use, expire after 30 minutes, and are rate-limited per recovery email.

Email reset links use Resend. Configure these server-side environment variables before enabling email recovery:

- `RESEND_API_KEY` — Resend API key; keep it private and out of source control.
- `RESEND_FROM_EMAIL` — a sender address verified in Resend, such as `Store Support <support@your-domain.com>`.
- `NEXT_PUBLIC_SITE_URL` — the canonical HTTPS storefront URL used in reset links.
- `FUSSION_ADMIN_RECOVERY_EMAIL` — optional recovery address for the persisted admin account. Admins can also set/update a recovery address from Security while changing their password.

Vendors use the email on their account. Admins configured only through `FUSSION_ADMIN_USERNAME` / `FUSSION_ADMIN_PASSWORD` must migrate to a persisted admin account to change or reset their password in the dashboard.

## Development

```bash
npm install
npm run dev
```

## Important deployment note

JSON storage requires persistent writable hosting. On serverless platforms with ephemeral filesystems, configure a persistent volume or move the storage adapter to SQLite/MySQL when the marketplace outgrows local JSON storage.

## Vendor applications from the storefront

The storefront now includes **Sell on Fussion**. The basic vendor application is saved to `data/vendor_requests.json`, appears in the Admin Dashboard under Vendor applications, and returns a WhatsApp handoff URL for the configured admin WhatsApp number.

Set `FUSSION_ADMIN_WHATSAPP` to the admin WhatsApp number in international digits only, for example `2348012345678`. The application itself remains stored in JSON even if WhatsApp is not configured.

## Encryption fallback

`FUSSION_AUTH_ENCRYPTION_KEY` is recommended for production. If it is not present, the auth module first uses `FUSSION_SESSION_SECRET`; if neither is configured, it creates a server-only `.auth-secret` inside the private `data/` directory so first-time admin registration does not fail with an encryption-key configuration error. Do not expose `data/` publicly or delete `.auth-secret` after an admin has registered.

## Vendor approval and sales workflow (v12 update)

- A storefront application is saved with a unique `VREQ0001`-style application ID and its password is stored only as a Node scrypt hash. The application ID and business details are included in the WhatsApp handoff to `FUSSION_ADMIN_WHATSAPP`; no password or password hash is sent.
- In Admin → Vendors, enter the application ID from WhatsApp, then choose Approve or Reject. Approval creates the vendor account and a separate `VEN0001`-style vendor ID. Pending application hashes are removed after a decision.
- Vendors acknowledge each vendor-specific order, move it to Processing, and finally confirm the completed sale. Rejected/cancelled orders do not count as revenue.
- Every vendor order has its own `ORD000001`-style ID and shares the customer's checkout reference across a multi-vendor cart.
- Inventory is deducted only when a vendor confirms completion; the order is atomically claimed during completion to prevent double deduction from repeated clicks.

Vendor passwords are hashed with scrypt and per-password random salts. Admin passwords use the same one-way hashing implementation. Neither password is stored or sent in readable form.


## Storefront music and media uploads (v14 repair)

- Admin → Music has a global storefront Play/Pause switch. Open storefront pages check the setting every 5 seconds; pausing stops their current audio. A shopper must still initiate playback once because browsers block unsolicited autoplay with sound.
- Audio upload accepts genuine MP3 (.mp3), M4A (.m4a), OGG (.ogg), WAV (.wav) and WebM audio (.webm) files up to 50 MB. MP3 is recommended.
- Product photos accept JPG/JPEG, PNG, WEBP, GIF and AVIF, up to 12 MB per image and 7 images per product upload. Use actual image files, not URLs, PDFs, SVGs or HEIC/HEIF photos. Convert iPhone HEIC images to JPG or PNG first.
- Next.js Server Action request limit is set to 100 MB to support multiple photos or larger music files in one submission.
- Uploaded files are stored under `public/uploads/` and `public/uploads/music/`. On production, use a persistent writable disk/volume and back up these folders along with the JSON data directory; ephemeral serverless storage will not retain uploads across redeploys.

## Owner About page

Admin → **About** lets the store owner publish a name, title, profile photo, personal story, and up to eight hobbies or interests. The storefront links to the full About page and includes a short owner-story preview on the homepage. Before the first save, a clearly labeled demo profile is shown. Profile photos accept JPG, PNG or WEBP up to 8 MB and are included in the existing uploads backup.

## Shopper help and product feedback

The storefront **Help & safety** page provides searchable FAQ answers, marketplace due-diligence guidance, and a support/report form. Enquiries are stored in the Admin → **Inbox** and open a pre-filled WhatsApp message when the admin WhatsApp number is configured. The FAQ uses curated answers and local search; it does not call a generative AI service.

Shoppers can submit a rating and comment from a product page. Reviews remain pending until approved in the Admin inbox. The JSON store retains the 10 most recent feedback submissions per product, based on submission time; the public product page shows up to 10 latest approved reviews in a horizontal, collapsible panel. New enquiry and review records are included in admin ZIP backups; older backups without these files restore with empty inboxes.
