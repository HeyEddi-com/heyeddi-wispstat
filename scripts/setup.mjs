/**
 * Setup script
 * Creates D1 databases, KV namespace, generates secrets, runs migrations, deploys
 */

import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

console.log('🚀 EdgeMetrics Setup\n');

function exec(cmd, options = {}) {
  console.log(`> ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`Failed to execute: ${cmd}`);
    process.exit(1);
  }
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// Check wrangler is installed
try {
  execSync('wrangler --version', { stdio: 'ignore' });
} catch {
  console.error('❌ wrangler not found. Install it: npm install -g wrangler');
  process.exit(1);
}

// Check logged in
try {
  execSync('wrangler whoami', { stdio: 'ignore' });
} catch {
  console.error('❌ Not logged into Cloudflare. Run: wrangler login');
  process.exit(1);
}

console.log('\n📦 Creating D1 databases...');
exec('wrangler d1 create edgemetrics-core || true');
exec('wrangler d1 create edgemetrics-ingest || true');

console.log('\n📦 Creating KV namespace...');
exec('wrangler kv:namespace create SALTS || true');

console.log('\n🔐 Generating secrets...');
const setupToken = generateSecret(32);
const sessionSecret = generateSecret(32);
const tokenKey = generateSecret(32);

console.log('\n⚠️  SAVE THIS SETUP TOKEN - you\'ll need it to claim your instance:');
console.log(`\n  SETUP_TOKEN=${setupToken}\n`);

// Write to .dev.vars for local development
const devVars = `SETUP_TOKEN=${setupToken}
SESSION_SECRET=${sessionSecret}
TOKEN_KEY=${tokenKey}
`;
writeFileSync('.dev.vars', devVars);
console.log('✅ Secrets written to .dev.vars for local development');

console.log('\n📝 Running migrations...');
exec('wrangler d1 migrations apply edgemetrics-core --remote');
exec('wrangler d1 migrations apply edgemetrics-ingest --remote');

console.log('\n🏗️  Building...');
exec('npm run build');

console.log('\n🚀 Deploying...');
exec('wrangler deploy');

console.log('\n✅ Setup complete!');
console.log('\nNext steps:');
console.log('1. Visit your Worker URL');
console.log('2. Claim the instance with your SETUP_TOKEN');
console.log('3. Add your first site and get the tracking snippet\n');
