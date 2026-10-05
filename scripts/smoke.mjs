/**
 * Smoke test
 * Quick post-deploy validation
 */

import { execSync } from 'child_process';

console.log('🧪 Running smoke tests...\n');

// Get Worker URL from wrangler
let workerUrl;
try {
  const output = execSync('wrangler deployments list --json', { encoding: 'utf-8' });
  const deployments = JSON.parse(output);
  if (deployments.length > 0) {
    workerUrl = deployments[0].url;
  }
} catch {
  console.log('⚠️  Could not determine Worker URL from wrangler');
  process.exit(1);
}

console.log(`Worker URL: ${workerUrl}\n`);

// Test 1: Health check
console.log('Test 1: Health check');
try {
  const response = await fetch(`${workerUrl}/health`);
  const data = await response.json();
  if (data.status === 'ok') {
    console.log('✅ Health check passed\n');
  } else {
    console.log('❌ Health check failed\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`❌ Health check error: ${error.message}\n`);
  process.exit(1);
}

// Test 2: Config endpoint
console.log('Test 2: Config endpoint');
try {
  const response = await fetch(`${workerUrl}/config`);
  const data = await response.json();
  if ('claimed' in data && 'auth_providers' in data) {
    console.log('✅ Config endpoint passed');
    console.log(`   Claimed: ${data.claimed}`);
    console.log(`   Auth providers: ${data.auth_providers.join(', ')}\n`);
  } else {
    console.log('❌ Config endpoint returned unexpected data\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`❌ Config endpoint error: ${error.message}\n`);
  process.exit(1);
}

// Test 3: Collector CORS preflight
console.log('Test 3: Collector CORS preflight');
try {
  const response = await fetch(`${workerUrl}/e`, {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'POST',
    },
  });
  if (response.status === 204 && response.headers.get('access-control-allow-origin')) {
    console.log('✅ Collector CORS preflight passed\n');
  } else {
    console.log('❌ Collector CORS preflight failed\n');
    process.exit(1);
  }
} catch (error) {
  console.log(`❌ Collector CORS error: ${error.message}\n`);
  process.exit(1);
}

console.log('✅ All smoke tests passed!\n');
