import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    // Shared D1/KV bindings: run files one-at-a-time to avoid claim/site races.
    fileParallelism: false,
    poolOptions: {
      workers: {
        isolatedStorage: false,
        singleWorker: true,
        miniflare: {
          compatibilityDate: '2024-10-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['CORE', 'INGEST'],
          kvNamespaces: ['SALTS'],
          bindings: {
            SETUP_TOKEN: 'a'.repeat(32),
            SESSION_SECRET: 'b'.repeat(32),
            TOKEN_KEY: 'c'.repeat(32),
            DEFAULT_TZ: 'UTC',
          },
        },
      },
    },
  },
});
