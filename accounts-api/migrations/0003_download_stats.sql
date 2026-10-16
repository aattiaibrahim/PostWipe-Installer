-- Anonymous community download counts for the Home page's "Popular" shelf.
-- No account, IP address or device identifier is stored.

-- One row per app, OS and UTC day.
CREATE TABLE download_counts (
  app_id TEXT    NOT NULL,
  os     TEXT    NOT NULL,
  day    INTEGER NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, os, day)
);

CREATE INDEX download_counts_os_day_idx ON download_counts (os, day);

-- Stops one machine re-downloading the same app from inflating its count. `key` is a
-- SHA-256 of a server secret + the day + the client IP + the app, so the IP can't be read
-- back out of it, and rows are deleted once their day has passed.
CREATE TABLE download_dedupe (
  key TEXT    NOT NULL PRIMARY KEY,
  day INTEGER NOT NULL
);

CREATE INDEX download_dedupe_day_idx ON download_dedupe (day);
