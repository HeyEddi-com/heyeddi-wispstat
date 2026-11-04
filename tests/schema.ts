import { env } from 'cloudflare:test';
import coreSql from '../migrations/core/0001_initial_schema.sql?raw';
import sessionsSql from '../migrations/core/0002_sessions.sql?raw';
import propsConsentSql from '../migrations/core/0003_props_consent.sql?raw';
import heatmapSql from '../migrations/core/0004_heatmap.sql?raw';
import ingestSql from '../migrations/ingest/0001_initial_schema.sql?raw';

let ready = false;

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.replace(/--[^\n]*/g, '').trim())
    .filter((part) => part.length > 0);
}

async function runSql(db: D1Database, sql: string): Promise<void> {
  for (const statement of statements(sql)) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists|duplicate column|UNIQUE constraint/i.test(message)) continue;
      throw error;
    }
  }
}

export async function applySchema(): Promise<void> {
  if (ready) return;
  await runSql(env.CORE, coreSql);
  await runSql(env.CORE, sessionsSql);
  await runSql(env.CORE, propsConsentSql);
  await runSql(env.CORE, heatmapSql);
  await runSql(env.INGEST, ingestSql);
  ready = true;
}
