// Adversarial checks against the accounts API: what someone with curl and bad intentions
// would try. Every check asserts the attack FAILS.
//
//   node test/attack.mjs                       (against `wrangler dev` on 127.0.0.1:8787)
//   node test/attack.mjs https://…workers.dev  (deployed; only the non-flooding checks run)
//
// Locally, each scenario sends its own X-Forwarded-For so rate limits don't bleed between
// them (`wrangler dev` has no cf-connecting-ip). In production Cloudflare sets
// cf-connecting-ip itself, which the Worker reads first, so that header can't be spoofed.
import * as OTPAuth from "otpauth";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok " : "FAIL "} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
let ipSeq = 1;
const NET = Math.floor(Math.random() * 250);
function client(ip = `198.51.${NET}.${ipSeq++}`) {
  let token = null;
  const jar = new Map();
  async function call(method, path, body, extra = {}) {
    const headers = { Origin: BASE, "X-Forwarded-For": ip, ...extra };
    const raw = typeof body === "string" || body instanceof ReadableStream;
    if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      duplex: "half",
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const issued = res.headers.get("set-auth-token");
    if (issued) token = issued;
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    call,
    get token() {
      return token;
    },
    set token(t) {
      token = t;
    },
    forget() {
      token = null;
      jar.clear();
    },
  };
}

const stamp = Date.now();
const password = "correct horse battery staple";
console.log(`attack checks against ${BASE}\n`);

// ── session forgery and 2FA bypass ────────────────────────────────────────────────────
const forger = client();
forger.token = "not-a-real-token.abc";
let r = await forger.call("GET", "/api/profile");
check("a made-up bearer token gets no profile", r.status === 401, `${r.status}`);

const victim = client();
const victimEmail = `victim-${stamp}@example.test`;
await victim.call("POST", "/api/auth/sign-up/email", { email: victimEmail, password, name: "" });
r = await victim.call("POST", "/api/auth/two-factor/enable", { password });
const totp = OTPAuth.URI.parse(r.json.totpURI);
const firstCodes = r.json.backupCodes;
await victim.call("POST", "/api/auth/two-factor/verify-totp", { code: totp.generate() });
await victim.call("PUT", "/api/profile", { favorites: ["steam"], sets: [], settings: {}, baseUpdatedAt: 0 });

const thief = client();
r = await thief.call("POST", "/api/auth/sign-in/email", { email: victimEmail, password });
check("the right password alone (2FA on) issues no session token", r.json?.twoFactorRedirect === true && !thief.token, r.text);
r = await thief.call("GET", "/api/profile");
check("…and the pending 2FA cookie can't read the profile", r.status === 401, `${r.status}`);
r = await thief.call("GET", "/api/auth/get-session");
check("…or get a session", !r.json?.session, r.text);

// ── account isolation (IDOR) ──────────────────────────────────────────────────────────
const nosy = client();
await nosy.call("POST", "/api/auth/sign-up/email", { email: `nosy-${stamp}@example.test`, password, name: "" });
r = await nosy.call("GET", `/api/profile?userId=${encodeURIComponent("anything")}`);
check("a query-string user id is ignored", r.status === 200 && r.json.favorites.length === 0, r.text);
r = await nosy.call("PUT", "/api/profile", { userId: "someone-else", favorites: ["x"], sets: [], settings: {}, baseUpdatedAt: 0 });
check("a body user id can't redirect a write", r.status === 200);
r = await victim.call("GET", "/api/profile");
check("the victim's favorites are untouched", JSON.stringify(r.json?.favorites) === '["steam"]', r.text);

// ── stored data can't smuggle markup or names ─────────────────────────────────────────
const sneaky = client();
r = await sneaky.call("POST", "/api/auth/sign-up/email", { email: `sneaky-${stamp}@example.test`, password, name: "<img src=x onerror=alert(1)>", image: "https://evil.example/x.png" });
check("a name sent straight to the API is not stored", r.json?.user?.name === "" && !r.json?.user?.image, JSON.stringify(r.json?.user));
r = await sneaky.call("PUT", "/api/profile", {
  favorites: [],
  sets: [{ id: "s1", name: "<script>alert(1)</script>", apps: { windows: ["steam'; DROP TABLE user;--"], macos: [] } }],
  settings: {},
  baseUpdatedAt: 0,
});
check("SQL in an app id is rejected by validation", r.status === 400, `${r.status} ${r.text}`);
r = await sneaky.call("PUT", "/api/profile", { favorites: [], sets: [], settings: { theme: "x\" onload=\"alert(1)" }, baseUpdatedAt: 0 });
check("markup in a theme id is rejected", r.status === 400, `${r.status}`);

// ── closed Better Auth endpoints ──────────────────────────────────────────────────────
for (const [method, path, body] of [
  ["POST", "/api/auth/update-user", { name: "pwned", image: "https://evil.example" }],
  ["POST", "/api/auth/change-email", { newEmail: `taken-${stamp}@example.test` }],
  ["POST", "/api/auth/change-password", { currentPassword: password, newPassword: "x".repeat(12) }],
  ["GET", "/api/auth/list-sessions"],
  ["POST", "/api/auth/request-password-reset", { email: victimEmail }],
  ["POST", "/api/auth/two-factor/get-totp-uri", { password }],
]) {
  r = await nosy.call(method, path, body);
  check(`${path} is closed`, r.status === 404, `${r.status} ${r.text.slice(0, 80)}`);
}

// ── oversized and malformed bodies ────────────────────────────────────────────────────
r = await nosy.call("PUT", "/api/profile", JSON.stringify({ favorites: Array(9000).fill("steam"), sets: [], settings: {}, baseUpdatedAt: 0 }), { "Content-Type": "application/json" });
check("a body over 64 KB is refused", r.status === 413, `${r.status}`);
const stream = new ReadableStream({
  start(ctl) {
    ctl.enqueue(new TextEncoder().encode('{"favorites":['));
    ctl.enqueue(new TextEncoder().encode('"steam"],"sets":[],"settings":{},"baseUpdatedAt":0}'));
    ctl.close();
  },
});
r = await nosy.call("PUT", "/api/profile", stream, { "Content-Type": "application/json" });
check("a streamed body with no declared length still goes through the size cap", r.status === 200 || r.status === 409, `${r.status}`);
const big = new ReadableStream({
  start(ctl) {
    for (let i = 0; i < 20; i++) ctl.enqueue(new TextEncoder().encode("x".repeat(8192)));
    ctl.close();
  },
});
r = await nosy.call("PUT", "/api/profile", big, { "Content-Type": "application/json" });
check("a streamed body over 64 KB with no declared length is refused", r.status === 413, `${r.status}`);
// `wrangler dev`'s proxy drops the next request on a connection whose upload was cut off
// mid-stream (Cloudflare's edge closes it instead). Spend that request on a throwaway call.
await nosy.call("GET", "/").catch(() => {});
r = await nosy.call("PUT", "/api/profile", "{not json", { "Content-Type": "application/json" });
check("malformed JSON is a 400, not a crash", r.status === 400, `${r.status}`);
r = await nosy.call("GET", "/api/stats/popular?os=windows%27%20OR%201=1--&limit=1");
check("SQL in the popular query is rejected", r.status === 400, `${r.status}`);
r = await nosy.call("GET", "/api/stats/popular?os=windows&limit=-999999&days=NaN");
check("nonsense limits don't error", r.status === 200, `${r.status}`);

// ── response hardening ────────────────────────────────────────────────────────────────
r = await nosy.call("GET", "/api/profile", undefined, { Origin: "https://evil.example" });
check("no CORS grant for a foreign site", !r.headers.get("access-control-allow-origin"), r.headers.get("access-control-allow-origin") ?? "");
check("responses aren't cacheable or sniffable", r.headers.get("cache-control") === "no-store" && r.headers.get("x-content-type-options") === "nosniff");
const cookieUser = client();
r = await cookieUser.call("POST", "/api/auth/sign-in/email", { email: victimEmail, password }, { Origin: "https://evil.example" });
check("a sign-in from a foreign Origin is refused (CSRF)", r.status === 403 || r.status === 400, `${r.status} ${r.text.slice(0, 80)}`);

// ── backup codes ──────────────────────────────────────────────────────────────────────
r = await victim.call("POST", "/api/auth/two-factor/generate-backup-codes", { password: "wrong password!!" });
check("new backup codes need the right password", r.status >= 400 && !r.json?.backupCodes, `${r.status}`);
r = await victim.call("POST", "/api/auth/two-factor/generate-backup-codes", { password });
const newCodes = r.json?.backupCodes ?? [];
check("the right password makes a fresh set of codes", r.status === 200 && newCodes.length >= 8 && !newCodes.includes(firstCodes[0]), `${r.status}`);
const replay = client();
await replay.call("POST", "/api/auth/sign-in/email", { email: victimEmail, password });
r = await replay.call("POST", "/api/auth/two-factor/verify-backup-code", { code: firstCodes[1] });
check("an old backup code stops working once replaced", r.status >= 400 && !replay.token, `${r.status}`);

if (LOCAL) {
  // ── brute force ─────────────────────────────────────────────────────────────────────
  const guesser = client();
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    r = await guesser.call("POST", "/api/auth/sign-in/email", { email: victimEmail, password: `guess-${i}-xxxxxx` });
    limited = r.status === 429;
  }
  check("password guessing is rate limited", limited, `${r.status}`);

  let codeLimited = false;
  for (let i = 0; i < 8 && !codeLimited; i++) {
    r = await victim.call("POST", "/api/auth/two-factor/generate-backup-codes", { password: `guess-${i}-xxxxxx` });
    codeLimited = r.status === 429;
  }
  check("a stolen session can't be used to guess the password quickly", codeLimited, `${r.status}`);

  const tfGuesser = client();
  await tfGuesser.call("POST", "/api/auth/sign-in/email", { email: victimEmail, password });
  let totpLimited = false;
  for (let i = 0; i < 12 && !totpLimited; i++) {
    r = await tfGuesser.call("POST", "/api/auth/two-factor/verify-totp", { code: String(100000 + i) });
    totpLimited = r.status === 429;
  }
  check("2FA code guessing is rate limited", totpLimited, `${r.status}`);

  // ── stats flooding ──────────────────────────────────────────────────────────────────
  const flooder = client();
  const floodId = (i) => `flood-${stamp}-${i}`;
  for (let i = 0; i < 160; i++) await flooder.call("POST", "/api/stats/download", { appId: floodId(i), os: "windows" });
  r = await flooder.call("GET", `/api/stats/popular?os=windows&days=${61 + (stamp % 300)}&limit=50`);
  const counted = (r.json?.apps ?? []).filter((a) => a.appId.startsWith(`flood-${stamp}`)).length;
  const late = (r.json?.apps ?? []).some((a) => a.appId === floodId(159));
  check("one connection can't record unlimited made-up downloads", !late, `counted ${counted}`);
}

// ── clean up ──────────────────────────────────────────────────────────────────────────
const cleaner = client();
for (const [who, email] of [
  [victim, victimEmail],
  [nosy, `nosy-${stamp}@example.test`],
  [sneaky, `sneaky-${stamp}@example.test`],
]) {
  if (who === victim) {
    await cleaner.call("POST", "/api/auth/sign-in/email", { email, password });
    await new Promise((d) => setTimeout(d, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000));
    await cleaner.call("POST", "/api/auth/two-factor/verify-totp", { code: totp.generate() });
    await cleaner.call("POST", "/api/auth/delete-user", { password });
    cleaner.forget();
  } else {
    await who.call("POST", "/api/auth/delete-user", { password });
  }
}

console.log(`\n${failures === 0 ? "all attacks failed, as they should" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
