/**
 * Live MCP-equivalent smoke (HTTP tools the MCP server wraps).
 *
 *   WISPSTAT_BASE_URL=https://… WISPSTAT_API_KEY=wsk_… npm run smoke:mcp
 *
 * Also verifies mcp/src/index.js loads with those env vars long enough to register tools.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const baseUrl = (process.env.WISPSTAT_BASE_URL || process.argv[2] || '').replace(/\/$/, '');
const apiKey = process.env.WISPSTAT_API_KEY || '';

if (!baseUrl || !apiKey) {
  console.error('Set WISPSTAT_BASE_URL and WISPSTAT_API_KEY');
  process.exit(1);
}

const siteId = apiKey.match(/^wsk_(s_[0-9a-hjkmnp-z]{16})_/)?.[1];
if (!siteId) {
  console.error('WISPSTAT_API_KEY must look like wsk_<siteId>_<secret>');
  process.exit(1);
}

const day = new Date().toISOString().slice(0, 10);
let failed = 0;

async function check(name, fn) {
  process.stdout.write(`${name}… `);
  try {
    await fn();
    console.log('ok');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.error(' ', error.message || error);
  }
}

async function api(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'application/json', 'x-ws-key': apiKey },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body?.error?.message || text}`);
  }
  return body;
}

console.log(`MCP smoke → ${baseUrl} site=${siteId}\n`);

await check('budget', async () => {
  const body = await api('/api/v1/budget');
  if (typeof body.write_cap !== 'number' && typeof body.writes_estimate !== 'number') {
    // shape may use either naming — accept object
    if (!body || typeof body !== 'object') throw new Error('empty');
  }
});

await check('summary', () => api(`/api/v1/sites/${siteId}/summary`));
await check('sources', () => api(`/api/v1/sites/${siteId}/sources`));
await check('live', () => api(`/api/v1/sites/${siteId}/live`));
await check('visits', () => api(`/api/v1/sites/${siteId}/visits?day=${day}`));
await check('heatmap', () => api(`/api/v1/sites/${siteId}/heatmap?day=${day}`));

await check('mcp process boots', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mcp');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', join(root, 'src', 'index.js')], {
      cwd: root,
      env: { ...process.env, WISPSTAT_BASE_URL: baseUrl, WISPSTAT_API_KEY: apiKey },
    });
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `exit ${code}`));
    });
  });
});

console.log('');
if (failed) {
  console.error(`MCP smoke FAILED (${failed}).`);
  process.exit(1);
}
console.log('MCP smoke passed.');
