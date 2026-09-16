-- Favorites, named sets and synced settings: one JSON document per account.
-- Deleting the account (Better Auth's /delete-user) removes this row with it.
CREATE TABLE user_profile (
  user_id    TEXT    NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  favorites  TEXT    NOT NULL DEFAULT '[]',
  sets       TEXT    NOT NULL DEFAULT '[]',
  settings   TEXT    NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);
