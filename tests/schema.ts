import { env } from 'cloudflare:test';
import coreSql from '../migrations/core/0001_initial_schema.sql?raw';
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
    await db.prepare(statement).run();
  }
}

export async function applySchema(): Promise<void> {
  if (ready) return;
  await runSql(env.CORE, coreSql);
  await runSql(env.INGEST, ingestSql);
  ready = true;
}
