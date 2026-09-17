import { Hono } from "hono";
import { createAuth, type Env } from "./auth.ts";
import { EMPTY_PROFILE, MAX_BODY_BYTES, parseProfileInput, type Profile } from "./profile.ts";
import { popular, recordDownload } from "./stats.ts";

type Vars = { userId: string; body: Uint8Array | null };

/** Reads a request body, giving up the moment it passes `limit` bytes — so a huge or endless
 *  stream costs at most `limit` bytes of memory, whether or not it declared a length. */
async function readCapped(req: Request, limit: number): Promise<Uint8Array | "too-large" | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// Headers for an API nobody should render, frame, cache or sniff.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  if (!c.req.path.startsWith("/api/stats/popular")) c.header("Cache-Control", "no-store");
});

// Request bodies are small JSON documents. Every body is read here, once, through a capped
// reader: a declared length over the cap is refused without reading, and a body that lies
// about its length (or streams without one) is cut off at the cap. Handlers use c.var.body.
app.use("*", async (c, next) => {
  c.set("body", null);
  if (c.req.method === "POST" || c.req.method === "PUT") {
    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return c.json({ error: "Request body too large." }, 413);
    const body = await readCapped(c.req.raw, MAX_BODY_BYTES);
    if (body === "too-large") return c.json({ error: "Request body too large." }, 413);
    c.set("body", body);
  }
  await next();
});

/** The request body parsed as JSON, or undefined if it isn't JSON. */
export function jsonBody(c: { var: { body: Uint8Array | null } }): unknown {
  if (!c.var.body) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(c.var.body));
  } catch {
    return undefined;
  }
}

app.get("/", (c) => c.json({ service: "postwipe-accounts", ok: true }));

// Anonymous community stats — no account needed, nothing identifying stored (see stats.ts).
app.post("/api/stats/download", (c) => recordDownload(c, jsonBody(c)));
app.get("/api/stats/popular", popular);

/** The Better Auth endpoints the desktop app actually uses. Better Auth mounts many more
 *  (update-user, change-email, list-sessions, password reset, …); none has a caller here, so
 *  they're closed rather than left as extra surface for someone curling the API. */
const AUTH_ROUTES = new Set([
  "POST /api/auth/sign-up/email",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-out",
  "GET /api/auth/get-session",
  "POST /api/auth/two-factor/enable",
  "POST /api/auth/two-factor/disable",
  "POST /api/auth/two-factor/verify-totp",
  "POST /api/auth/two-factor/verify-backup-code",
  "POST /api/auth/two-factor/generate-backup-codes",
  "POST /api/auth/delete-user",
]);

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!AUTH_ROUTES.has(`${c.req.method} ${c.req.path}`)) return c.json({ error: "Not found." }, 404);
  // The original body stream was consumed by the capped read above; hand Better Auth a copy.
  const req = new Request(c.req.raw, { body: c.var.body ?? undefined });
  return createAuth(c.env).handler(req);
});

// Every profile route resolves the caller from their bearer token. The user id always comes
// from the SESSION, never from the request body or URL, so one account can't read or
// overwrite another's data by editing an id.
app.use("/api/profile", async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Sign in to sync your favorites." }, 401);
  c.set("userId", session.user.id);
  await next();
});

interface ProfileRow {
  favorites: string;
  sets: string;
  settings: string;
  updated_at: number;
}

async function readProfile(db: D1Database, userId: string): Promise<Profile> {
  const row = await db
    .prepare("SELECT favorites, sets, settings, updated_at FROM user_profile WHERE user_id = ?")
    .bind(userId)
    .first<ProfileRow>();
  if (!row) return EMPTY_PROFILE;
  return {
    favorites: JSON.parse(row.favorites),
    sets: JSON.parse(row.sets),
    settings: JSON.parse(row.settings),
    updatedAt: row.updated_at,
  };
}

app.get("/api/profile", async (c) => c.json(await readProfile(c.env.DB, c.get("userId"))));

/** Replace the whole profile.
 *
 *  `baseUpdatedAt` is the `updatedAt` the client last saw. If another device saved since,
 *  the write is refused with 409 and the newer copy, instead of silently clobbering it —
 *  the common case being favourites edited on two PCs set up on the same weekend. */
app.put("/api/profile", async (c) => {
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return c.json({ error: "That's more data than an account can store." }, 413);

  const body = jsonBody(c);
  if (body === undefined) return c.json({ error: "Request body must be JSON." }, 400);
  const parsed = parseProfileInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const userId = c.get("userId");
  const baseUpdatedAt = Number((body as { baseUpdatedAt?: unknown }).baseUpdatedAt ?? 0);
  const current = await readProfile(c.env.DB, userId);
  if (current.updatedAt > baseUpdatedAt) {
    return c.json({ error: "Your favorites changed on another device.", profile: current }, 409);
  }

  const next: Profile = { ...parsed.value, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
  await c.env.DB.prepare(
    `INSERT INTO user_profile (user_id, favorites, sets, settings, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       favorites = excluded.favorites, sets = excluded.sets,
       settings = excluded.settings, updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(next.favorites), JSON.stringify(next.sets), JSON.stringify(next.settings), next.updatedAt)
    .run();
  return c.json(next);
});

export default app;
