/**
 * Local gate before `npm run deploy`.
 *
 *   npm run predeploy
 *   npm run predeploy -- --skip-secrets   # CI / no wrangler login
 */

import { spawnSync } from 'child_process';

const skipSecrets = process.argv.includes('--skip-secrets');

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`\npredeploy stopped: ${label} failed`);
    process.exit(result.status || 1);
  }
}

run('typecheck', 'npm', ['run', 'typecheck']);
run('tests', 'npm', ['test']);
run('build', 'npm', ['run', 'build']);

if (!skipSecrets) {
  run('secrets', 'npm', ['run', 'check:secrets']);
} else {
  console.log('\n=== secrets ===\nskipped (--skip-secrets)');
}

run('mcp syntax', 'node', ['--check', 'mcp/src/index.js']);

console.log('\npredeploy OK — safe to `npm run deploy`, then `npm run smoke -- <url>`.');
