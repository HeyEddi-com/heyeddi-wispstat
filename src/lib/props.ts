/**
 * v1.3 capped allowed properties — map event props to p1..p3 slots.
 */

export interface PropDef {
  slot: number;
  key: string;
  allowed: string[];
}

const KEY_RE = /^[a-z0-9_-]{1,24}$/;

export function normalizePropKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return KEY_RE.test(v) ? v : null;
}

export function normalizePropValue(raw: unknown): string | null {
  return normalizePropKey(raw);
}

export function mapProps(
  defs: PropDef[],
  incoming: Record<string, unknown> | undefined,
): { p1: string | null; p2: string | null; p3: string | null } {
  const out: { p1: string | null; p2: string | null; p3: string | null } = {
    p1: null,
    p2: null,
    p3: null,
  };
  if (!incoming || defs.length === 0) return out;
  for (const def of defs) {
    const key = def.key;
    if (!(key in incoming)) continue;
    const raw = normalizePropValue(incoming[key]);
    const value = raw && def.allowed.includes(raw) ? raw : '(other)';
    if (def.slot === 1) out.p1 = value;
    if (def.slot === 2) out.p2 = value;
    if (def.slot === 3) out.p3 = value;
  }
  return out;
}

export async function loadPropDefs(db: D1Database, sid: number): Promise<PropDef[]> {
  const rows = await db.prepare(
    'SELECT slot, key, allowed_json FROM prop_defs WHERE sid = ? ORDER BY slot'
  ).bind(sid).all<{ slot: number; key: string; allowed_json: string }>();
  return rows.results.map((row) => ({
    slot: row.slot,
    key: row.key,
    allowed: JSON.parse(row.allowed_json) as string[],
  }));
}
