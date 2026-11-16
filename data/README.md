# Fussion runtime data

These JSON files are server-side application storage and are not part of the public asset tree.

- `products.json` — marketplace catalog
- `vendors.json` — approved seller accounts
- `vendor_requests.json` — pending/rejected seller applications
- `users_auth.json` — authentication records; admin email/username values are encrypted
- `orders.json` — WhatsApp checkout/order records
- `analytics.json` — product engagement events
- `likes.json` — visitor like state
- `counters.json` — sequential IDs

Do not commit production secrets, API keys or passwords to this directory.
