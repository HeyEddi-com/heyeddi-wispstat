/**
 * Main Worker entry point
 */

import { Hono } from 'hono';
import type { Env } from './lib/types';
import { handleCollector } from './collector';
import { handleAttribution } from './collector/attribution';
import { handleVisitToken } from './collector/token';
import { handleForget } from './collector/forget';
import { handleClaim, handleLogin, handleLogout } from './auth/local';
import { getConfig } from '../wispstat.config';
import { registerApi } from './api/routes';
import { handleServerEvent } from './api/server-events';
import { runScheduled } from './cron';

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Collector endpoint
app.post('/e', async (c) => {
  return handleCollector(c.req.raw, c.env);
});

app.options('/e', async (c) => {
  return handleCollector(c.req.raw, c.env);
});

app.post('/a', async (c) => {
  return handleAttribution(c.req.raw, c.env);
});

app.options('/a', async (c) => {
  return handleAttribution(c.req.raw, c.env);
});

app.post('/t', async (c) => {
  return handleVisitToken(c.req.raw, c.env);
});

app.options('/t', async (c) => {
  return handleVisitToken(c.req.raw, c.env);
});

app.post('/c/forget', async (c) => {
  return handleForget(c.req.raw, c.env);
});

app.options('/c/forget', async (c) => {
  return handleForget(c.req.raw, c.env);
});

app.post('/api/v1/server/events', async (c) => {
  return handleServerEvent(c.req.raw, c.env);
});

// Auth endpoints
app.post('/auth/claim', async (c) => {
  return handleClaim(c.req.raw, c.env);
});

app.post('/auth/login', async (c) => {
  return handleLogin(c.req.raw, c.env);
});

app.post('/auth/logout', async (c) => {
  return handleLogout(c.req.raw, c.env);
});

// Config endpoint (public)
app.get('/config', async (c) => {
  const config = getConfig(c.env);
  
  const claimed = await c.env.CORE.prepare(
    "SELECT v FROM instance WHERE k = 'claimed'"
  ).first<{ v: string }>();
  
  return c.json({
    claimed: claimed?.v === '1',
    auth_providers: config.authProviders,
  });
});

registerApi(app);

app.all('*', async (c) => {
  if (!c.env.ASSETS) {
    return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export { app };

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(event.cron, env));
  },
};
