/**
 * Day-partition names for the INGEST database.
 * Suffixes are server-built YYYYMMDD strings, never request input.
 */

const SUFFIX = /^[0-9]{8}$/;

export function suffixFromDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid day: ${day}`);
  }
  return day.replace(/-/g, '');
}

export function dayFromSuffix(suffix: string): string {
  assertSuffix(suffix);
  return `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`;
}

export function assertSuffix(suffix: string): string {
  if (!SUFFIX.test(suffix)) {
    throw new Error(`Invalid partition suffix: ${suffix}`);
  }
  return suffix;
}

export function partitionTables(suffix: string): { ev: string; vis: string } {
  assertSuffix(suffix);
  return { ev: `ev_${suffix}`, vis: `vis_${suffix}` };
}

export async function ensurePartition(db: D1Database, suffix: string): Promise<void> {
  const { ev, vis } = partitionTables(suffix);
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${ev} (
        id INTEGER PRIMARY KEY,
        sid INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        k INTEGER NOT NULL,
        name TEXT,
        path TEXT NOT NULL,
        vh BLOB NOT NULL,
        nv INTEGER NOT NULL DEFAULT 0,
        goal_id INTEGER,
        value_x100 INTEGER,
        src INTEGER NOT NULL DEFAULT 0
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${vis} (
        sid INTEGER NOT NULL,
        vh BLOB NOT NULL,
        first_ts INTEGER NOT NULL,
        channel TEXT NOT NULL,
        source TEXT,
        medium TEXT,
        campaign TEXT,
        content TEXT,
        term TEXT,
        ref_host TEXT,
        entry_path TEXT,
        country TEXT,
        lang TEXT,
        device TEXT,
        browser TEXT,
        os TEXT,
        PRIMARY KEY (sid, vh)
      ) WITHOUT ROWID
    `),
  ]);
}

export async function listEventPartitions(db: D1Database): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ev_%'"
  ).all<{ name: string }>();
  return rows.results
    .map((row) => row.name.replace(/^ev_/, ''))
    .filter((suffix) => SUFFIX.test(suffix));
}
