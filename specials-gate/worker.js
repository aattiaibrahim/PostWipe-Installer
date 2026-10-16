/**
 * PostWipe Specials gate — a tiny Cloudflare Worker that guards the Specials files in R2.
 *
 * The secret (SPECIALS_KEY) lives ONLY as a Worker secret — never in this file, never in
 * the app, never in the repo. Friends receive the key from you out-of-band and type it into
 * the app's Specials prompt; the app sends it here on every request. Someone who snoops the
 * public app finds no usable credential, which is the whole point.
 *
 * Contract (the app depends on exactly this):
 *   GET /health                      -> 200 {"ok":true}                (no key; confirms deploy)
 *   GET /validate?key=<KEY>          -> 200 {"ok":true} | 401          (unlock check)
 *   GET /file/<object-path>?key=<KEY>-> 200 <file bytes> | 401 | 404   (gated download)
 *
 * The key may also be sent as an `X-Specials-Key` header instead of the `?key=` param.
 */

// Password guessing. The key is shared among friends, so it can't be rotated per person, and
// nothing else stops a script from trying keys as fast as it can send requests.
//   - Every wrong key from an IP counts. After MAX_FAILURES within LOCKOUT_MS, that IP is locked
//     out of EVERYTHING (right key included) until the window passes — otherwise a guesser
//     would still learn which guess was right.
//   - The counts live in isolate memory, so they're per Cloudflare location and reset when the
//     isolate recycles. The KEY_LIMITER rate-limit binding (wrangler.toml) is the cross-isolate
//     backstop: tripping it also locks the IP out here.
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, first, lockedUntil }

function lockedOut(ip, now) {
  const entry = failures.get(ip);
  if (!entry) return 0;
  if (entry.lockedUntil > now) return Math.ceil((entry.lockedUntil - now) / 1000);
  if (now - entry.first > LOCKOUT_MS) failures.delete(ip);
  return 0;
}

async function recordFailure(ip, env, now) {
  let entry = failures.get(ip);
  if (!entry || now - entry.first > LOCKOUT_MS) entry = { count: 0, first: now, lockedUntil: 0 };
  entry.count += 1;
  let tripped = entry.count >= MAX_FAILURES;
  if (env.KEY_LIMITER) {
    const { success } = await env.KEY_LIMITER.limit({ key: ip });
    if (!success) tripped = true;
  }
  if (tripped) entry.lockedUntil = now + LOCKOUT_MS;
  failures.set(ip, entry);
  // Keep memory bounded if something sprays from many addresses.
  if (failures.size > 10000) failures.delete(failures.keys().next().value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return cors(json({ ok: false, error: "method" }, 405));

    // Unauthenticated liveness check so you can confirm the deploy from a browser.
    if (url.pathname === "/health") return cors(json({ ok: true }));

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const now = Date.now();
    const wait = lockedOut(ip, now);
    if (wait) {
      const res = json({ ok: false, error: "too-many-attempts" }, 429);
      res.headers.set("Retry-After", String(wait));
      return cors(res);
    }

    const provided = url.searchParams.get("key") ?? request.headers.get("X-Specials-Key") ?? "";
    // An unset secret must never mean "an empty key unlocks everything".
    if (!env.SPECIALS_KEY || !timingSafeEqual(provided, env.SPECIALS_KEY)) {
      await recordFailure(ip, env, now);
      return cors(json({ ok: false, error: "unauthorized" }, 401));
    }

    if (url.pathname === "/validate") return cors(json({ ok: true }));

    // Enumerate objects (optionally under ?prefix=). Lets the app show what's actually
    // available and lets setup confirm uploads landed. Gated by the key like everything else.
    if (url.pathname === "/list") {
      const prefix = url.searchParams.get("prefix") ?? undefined;
      const listing = await env.SPECIALS_BUCKET.list({ prefix, limit: 1000 });
      return cors(
        json({
          ok: true,
          truncated: listing.truncated,
          objects: listing.objects.map((o) => ({ key: o.key, size: o.size })),
        }),
      );
    }

    if (url.pathname.startsWith("/file/")) {
      const objectKey = decodeURIComponent(url.pathname.slice("/file/".length));
      if (!objectKey || objectKey.includes("..")) return cors(json({ ok: false, error: "bad-path" }, 400));

      const object = await env.SPECIALS_BUCKET.get(objectKey);
      if (!object) return cors(json({ ok: false, error: "not-found" }, 404));

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      // RFC 5987 encoding: a quote or newline in an object name can't break out of the header.
      const name = objectKey.split("/").pop();
      headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      headers.set("X-Content-Type-Options", "nosniff");
      return cors(new Response(object.body, { headers }));
    }

    return cors(json({ ok: false, error: "not-found" }, 404));
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function cors(res) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "X-Specials-Key");
  return res;
}

// Constant-time comparison so an attacker can't recover the key one byte at a time via timing.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}
