# PostWipe Specials gate (Cloudflare R2 + Worker)

This folder is the **gatekeeper** for the Specials files. Files live in a private R2 bucket;
this Worker checks a key before serving any of them. The key is given to friends out-of-band
(Discord/text) and typed into the app — it is never shipped in the app or committed here, so
someone snooping the public app/repo finds nothing usable.

**Everything in here is safe to be public** — the only secret is set separately via `wrangler secret`.

---

## One-time setup (you do this once)

### 1. Cloudflare account + R2
- Make a free Cloudflare account, then enable **R2** (dashboard → R2). R2's free tier is
  10 GB storage + free egress, which covers the whole Specials set.
- Create a bucket named **`postwipe-specials`** (or pick your own name and update
  `wrangler.toml`'s `bucket_name`).

### 2. Prep the files
Some Specials are folders; the app downloads one file per item, so zip those first:
- **Cursor packs** → zip each pack folder (the one containing `install.inf`) into a single
  `.zip`. Upload as `cursors/<slug>.zip`.
- **Windows sound sets** → zip each set's `.wav` folder into `sounds/anime.zip`, `sounds/ubuntu.zip`.
- **Fonts** → already `.zip` (Mononoki, etc.); upload as `fonts/<slug>.zip`.
- **Steam profiles** → already `.rar`; upload as `steam/<slug>.rar`.
- **PSD** → the single `.psd`; upload as `psd/<name>.psd`.
- **Previews** (optional but nice): drop preview images/gifs at `previews/<slug>.<png|gif>`.
  Where a pack has no preview, just don't upload one — the app shows "no preview available".

Object paths are up to you, but keep the `category/slug.ext` shape — I'll match the catalog
entries to whatever you upload, so **send me the final list of object paths** (see step 5).

### 3. Upload to R2
Easiest for many files is [`rclone`](https://rclone.org/) with an R2 remote, or just drag-drop
in the R2 dashboard for a first test. To start, upload **one cursor pack + one font** so we can
verify the whole flow before you do all 26.

### 4. Deploy the Worker
From inside this `specials-gate/` folder:
```
npm install -g wrangler        # if you don't have it
wrangler login                 # opens a browser to authorize
wrangler secret put SPECIALS_KEY   # paste the friend-key you'll hand out; press enter
wrangler deploy                # prints your Worker URL
```
The deploy prints a URL like `https://postwipe-specials-gate.<your-subdomain>.workers.dev`.

### 5. Confirm it works and send me two things
```
# should print {"ok":true}
curl https://postwipe-specials-gate.<you>.workers.dev/health

# should 401 with the wrong key, 200 {"ok":true} with the right one
curl "https://postwipe-specials-gate.<you>.workers.dev/validate?key=WRONG"
curl "https://postwipe-specials-gate.<you>.workers.dev/validate?key=YOURKEY"
```
Then send me:
1. **The Worker URL.**
2. **A test key** (or just confirm `/validate` works — I only need a key to live-test; you can
   rotate it afterward with `wrangler secret put SPECIALS_KEY`).
3. **The list of object paths** you uploaded (e.g. `cursors/night-diamond.zip`, `fonts/mononoki.zip`).

With those, I'll wire the app's Specials unlock to `/validate`, point each Specials item at
`/file/<path>?key=…`, and live-test download → install end-to-end.

---

## Contract the app relies on
| Request | Response |
|---|---|
| `GET /health` | `200 {"ok":true}` (no key) |
| `GET /validate?key=<KEY>` | `200 {"ok":true}` or `401` |
| `GET /file/<object-path>?key=<KEY>` | `200 <bytes>`, `401`, or `404` |

Key may also be sent as an `X-Specials-Key` header. HTTPS encrypts it in transit; it's a shared
friend-key, not a per-user secret, so a key in the URL is an acceptable tradeoff here.

## Rotating the key
`wrangler secret put SPECIALS_KEY` with a new value, redeploy is not needed. Tell friends the new
key. Old key stops working immediately.
