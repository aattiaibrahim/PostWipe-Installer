# PostWipe accounts

Optional accounts for PostWipe Installer: sign-in with authenticator-app 2FA and backup codes, plus synced **favorites**, **named sets** and **settings**.

Built on [Better Auth](https://github.com/better-auth/better-auth) (MIT) running as a Cloudflare Worker with a D1 database, on the free plan. It never pauses when idle, unlike the free tiers of Supabase and Appwrite.

## How the app talks to it

All requests go through Rust (`src-tauri/src/accounts/`), not the webview:

- The session is a **bearer token** (Better Auth's `bearer` plugin), stored in the app config dir as `account-session`.
- Better Auth holds the "password OK, now enter your code" step in a **cookie**. A webview won't keep a cross-origin cookie, so reqwest's cookie jar holds it instead.
- Requests send the Worker's own URL as `Origin`, which Better Auth always trusts.

## Free-plan gotcha: password hashing

Workers on the free plan get **10 ms of CPU per request**. Better Auth's built-in scrypt is pure JavaScript (~80 ms), so every sign-up and sign-in would be killed ([better-auth#8860](https://github.com/better-auth/better-auth/issues/8860)). `src/password.ts` uses the runtime's native `node:crypto` scrypt instead (hence `nodejs_compat`). It keeps the same parameters and `salt:key` format as Better Auth's default, so existing hashes stay valid if you ever switch back.

**This can only be confirmed once deployed.** `wrangler dev` doesn't enforce the CPU limit. After deploying, run the e2e test against the real URL and watch for `exceeded CPU time limit` in `npx wrangler tail`.

## Deploy (first time)

```bash
cd accounts-api
npm install
npx wrangler d1 create postwipe-accounts           # paste the database_id into wrangler.toml
npx wrangler d1 migrations apply postwipe-accounts --remote
npx wrangler secret put BETTER_AUTH_SECRET         # any 32+ random bytes, e.g. `openssl rand -hex 32`
npx wrangler deploy
node test/e2e.mjs https://postwipe-accounts.andrewattiaibrahim.workers.dev
```

If the Worker ends up on a different URL, update `BETTER_AUTH_URL` in `wrangler.toml` **and** `DEFAULT_BASE_URL` in `src-tauri/src/accounts/mod.rs`.

## Local development

```bash
npx wrangler d1 migrations apply postwipe-accounts --local
npx wrangler dev                 # reads BETTER_AUTH_SECRET from .dev.vars (gitignored)
node test/e2e.mjs                # 22 checks: sign-up, sync conflicts, 2FA, backup codes, deletion

# Rust client against the same local Worker:
cd ../src-tauri && cargo test --lib -- --ignored accounts_client

# The desktop app against it (debug builds only):
POSTWIPE_ACCOUNTS_URL=http://127.0.0.1:8787 npm run tauri dev
```

## Changing the schema

The auth tables are generated from the live config, so they can't drift from it:

```bash
npm run schema    # rewrites migrations/0001_better_auth.sql from src/auth.ts
```

For changes after the first deploy, add a new numbered migration instead of editing an applied one.

## Not built yet

- **Email** (verification, password reset). This needs a domain to send from. Until then, a forgotten password can't be recovered; the sign-up screen says so. When a domain exists, wire Cloudflare Email Service into `emailAndPassword.sendResetPassword` and set `requireEmailVerification: true`.
