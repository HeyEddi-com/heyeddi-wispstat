-- Ingest database schema (raw events, disposable)
-- migrations/ingest/0001_initial_schema.sql

-- This database holds day-partitioned tables that are created dynamically.
-- The partitions are named ev_YYYYMMDD and vis_YYYYMMDD.
-- 
-- This migration creates the rollup_state table for tracking which partitions
-- exist and have been processed.

CREATE TABLE rollup_state (
  job TEXT NOT NULL,
  scope TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (job, scope)
) WITHOUT ROWID;

-- Example partition schemas (created dynamically by cron):
-- 
-- CREATE TABLE ev_20261005 (
--   id INTEGER PRIMARY KEY,
--   sid INTEGER NOT NULL,
--   ts INTEGER NOT NULL,
--   k INTEGER NOT NULL,
--   name TEXT,
--   path TEXT NOT NULL,
--   vh BLOB NOT NULL,
--   nv INTEGER NOT NULL DEFAULT 0,
--   goal_id INTEGER,
--   value_x100 INTEGER,
--   src INTEGER NOT NULL DEFAULT 0
-- );
-- 
-- CREATE TABLE vis_20261005 (
--   sid INTEGER NOT NULL,
--   vh BLOB NOT NULL,
--   first_ts INTEGER NOT NULL,
--   channel TEXT NOT NULL,
--   source TEXT,
--   medium TEXT,
--   campaign TEXT,
--   content TEXT,
--   term TEXT,
--   ref_host TEXT,
--   entry_path TEXT,
--   country TEXT,
--   lang TEXT,
--   device TEXT,
--   browser TEXT,
--   os TEXT,
--   PRIMARY KEY (sid, vh)
-- ) WITHOUT ROWID;
