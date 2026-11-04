/**
 * Verify required Worker secrets exist remotely before deploy.
 *
 *   npm run check:secrets
 *
 * Optional: CHECK_SECRETS_STRICT=1 fails if optional CF_* missing.
 */

import { execSync } from 'child_process';

const required = ['SETUP_TOKEN', 'SESSION_SECRET', 'TOKEN_KEY'];
const optional = ['CF_API_TOKEN', 'CF_ACCOUNT_ID'];

function listSecrets() {
  try {
    const out = execSync('npx wrangler secret list --format json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    if (Array.isArray(parsed)) {
      return parsed.map((row) => (typeof row === 'string' ? row : row.name));
    }
    if (parsed && Array.isArray(parsed.secrets)) {
      return parsed.secrets.map((row) => (typeof row === 'string' ? row : row.name));
    }
    return [];
  } catch (error) {
    try {
      const out = execSync('npx wrangler secret list', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
    } catch (inner) {
      console.error('Could not list secrets. Are you logged in (`npx wrangler login`)?');
      console.error(inner.message || error.message);
      process.exit(1);
    }
  }
}

const names = new Set(listSecrets().filter(Boolean));
console.log(`Found ${names.size} secret(s) on the Worker.\n`);

let failed = 0;
for (const name of required) {
  if (names.has(name)) {
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.log(`✗ ${name}  missing — set with: npx wrangler secret put ${name}`);
  }
}

const strict = process.env.CHECK_SECRETS_STRICT === '1';
for (const name of optional) {
  if (names.has(name)) {
    console.log(`✓ ${name} (optional)`);
  } else if (strict) {
    failed += 1;
    console.log(`✗ ${name}  missing (strict mode)`);
  } else {
    console.log(`· ${name}  not set (optional R2 backups)`);
  }
}

console.log('');
if (failed) {
  console.error(`Secrets check FAILED (${failed} missing).`);
  process.exit(1);
}
console.log('Secrets check passed.');
