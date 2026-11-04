-- Aggregate click heat + scroll depth (no DOM snapshots / no replay)

CREATE TABLE heat_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  gx INTEGER NOT NULL,
  gy INTEGER NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, day, path, gx, gy)
) WITHOUT ROWID;

CREATE TABLE scroll_daily (
  sid INTEGER NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  depth INTEGER NOT NULL,
  events INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sid, day, path, depth)
) WITHOUT ROWID;

CREATE INDEX idx_heat_daily_day ON heat_daily(sid, day);
CREATE INDEX idx_scroll_daily_day ON scroll_daily(sid, day);
