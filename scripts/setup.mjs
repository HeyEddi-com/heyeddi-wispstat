/**
 * Setup script — creates D1 + KV, patches wrangler.toml IDs, secrets, migrate, build, deploy.
 * Run from repo root: npm run setup
 * Live Cloudflare mutations: run this in your own terminal (agent shells block wrangler deploy).
 */

import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

const WRANGLER = 'npx wrangler';
const SKIP_DEPLOY = process.argv.includes('--no-deploy');
const SKIP_R2 = process.argv.includes('--skip-r2');

console.log('HeyEddi Wispstat Setup\n');

function exec(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: options.capture ? 'pipe' : 'inherit', ...options });
}

function execCapture(cmd) {
  console.log(`> ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
  }
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function ensureWrangler() {
  try {
    execSync(`${WRANGLER} --version`, { stdio: 'ignore' });
  } catch {
    console.error('wrangler not found. Run: npm install');
    process.exit(1);
  }
  const who = execCapture(`${WRANGLER} whoami`);
  if (/not authenticated|not logged in|Please run/i.test(who)) {
    console.error('Not logged into Cloudflare. Run in your terminal:');
    console.error('  npx wrangler login');
    process.exit(1);
  }
  console.log('Cloudflare account OK');
}

function extractUuid(text) {
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return match ? match[0] : null;
}

function extractKvId(text) {
  // KV ids are 32 hex chars (no dashes)
  const labeled = text.match(/id\s*=\s*["']([0-9a-f]{32})["']/i);
  if (labeled) return labeled[1];
  const bare = text.match(/\b([0-9a-f]{32})\b/i);
  return bare ? bare[1] : null;
}

function listD1Id(name) {
  const out = execCapture(`${WRANGLER} d1 list`);
  const lines = out.split('\n');
  for (const line of lines) {
    if (line.includes(name)) {
      const id = extractUuid(line);
      if (id) return id;
    }
  }
  return null;
}

function ensureD1(name) {
  let id = listD1Id(name);
  if (id) {
    console.log(`D1 ${name} exists: ${id}`);
    return id;
  }
  const created = execCapture(`${WRANGLER} d1 create ${name}`);
  id = extractUuid(created) || listD1Id(name);
  if (!id) {
    console.error(`Could not create or find D1 database ${name}`);
    console.error(created);
    process.exit(1);
  }
  console.log(`D1 ${name} created: ${id}`);
  return id;
}

function listKvId(title) {
  const out = execCapture(`${WRANGLER} kv namespace list`);
  try {
    const parsed = JSON.parse(out.slice(out.indexOf('[')));
    const hit = parsed.find((ns) => ns.title === title || ns.title?.endsWith(`_${title}`));
    return hit?.id || null;
  } catch {
    const lines = out.split('\n');
    for (const line of lines) {
      if (line.includes(title)) {
        const id = extractKvId(line);
        if (id) return id;
      }
    }
  }
  return null;
}

function ensureKv(binding) {
  const title = `heyeddi-wispstat-${binding}`;
  let id = listKvId(title) || listKvId(binding);
  if (id) {
    console.log(`KV ${binding} exists: ${id}`);
    return id;
  }
  const created = execCapture(`${WRANGLER} kv namespace create ${binding}`);
  id = extractKvId(created) || listKvId(title) || listKvId(binding);
  if (!id) {
    console.error(`Could not create or find KV namespace ${binding}`);
    console.error(created);
    process.exit(1);
  }
  console.log(`KV ${binding} created: ${id}`);
  return id;
}

function ensureR2(bucket) {
  const listed = execCapture(`${WRANGLER} r2 bucket list`);
  if (listed.includes(bucket)) {
    console.log(`R2 ${bucket} exists`);
    return true;
  }
  const created = execCapture(`${WRANGLER} r2 bucket create ${bucket}`);
  if (/Created|already exists|Success/i.test(created) || execCapture(`${WRANGLER} r2 bucket list`).includes(bucket)) {
    console.log(`R2 ${bucket} ready`);
    return true;
  }
  console.warn(`R2 ${bucket} skipped (create failed). Nightly backups disabled until configured.`);
  console.warn(created);
  return false;
}

function patchWranglerToml({ coreId, ingestId, kvId, coreDatabaseIdVar, enableR2 }) {
  let toml = readFileSync('wrangler.toml', 'utf-8');

  toml = toml.replace(
    /database_name = "wispstat-core"\ndatabase_id = "[^"]+"/,
    `database_name = "wispstat-core"\ndatabase_id = "${coreId}"`
  );
  toml = toml.replace(
    /database_name = "wispstat-ingest"\ndatabase_id = "[^"]+"/,
    `database_name = "wispstat-ingest"\ndatabase_id = "${ingestId}"`
  );
  toml = toml.replace(
    /binding = "SALTS"\nid = "[^"]+"/,
    `binding = "SALTS"\nid = "${kvId}"`
  );

  if (enableR2) {
    toml = toml.replace(
      /#?\[\[r2_buckets\]\]\n#?binding = "BACKUPS"\n#?bucket_name = "wispstat-backups"\n#?[^\n]*/,
      `[[r2_buckets]]\nbinding = "BACKUPS"\nbucket_name = "wispstat-backups"`
    );
  } else {
    toml = toml.replace(
      /\[\[r2_buckets\]\]\nbinding = "BACKUPS"\nbucket_name = "wispstat-backups"\n[^\n]*/,
      `# [[r2_buckets]]\n# binding = "BACKUPS"\n# bucket_name = "wispstat-backups"\n# Optional: enable after: npx wrangler r2 bucket create wispstat-backups`
    );
  }

  if (coreDatabaseIdVar) {
    if (/D1_CORE_DATABASE_ID\s*=/.test(toml)) {
      toml = toml.replace(/D1_CORE_DATABASE_ID\s*=\s*"[^"]*"/, `D1_CORE_DATABASE_ID = "${coreId}"`);
    } else if (/\[vars\]/.test(toml)) {
      toml = toml.replace(
        /(\[vars\]\n)/,
        `$1D1_CORE_DATABASE_ID = "${coreId}"\n`
      );
    }
  }

  writeFileSync('wrangler.toml', toml);
  console.log('wrangler.toml updated with resource IDs');
}

function putSecret(name, value) {
  execSync(`${WRANGLER} secret put ${name}`, {
    input: value,
    encoding: 'utf-8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

async function main() {
  ensureWrangler();

  console.log('\nCreating D1 databases...');
  const coreId = ensureD1('wispstat-core');
  const ingestId = ensureD1('wispstat-ingest');

  console.log('\nCreating KV namespace...');
  const kvId = ensureKv('SALTS');

  let enableR2 = false;
  if (!SKIP_R2) {
    console.log('\nR2 backups bucket (optional)...');
    enableR2 = ensureR2('wispstat-backups');
  } else {
    console.log('\nSkipping R2 (--skip-r2)');
  }

  patchWranglerToml({
    coreId,
    ingestId,
    kvId,
    coreDatabaseIdVar: true,
    enableR2,
  });

  console.log('\nGenerating secrets...');
  let setupToken = generateSecret(32);
  let sessionSecret = generateSecret(32);
  let tokenKey = generateSecret(32);

  if (existsSync('.dev.vars')) {
    const reuse = await ask('Reuse existing .dev.vars secrets for production? [Y/n] ');
    if (reuse.toLowerCase() !== 'n') {
      const existing = Object.fromEntries(
        readFileSync('.dev.vars', 'utf-8')
          .split('\n')
          .filter((l) => l && !l.startsWith('#') && l.includes('='))
          .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i), l.slice(i + 1)];
          })
      );
      setupToken = existing.SETUP_TOKEN || setupToken;
      sessionSecret = existing.SESSION_SECRET || sessionSecret;
      tokenKey = existing.TOKEN_KEY || tokenKey;
    } else {
      writeFileSync(
        '.dev.vars',
        `SETUP_TOKEN=${setupToken}\nSESSION_SECRET=${sessionSecret}\nTOKEN_KEY=${tokenKey}\n`
      );
      console.log('Fresh secrets written to .dev.vars');
    }
  } else {
    writeFileSync(
      '.dev.vars',
      `SETUP_TOKEN=${setupToken}\nSESSION_SECRET=${sessionSecret}\nTOKEN_KEY=${tokenKey}\n`
    );
    console.log('Secrets written to .dev.vars');
  }

  console.log('\n*** SAVE THIS SETUP TOKEN — required to claim the instance ***');
  console.log(`\n  SETUP_TOKEN=${setupToken}\n`);

  console.log('Uploading Worker secrets...');
  putSecret('SETUP_TOKEN', setupToken);
  putSecret('SESSION_SECRET', sessionSecret);
  putSecret('TOKEN_KEY', tokenKey);

  console.log('\nApplying remote migrations...');
  exec(`${WRANGLER} d1 migrations apply CORE --remote`);
  exec(`${WRANGLER} d1 migrations apply INGEST --remote`);

  console.log('\nBuilding dashboard + tracker...');
  exec('npm run build');

  if (SKIP_DEPLOY) {
    console.log('\nBuild ready. Deploy skipped (--no-deploy).');
    console.log('When ready: npx wrangler deploy');
  } else {
    console.log('\nDeploying Worker...');
    exec(`${WRANGLER} deploy`);
  }

  console.log('\nSetup complete.');
  console.log('\nNext:');
  console.log('1. Open the workers.dev URL from the deploy output');
  console.log('2. Claim with SETUP_TOKEN above');
  console.log('3. Add a site (use a domain you control, or localhost for tests)');
  console.log('4. Paste the tracker snippet and hit the site\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
