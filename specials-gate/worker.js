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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return cors(json({ ok: false, error: "method" }, 405));

    // Unauthenticated liveness check so you can confirm the deploy from a browser.
    if (url.pathname === "/health") return cors(json({ ok: true }));

    const provided = url.searchParams.get("key") ?? request.headers.get("X-Specials-Key") ?? "";
    if (!timingSafeEqual(provided, env.SPECIALS_KEY ?? "")) {
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
      headers.set("content-disposition", `attachment; filename="${objectKey.split("/").pop()}"`);
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
