/**
 * Approximate sessions from a raw day partition.
 * A new session starts after 30 minutes of inactivity. Sessions never cross the local day.
 */

import type { Env } from '../lib/types';
import { CONSTANTS } from '../../wispstat.config';

interface SessionAgg {
  dim: string;
  k: string;
  sessions: number;
  pv: number;
  bounces: number;
  dur_s_sum: number;
  dur_n: number;
}

export async function sessionRollup(
  env: Env,
  sid: number,
  ev: string,
  vis: string
): Promise<SessionAgg[]> {
  const gap = CONSTANTS.SESSION_GAP_SECONDS;
  const rows = await env.INGEST.prepare(`
    WITH ordered AS (
      SELECT vh, ts, k, id,
        LAG(ts) OVER (PARTITION BY vh ORDER BY ts, id) AS prev_ts
      FROM ${ev}
      WHERE sid = ?
    ),
    marked AS (
      SELECT vh, ts, k,
        SUM(CASE WHEN prev_ts IS NULL OR ts - prev_ts > ? THEN 1 ELSE 0 END)
          OVER (PARTITION BY vh ORDER BY ts, id) AS sess_n
      FROM ordered
    ),
    sess AS (
      SELECT vh,
        SUM(CASE WHEN k = 0 THEN 1 ELSE 0 END) AS pv,
        COUNT(*) AS hits,
        MIN(ts) AS first_ts,
        MAX(ts) AS last_ts
      FROM marked
      GROUP BY vh, sess_n
    )
    SELECT 'total' AS dim, '' AS k,
      COUNT(*) AS sessions,
      COALESCE(SUM(s.pv), 0) AS pv,
      COALESCE(SUM(CASE WHEN s.pv = 1 THEN 1 ELSE 0 END), 0) AS bounces,
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN s.last_ts - s.first_ts ELSE 0 END), 0) AS dur_s_sum,
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN 1 ELSE 0 END), 0) AS dur_n
    FROM sess s
    JOIN ${vis} v ON v.sid = ? AND v.vh = s.vh
    UNION ALL
    SELECT 'channel', v.channel,
      COUNT(*), COALESCE(SUM(s.pv), 0),
      COALESCE(SUM(CASE WHEN s.pv = 1 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN s.last_ts - s.first_ts ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN 1 ELSE 0 END), 0)
    FROM sess s
    JOIN ${vis} v ON v.sid = ? AND v.vh = s.vh
    GROUP BY v.channel
    UNION ALL
    SELECT 'path-entry', COALESCE(v.entry_path, ''),
      COUNT(*), COALESCE(SUM(s.pv), 0),
      COALESCE(SUM(CASE WHEN s.pv = 1 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN s.last_ts - s.first_ts ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN 1 ELSE 0 END), 0)
    FROM sess s
    JOIN ${vis} v ON v.sid = ? AND v.vh = s.vh
    GROUP BY COALESCE(v.entry_path, '')
    UNION ALL
    SELECT 'country', COALESCE(v.country, ''),
      COUNT(*), COALESCE(SUM(s.pv), 0),
      COALESCE(SUM(CASE WHEN s.pv = 1 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN s.last_ts - s.first_ts ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN s.pv > 1 THEN 1 ELSE 0 END), 0)
    FROM sess s
    JOIN ${vis} v ON v.sid = ? AND v.vh = s.vh
    GROUP BY COALESCE(v.country, '')
  `).bind(sid, gap, sid, sid, sid, sid).all<SessionAgg>();

  return rows.results;
}
