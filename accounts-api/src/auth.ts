import { betterAuth, type BetterAuthOptions } from "better-auth";
import { bearer, twoFactor } from "better-auth/plugins";
import { hashPassword, verifyPassword } from "./password.ts";

/** Everything that defines the database SCHEMA lives here, so the Worker and the schema
 *  generator (scripts/generate-schema.mjs) can never drift apart — a plugin added in one
 *  place and not the other would mean a table the running Worker expects but D1 lacks. */
export function authOptions(database: BetterAuthOptions["database"]): BetterAuthOptions {
  return {
    appName: "PostWipe Installer",
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // No email sender exists yet (no domain), so verification can't be required — a user
      // who had to click a link would be locked out forever. Flip this on once one is wired.
      requireEmailVerification: false,
      password: {
        // Better Auth's default scrypt is pure JavaScript (~80ms). Workers on the free plan
        // get 10ms of CPU per request and kill anything slower, so every sign-up and sign-in
        // would fail with "exceeded CPU time limit". See password.ts.
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    // Privacy: sessions would otherwise store each sign-in's IP address and User-Agent. The
    // app never uses them, so they're blanked before the row is written. (Rate limiting still
    // works — it keys its own short-lived counters by IP, separately.)
    databaseHooks: {
      // Accounts carry no name. The app never sends one, and this makes sure nobody calling the
      // API directly can store one either (or anything else in that column).
      user: {
        create: {
          before: async (user) => ({ data: { ...user, name: "", image: null } }),
        },
      },
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    user: {
      // "Delete my account" in the app. People trusting a hobby project with an email
      // address should be able to take it back without asking anyone.
      deleteUser: { enabled: true },
    },
    session: {
      // A post-wipe tool is opened rarely. A short session would mean re-entering the password
      // and a 2FA code nearly every time, which is exactly when people abandon an account.
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24 * 7,
    },
    advanced: {
      ipAddress: {
        // Rate limits are keyed by client IP, and Better Auth skips limiting entirely when it
        // can't find one. Cloudflare always sets cf-connecting-ip to the real client address;
        // x-forwarded-for is kept as the fallback for `wrangler dev`.
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    rateLimit: {
      enabled: true,
      // In-memory limits don't work on Workers: each isolate would keep its own counters.
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        // Sign-ups are open to anyone, so these are the endpoints a bot would hammer.
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/sign-in/email": { window: 60, max: 8 },
        "/two-factor/verify-totp": { window: 60, max: 8 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        // Everything that checks the password of a signed-in account. A stolen session token
        // must not become an unlimited password-guessing oracle.
        "/two-factor/enable": { window: 60, max: 5 },
        "/two-factor/disable": { window: 60, max: 5 },
        "/two-factor/generate-backup-codes": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 5 },
      },
    },
    plugins: [
      twoFactor({
        issuer: "PostWipe Installer",
        // backupCodes default: 10 single-use codes, stored encrypted.
      }),
      // The desktop app authenticates with `Authorization: Bearer <token>` instead of a
      // session cookie; cookies don't survive the cross-origin hop out of Tauri's webview.
      bearer(),
    ],
  };
}

export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

export function createAuth(env: Env) {
  return betterAuth({
    ...authOptions(env.DB),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // The desktop app never sends a browser Origin; its Rust client sends the Worker's own
    // URL, which is trusted implicitly. Nothing else should be calling this API with cookies.
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;
