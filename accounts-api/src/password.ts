import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing that fits inside a free-plan Worker.
 *
 * Better Auth's built-in hasher runs scrypt in pure JavaScript, which takes around 80ms. The
 * Workers free plan allows 10ms of CPU per request and terminates anything slower, so sign-up
 * and sign-in fail outright (better-auth/better-auth#8860). The runtime's NATIVE scrypt
 * (via `nodejs_compat`) does the same work far faster.
 *
 * Parameters and the `salt:key` hex format deliberately match Better Auth's own defaults, so
 * stored hashes stay valid if this is ever swapped back to the built-in hasher (for instance
 * after moving to the paid plan, where CPU time stops being a constraint).
 */
const PARAMS = { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 };
const KEY_LENGTH = 64;

// Written out rather than Buffer#toString("hex"): the Workers and Node type packages disagree
// about Buffer's signature and the typecheck fails on it, though both runtimes support it.
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string): Promise<string> {
  const salt = toHex(randomBytes(16));
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return `${salt}:${toHex(key)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [salt, keyHex] = hash.split(":");
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
