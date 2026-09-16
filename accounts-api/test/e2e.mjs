// End-to-end check of the accounts API, driven exactly the way the desktop app drives it:
// a bearer token for the session, a hand-managed cookie jar for the one step Better Auth
// keeps in a cookie (the pending 2FA challenge), and the Worker's own URL as Origin.
//
//   node test/e2e.mjs                       (against `wrangler dev` on 127.0.0.1:8787)
//   node test/e2e.mjs https://…workers.dev   (against the deployed Worker)
//
// Creates throwaway accounts and deletes them again at the end.
import * as OTPAuth from "otpauth";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
let failures = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "  ok " : "FAIL "} ${label}${!condition && detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

/** One client = one installed app: its own session token and cookie jar. */
function client() {
  let token = null;
  const jar = new Map();
  async function call(method, path, body) {
    const headers = { Origin: BASE };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json, text };
  }
  return { call, get token() { return token; }, forget() { token = null; jar.clear(); } };
}

const totpFor = (uri) => OTPAuth.URI.parse(uri);
const stamp = Date.now();
const email = `e2e-${stamp}@example.test`;
const password = "correct horse battery staple";

const app = client();

console.log(`accounts e2e against ${BASE}\n`);

// ── sign-up and profile basics ────────────────────────────────────────────────────────
let r = await app.call("POST", "/api/auth/sign-up/email", { email, password, name: "E2E" });
check("sign-up succeeds and issues a bearer token", r.status === 200 && !!app.token, `${r.status} ${r.text}`);

r = await app.call("POST", "/api/auth/sign-up/email", { email: `short-${stamp}@example.test`, password: "short", name: "x" });
check("sign-up rejects a password under 10 characters", r.status >= 400, `${r.status}`);

r = await app.call("GET", "/api/profile");
check("new account starts with an empty profile", r.status === 200 && r.json.favorites.length === 0 && r.json.updatedAt === 0, r.text);

const profile = {
  favorites: ["obsidian", "7-zip", "obsidian"],
  sets: [{ id: "gaming", name: "Gaming rig", apps: { windows: ["steam", "battlenet"], macos: [] } }],
  settings: { theme: "dracula", backdrop: "native", soundEnabled: false, junk: "dropped" },
  baseUpdatedAt: 0,
};
r = await app.call("PUT", "/api/profile", profile);
check("profile saves", r.status === 200, r.text);
check("duplicate favorites are collapsed", r.json?.favorites?.length === 2, JSON.stringify(r.json?.favorites));
check("unknown settings keys are dropped", r.json && !("junk" in r.json.settings), JSON.stringify(r.json?.settings));
const savedAt = r.json?.updatedAt;

r = await app.call("PUT", "/api/profile", { ...profile, baseUpdatedAt: 0 });
check("a stale write is refused with 409 and the newer copy", r.status === 409 && r.json?.profile?.updatedAt === savedAt, `${r.status}`);

r = await app.call("PUT", "/api/profile", { ...profile, favorites: ["../../etc/passwd"], baseUpdatedAt: savedAt });
check("an invalid app id is rejected", r.status === 400, `${r.status} ${r.text}`);

// ── two-factor setup ──────────────────────────────────────────────────────────────────
r = await app.call("POST", "/api/auth/two-factor/enable", { password });
check("2FA enable returns an authenticator URI and backup codes", r.status === 200 && !!r.json?.totpURI && r.json?.backupCodes?.length >= 8, `${r.status} ${r.text}`);
const totp = r.json?.totpURI ? totpFor(r.json.totpURI) : null;
const backupCodes = r.json?.backupCodes ?? [];

r = await app.call("POST", "/api/auth/two-factor/verify-totp", { code: "000000" });
check("a wrong authenticator code is rejected", r.status >= 400, `${r.status}`);

r = await app.call("POST", "/api/auth/two-factor/verify-totp", { code: totp?.generate() });
check("the authenticator code confirms 2FA setup", r.status === 200, `${r.status} ${r.text}`);

r = await app.call("GET", "/api/auth/get-session");
check("the account now reports 2FA enabled", r.json?.user?.twoFactorEnabled === true, r.text);

// ── signing back in with 2FA ──────────────────────────────────────────────────────────
await app.call("POST", "/api/auth/sign-out", {});
app.forget();

r = await app.call("GET", "/api/profile");
check("signed out, the profile is refused", r.status === 401, `${r.status}`);

r = await app.call("POST", "/api/auth/sign-in/email", { email, password: "wrong password here" });
check("a wrong password is rejected", r.status === 401, `${r.status}`);

r = await app.call("POST", "/api/auth/sign-in/email", { email, password });
check("the right password asks for the second factor, without a session yet", r.status === 200 && r.json?.twoFactorRedirect === true && !app.token, `${r.status} ${r.text}`);

// TOTP codes may be single-use per 30s window, so wait for a fresh one after setup used one.
await new Promise((done) => setTimeout(done, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000));
r = await app.call("POST", "/api/auth/two-factor/verify-totp", { code: totp?.generate() });
check("the authenticator code completes sign-in", r.status === 200 && !!app.token, `${r.status} ${r.text}`);

r = await app.call("GET", "/api/profile");
check("the synced profile comes back after signing in again", r.status === 200 && r.json?.settings?.theme === "dracula", r.text);

// ── backup code ───────────────────────────────────────────────────────────────────────
await app.call("POST", "/api/auth/sign-out", {});
app.forget();
await app.call("POST", "/api/auth/sign-in/email", { email, password });
r = await app.call("POST", "/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] });
check("a backup code works when the phone is lost", r.status === 200 && !!app.token, `${r.status} ${r.text}`);

await app.call("POST", "/api/auth/sign-out", {});
app.forget();
await app.call("POST", "/api/auth/sign-in/email", { email, password });
r = await app.call("POST", "/api/auth/two-factor/verify-backup-code", { code: backupCodes[0] });
check("the same backup code can't be used twice", r.status >= 400 && !app.token, `${r.status}`);
r = await app.call("POST", "/api/auth/two-factor/verify-backup-code", { code: backupCodes[1] });

// ── isolation between accounts ────────────────────────────────────────────────────────
const other = client();
await other.call("POST", "/api/auth/sign-up/email", { email: `other-${stamp}@example.test`, password, name: "Other" });
r = await other.call("GET", "/api/profile");
check("a different account can't see the first account's favorites", r.status === 200 && r.json.favorites.length === 0, r.text);

// ── deletion ──────────────────────────────────────────────────────────────────────────
r = await app.call("POST", "/api/auth/delete-user", { password });
check("the account can be deleted", r.status === 200, `${r.status} ${r.text}`);
app.forget();
r = await app.call("POST", "/api/auth/sign-in/email", { email, password });
check("a deleted account can't sign in", r.status === 401, `${r.status}`);
await other.call("POST", "/api/auth/delete-user", { password });

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
