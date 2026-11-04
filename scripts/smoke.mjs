/**
 * Production / staging smoke.
 *
 *   npm run smoke -- https://heyeddi-wispstat….workers.dev
 *
 * Optional env for deep checks:
 *   SMOKE_EMAIL / SMOKE_PASSWORD  — owner login (dashboard API path)
 *   SMOKE_SITE_ID                 — existing site (else create ephemeral)
 *   SMOKE_DOMAIN                  — domain root for beacon Origin (default example.com)
 *   WISPSTAT_API_KEY              — read key for MCP-equivalent path
 */

const argUrl = process.argv[2];

async function resolveUrl() {
  if (argUrl) return argUrl.replace(/\/$/, '');
  if (process.env.WISPSTAT_BASE_URL) return process.env.WISPSTAT_BASE_URL.replace(/\/$/, '');
  const { execSync } = await import('child_process');
  try {
    const output = execSync('npx wrangler deployments list', { encoding: 'utf-8' });
    const match = output.match(/https:\/\/[^\s]+workers\.dev[^\s]*/);
    if (match) return match[0].replace(/\/$/, '');
  } catch {
    /* fall through */
  }
  console.error('Pass the Worker URL: npm run smoke -- https://….workers.dev');
  process.exit(1);
}

const workerUrl = await resolveUrl();
const day = new Date().toISOString().slice(0, 10);
let failed = 0;
let skipped = 0;

console.log(`Smoke against ${workerUrl}\n`);

async function check(name, fn, { optional = false } = {}) {
  process.stdout.write(`${name}… `);
  try {
    await fn();
    console.log('ok');
  } catch (error) {
    if (optional) {
      skipped += 1;
      console.log(`skip (${error.message || error})`);
      return;
    }
    failed += 1;
    console.log('FAIL');
    console.error(' ', error.message || error);
  }
}

function cookieFrom(response) {
  // Node fetch may expose getSetCookie
  const many = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  if (many.length) return many.map((c) => c.split(';')[0]).join('; ');
  const raw = response.headers.get('set-cookie') || '';
  return raw.split(',').map((part) => part.split(';')[0].trim()).filter(Boolean).join('; ');
}

await check('Health', async () => {
  const response = await fetch(`${workerUrl}/health`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(JSON.stringify(data));
});

await check('Config (local auth only)', async () => {
  const response = await fetch(`${workerUrl}/config`);
  const data = await response.json();
  if (!('claimed' in data) || !('auth_providers' in data)) {
    throw new Error(JSON.stringify(data));
  }
  if (!Array.isArray(data.auth_providers) || !data.auth_providers.includes('local')) {
    throw new Error(`unexpected providers ${JSON.stringify(data.auth_providers)}`);
  }
  if ('firebase_web_config' in data && data.firebase_web_config) {
    throw new Error('firebase_web_config should be absent');
  }
  console.log(`\n  claimed=${data.claimed} providers=${data.auth_providers}`);
});

await check('SPA shells', async () => {
  for (const path of ['/', '/docs', '/login', '/claim']) {
    const response = await fetch(`${workerUrl}${path}`);
    if (response.status !== 200) throw new Error(`${path} → ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error(`${path} content-type ${type}`);
  }
});

await check('Tracker assets', async () => {
  for (const path of ['/ws.js', '/ws-consent.js']) {
    const response = await fetch(`${workerUrl}${path}`);
    if (response.status !== 200) throw new Error(`${path} → ${response.status}`);
    const body = await response.text();
    if (!body.includes('wispstat') && !body.includes('hm.')) {
      // minified may still include hm.
      if (!body.includes('hm.')) throw new Error(`${path} missing heat marker`);
    }
    if (path === '/ws.js' && body.includes('localStorage')) {
      throw new Error('default ws.js must not include localStorage');
    }
  }
});

await check('Collector OPTIONS (CORS)', async () => {
  const response = await fetch(`${workerUrl}/e`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
    },
  });
  if (response.status !== 204) throw new Error(`status ${response.status}`);
  if (!response.headers.get('access-control-allow-origin')) {
    throw new Error('missing ACAO');
  }
});

const email = process.env.SMOKE_EMAIL || '';
const password = process.env.SMOKE_PASSWORD || '';
const apiKey = process.env.WISPSTAT_API_KEY || process.env.SMOKE_API_KEY || '';
const domain = (process.env.SMOKE_DOMAIN || 'example.com').toLowerCase();
let siteId = process.env.SMOKE_SITE_ID || '';
let cookie = '';

await check('Owner login + dashboard APIs', async () => {
  if (!email || !password) throw new Error('set SMOKE_EMAIL and SMOKE_PASSWORD');

  const login = await fetch(`${workerUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  cookie = cookieFrom(login);
  if (!cookie) throw new Error('no session cookie');

  const sites = await fetch(`${workerUrl}/api/v1/sites`, {
    headers: { cookie, 'x-ws-csrf': '1' },
  });
  if (sites.status !== 401 && sites.status !== 200) throw new Error(`sites ${sites.status}`);
  if (sites.status === 401) throw new Error('session rejected');
  const list = await sites.json();
  if (!siteId) {
    const match = (list.data || []).find((s) => (s.domains || []).includes(domain));
    siteId = match?.site_id || list.data?.[0]?.site_id || '';
  }
  if (!siteId) {
    const created = await fetch(`${workerUrl}/api/v1/sites`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-ws-csrf': '1',
      },
      body: JSON.stringify({ name: `Smoke ${day}`, domain, tz: 'UTC' }),
    });
    if (created.status !== 201) {
      throw new Error(`create site ${created.status} ${await created.text()}`);
    }
    const body = await created.json();
    siteId = body.site_id;
  }

  const overview = await fetch(`${workerUrl}/api/v1/overview`, { headers: { cookie } });
  if (overview.status !== 200) throw new Error(`overview ${overview.status}`);

  const budget = await fetch(`${workerUrl}/api/v1/budget`, { headers: { cookie } });
  if (budget.status !== 200) throw new Error(`budget ${budget.status}`);

  console.log(`\n  site=${siteId}`);
}, { optional: true });

await check('Live beacon from allowed Origin', async () => {
  if (!siteId) throw new Error('needs SMOKE_SITE_ID or owner login');
  const origin = `https://www.${domain}`;
  const response = await fetch(`${workerUrl}/e`, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      origin,
      'user-agent':
        'Mozilla/5.0 (compatible; WispstatSmoke/1.0; +https://heyeddi.com)',
    },
    body: JSON.stringify({
      s: siteId,
      k: 'ev',
      n: 'hm.1.1',
      p: '/smoke',
    }),
  });
  if (response.status !== 204) throw new Error(`beacon ${response.status}`);
  if (response.headers.get('set-cookie')) throw new Error('beacon set a cookie');

  // companion events for visits/heatmap
  for (const n of ['scroll.25', 'form_submit']) {
    const r = await fetch(`${workerUrl}/e`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin,
        'user-agent':
          'Mozilla/5.0 (compatible; WispstatSmoke/1.0; +https://heyeddi.com)',
      },
      body: JSON.stringify({ s: siteId, k: 'ev', n, p: '/smoke' }),
    });
    if (r.status !== 204) throw new Error(`${n} → ${r.status}`);
  }
}, { optional: true });

await check('Heatmap + visits (session)', async () => {
  if (!cookie || !siteId) throw new Error('needs owner session + site');
  const heat = await fetch(
    `${workerUrl}/api/v1/sites/${siteId}/heatmap?day=${day}&path=/smoke`,
    { headers: { cookie } }
  );
  if (heat.status !== 200) throw new Error(`heatmap ${heat.status}`);
  const heatBody = await heat.json();
  if (heatBody.grid_size !== 12) throw new Error('bad grid_size');

  const visits = await fetch(
    `${workerUrl}/api/v1/sites/${siteId}/visits?day=${day}`,
    { headers: { cookie } }
  );
  if (visits.status !== 200) throw new Error(`visits ${visits.status}`);
}, { optional: true });

await check('Read-key path (MCP equivalent)', async () => {
  if (!apiKey) throw new Error('set WISPSTAT_API_KEY');
  const keySite = apiKey.match(/^wsk_(s_[0-9a-hjkmnp-z]{16})_/)?.[1] || siteId;
  if (!keySite) throw new Error('could not resolve site from key');
  const headers = { 'x-ws-key': apiKey };
  for (const path of [
    `/api/v1/sites/${keySite}/live`,
    `/api/v1/sites/${keySite}/heatmap?day=${day}`,
    `/api/v1/sites/${keySite}/visits?day=${day}`,
    `/api/v1/sites/${keySite}/summary`,
  ]) {
    const response = await fetch(`${workerUrl}${path}`, { headers });
    if (response.status !== 200) throw new Error(`${path} → ${response.status}`);
  }
  const overview = await fetch(`${workerUrl}/api/v1/overview`, { headers });
  if (overview.status !== 403) throw new Error(`overview should be 403, got ${overview.status}`);
}, { optional: true });

await check('Dashboard SPA deep links', async () => {
  if (!siteId) throw new Error('needs site id');
  for (const path of [
    `/sites/${siteId}`,
    `/sites/${siteId}/visits`,
    `/sites/${siteId}/heatmaps`,
    `/sites/${siteId}/live`,
  ]) {
    const response = await fetch(`${workerUrl}${path}`);
    if (response.status !== 200) throw new Error(`${path} → ${response.status}`);
  }
}, { optional: true });

console.log('');
if (failed) {
  console.error(`Smoke FAILED (${failed} check(s)). ${skipped} skipped.`);
  process.exit(1);
}
console.log(`All smoke checks passed (${skipped} optional skipped).`);
if (skipped) {
  console.log('Tip: set SMOKE_EMAIL/SMOKE_PASSWORD and/or WISPSTAT_API_KEY for deep checks.');
}
