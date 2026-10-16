-- Caps how many downloads one connection can record per day, so a script can't flood the
-- Popular shelf or fill the database with made-up app ids. Like download_dedupe, `key` is a
-- SHA-256 of a server secret + the day + the client IP, so no address is stored, and rows are
-- deleted once their day has passed.
CREATE TABLE download_ip_day (
  key TEXT    NOT NULL PRIMARY KEY,
  day INTEGER NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX download_ip_day_day_idx ON download_ip_day (day);
