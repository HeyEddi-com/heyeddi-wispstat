/**
 * Main Worker entry point
 */

import { Hono } from 'hono';
import type { Env } from './lib/types';
import { handleCollector } from './collector';
import { handleClaim, handleLogin, handleLogout } from './auth/local';
import { getConfig } from '../edgemetry.config';

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
    firebase_web_config: config.firebaseWebConfig || null,
  });
});

// API routes (to be implemented)
app.get('/api/v1/*', async (c) => {
  return c.json({ error: { code: 'not_implemented', message: 'API not yet implemented' } }, 501);
});

// Cron handler
export default {
  fetch: app.fetch,
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron logic to be implemented
    console.log('Cron triggered:', event.cron);
  },
};
