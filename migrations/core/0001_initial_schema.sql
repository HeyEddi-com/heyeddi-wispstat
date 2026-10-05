-- Core database schema (config, rollups, users)
-- migrations/core/0001_initial_schema.sql

-- Instance metadata
CREATE TABLE instance (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO instance (k, v) VALUES
  ('claimed', '0'),
  ('schema_version', '1'),
  ('instance_id', lower(hex(randomblob(16))));

-- Sites
CREATE TABLE sites (
  sid INTEGER PRIMARY KEY,
  site_id TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  domains TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  honor_dnt INTEGER NOT NULL DEFAULT 0,
  ingest_paused INTEGER NOT NULL DEFAULT 0,
  digest_enabled INTEGER NOT NULL DEFAULT 0,
  sessions_enabled INTEGER NOT NULL DEFAULT 0,
  consent_mode INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sites_site_id ON sites(site_id);

-- Users (operators, not visitors)
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT,
  pw_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'viewer')),
  created_at INTEGER NOT NULL
);

-- Login sessions (local auth only)
CREATE TABLE login_sessions (
  token_hash BLOB PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  auth_time INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX idx_login_sessions_expires ON login_sessions(expires_at);

-- Site members
CREATE TABLE site_members (
  sid INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'viewer')),
  PRIMARY KEY (sid, user_id)
) WITHOUT ROWID;

-- API keys
CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,
  sid INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('read', 'server')),
  label TEXT,
  key_hash BLOB NOT NULL,
  scopes TEXT NOT NULL,
  allowed_origins TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_day TEXT,
  revoked_at INTEGER
);

CREATE INDEX idx_api_keys_sid ON api_keys(sid);

-- Goals
CREATE TABLE goals (
  goal_id INTEGER PRIMARY KEY,
  sid INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'path')),
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'prefix')),
  pattern TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (sid, kind, pattern)
);

CREATE INDEX idx_goals_sid ON goals(sid);

-- UTM links
CREATE TABLE utm_links (
  id INTEGER PRIMARY KEY,
  sid INTEGER NOT NULL,
  label TEXT,
  base_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  full_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_utm_links_sid ON utm_links(sid);

-- Rollups
CREATE TABLE stats_hourly (
  sid INTEGER NOT NULL,
  hour_ts INTEGER NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0,
  ev INTEGER NOT NULL DEFAULT 0,
  new_visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, hour_ts)
) WITHOUT ROWID;

CREATE TABLE stats_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  dim TEXT NOT NULL,
  k TEXT NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  events INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, day, dim, k)
) WITHOUT ROWID;

CREATE TABLE sources_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  visitors INTEGER NOT NULL,
  pv INTEGER NOT NULL,
  PRIMARY KEY (sid, day, channel, source, medium, campaign)
) WITHOUT ROWID;

CREATE TABLE goals_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  goal_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  converters INTEGER NOT NULL,
  conversions INTEGER NOT NULL,
  value_x100 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, day, goal_id, channel, source, medium, campaign)
) WITHOUT ROWID;

-- Rollup state (watermarks, flags)
CREATE TABLE rollup_state (
  job TEXT NOT NULL,
  scope TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (job, scope)
) WITHOUT ROWID;
