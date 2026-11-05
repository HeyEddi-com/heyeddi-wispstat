-- Remaining product surfaces: funnels, FX, reporting currency.

ALTER TABLE sites ADD COLUMN reporting_currency TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE funnels (
  funnel_id INTEGER PRIMARY KEY,
  sid INTEGER NOT NULL,
  name TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_funnels_sid ON funnels(sid);

CREATE TABLE fx_rates (
  code TEXT PRIMARY KEY,
  usd_per_unit REAL NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

INSERT OR IGNORE INTO fx_rates (code, usd_per_unit, updated_at) VALUES ('USD', 1, 0);
