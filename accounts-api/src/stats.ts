import type { Context } from "hono";
import type { Env } from "./auth.ts";

/** Anonymous community download counts, for the app's "Popular" shelf.
 *
 *  Privacy stance, stated in the app's Settings next to the opt-out:
 *    - nothing identifies a person: no account, device id, or IP address is stored;
 *    - repeat downloads from the same connection on the same day count once, using a salted
 *      one-way hash that's deleted after that day;
 *    - only the catalog app id and the OS are sent. */

const APP_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const OS = new Set(["windows", "macos"]);
const DAY_MS = 86_400_000;
/** More distinct downloads than any real post-wipe setup records in a day from one connection
 *  (the whole catalog is ~120 apps per OS). Past it, requests are accepted but not counted. */
const MAX_PER_CONNECTION_PER_DAY = 150;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Ctx = Context<{ Bindings: Env }>;

export async function recordDownload<E extends { Bindings: Env }>(c: Context<E>, parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return c.json({ error: "Request body must be JSON." }, 400);
  const { appId, os } = parsed as { appId?: unknown; os?: unknown };
  if (typeof appId !== "string" || !APP_ID.test(appId) || typeof os !== "string" || !OS.has(os)) {
    return c.json({ error: "Invalid app or OS." }, 400);
  }

  const day = Math.floor(Date.now() / DAY_MS);
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  const key = await sha256Hex(`${c.env.BETTER_AUTH_SECRET}|${day}|${ip}|${appId}|${os}`);

  const db = c.env.DB;
  const capKey = await sha256Hex(`${c.env.BETTER_AUTH_SECRET}|${day}|${ip}|cap`);
  const used = await db
    .prepare(
      `INSERT INTO download_ip_day (key, day, n) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n`,
    )
    .bind(capKey, day)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > MAX_PER_CONNECTION_PER_DAY) return c.body(null, 204);

  const fresh = await db.prepare("INSERT OR IGNORE INTO download_dedupe (key, day) VALUES (?, ?)").bind(key, day).run();
  if (fresh.meta.changes === 1) {
    await db
      .prepare(
        `INSERT INTO download_counts (app_id, os, day, count) VALUES (?, ?, ?, 1)
         ON CONFLICT(app_id, os, day) DO UPDATE SET count = count + 1`,
      )
      .bind(appId, os, day)
      .run();
  }

  // Yesterday's dedupe hashes have no further use. Pruned lazily on a small share of
  // requests rather than on a cron, so nothing extra needs scheduling.
  if (Math.random() < 0.05) {
    c.executionCtx.waitUntil(
      db.batch([
        db.prepare("DELETE FROM download_dedupe WHERE day < ?").bind(day),
        db.prepare("DELETE FROM download_ip_day WHERE day < ?").bind(day),
      ]),
    );
  }
  return c.body(null, 204);
}

export async function popular(c: Ctx) {
  const os = c.req.query("os") ?? "";
  if (!OS.has(os)) return c.json({ error: "os must be windows or macos" }, 400);
  // All-time by default: most people open a post-wipe tool rarely, so a rolling 30-day window
  // would stay near-empty for a long time. `days` still narrows it when asked for.
  const daysParam = Number(c.req.query("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : null;
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 12, 1), 50);

  // Every app open hits this, so it's served from Cloudflare's edge cache for 10 minutes
  // instead of querying D1 per launch.
  const cacheKey = new Request(`https://stats.cache/popular?os=${os}&days=${days ?? "all"}&limit=${limit}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const since = days === null ? -1 : Math.floor(Date.now() / DAY_MS) - days;
  const { results } = await c.env.DB.prepare(
    `SELECT app_id AS appId, SUM(count) AS count FROM download_counts
     WHERE os = ? AND day > ? GROUP BY app_id ORDER BY count DESC LIMIT ?`,
  )
    .bind(os, since, limit)
    .all<{ appId: string; count: number }>();

  const response = new Response(JSON.stringify({ days: days ?? "all", apps: results }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=600" },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
