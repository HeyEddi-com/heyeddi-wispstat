-- Approximate same-day sessions and the optional Direct-upgrade flag.

ALTER TABLE sites ADD COLUMN upgrade_direct INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sessions_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  dim TEXT NOT NULL,
  k TEXT NOT NULL,
  sessions INTEGER NOT NULL,
  pv INTEGER NOT NULL,
  bounces INTEGER NOT NULL,
  dur_s_sum INTEGER NOT NULL,
  dur_n INTEGER NOT NULL,
  PRIMARY KEY (sid, day, dim, k)
) WITHOUT ROWID;
