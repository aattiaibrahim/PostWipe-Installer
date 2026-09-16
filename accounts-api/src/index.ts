import { Hono } from "hono";
import { createAuth, type Env } from "./auth.ts";
import { EMPTY_PROFILE, MAX_BODY_BYTES, parseProfileInput, type Profile } from "./profile.ts";

type Vars = { userId: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.get("/", (c) => c.json({ service: "postwipe-accounts", ok: true }));

// Better Auth owns everything under /api/auth: sign-up, sign-in, sessions, 2FA, deletion.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

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

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON." }, 400);
  }
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
