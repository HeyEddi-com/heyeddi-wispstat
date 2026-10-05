/**
 * Reset the local owner password (user local:1) on the remote CORE database.
 * No email is sent. The new hash matches the Worker's PBKDF2 format.
 */

import { execSync } from 'child_process';
import { pbkdf2Sync, randomBytes } from 'crypto';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return `pbkdf2:100000:${salt.toString('base64')}:${hash.toString('base64')}`;
}

async function main() {
  console.log('Owner password reset\n');
  const newPassword = await question('Enter new password (≥12 chars): ');
  if (newPassword.length < 12) {
    console.log('Password must be at least 12 characters');
    rl.close();
    process.exit(1);
  }
  const confirm = await question('Reset local:1 on remote wispstat-core? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    rl.close();
    process.exit(0);
  }

  const pwHash = hashPassword(newPassword);
  const sql = `UPDATE users SET pw_hash = '${pwHash}' WHERE user_id = 'local:1'; DELETE FROM login_sessions WHERE user_id = 'local:1';`;
  execSync(`wrangler d1 execute wispstat-core --remote --command ${JSON.stringify(sql)}`, { stdio: 'inherit' });
  console.log('Password updated. Existing sessions were signed out.');
  rl.close();
}

main().catch((error) => {
  console.error(error.message || error);
  rl.close();
  process.exit(1);
});
