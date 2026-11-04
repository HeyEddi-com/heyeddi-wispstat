-- v1.3 capped properties + v1.4 consented visitors

CREATE TABLE prop_defs (
  sid INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  key TEXT NOT NULL,
  allowed_json TEXT NOT NULL,
  PRIMARY KEY (sid, slot),
  UNIQUE (sid, key)
) WITHOUT ROWID;

CREATE TABLE props_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  converters INTEGER NOT NULL DEFAULT 0,
  value_x100 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, day, event, key, value)
) WITHOUT ROWID;

CREATE TABLE consented_visitors (
  sid INTEGER NOT NULL,
  cid_hash BLOB NOT NULL,
  first_day TEXT NOT NULL,
  first_channel TEXT,
  first_source TEXT,
  first_medium TEXT,
  first_campaign TEXT,
  last_day TEXT NOT NULL,
  active_days INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (sid, cid_hash)
) WITHOUT ROWID;

CREATE INDEX idx_consented_visitors_last ON consented_visitors(sid, last_day);
