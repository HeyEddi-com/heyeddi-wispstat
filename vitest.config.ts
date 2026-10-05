import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        isolatedStorage: false,
        miniflare: {
          compatibilityDate: '2024-10-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['CORE', 'INGEST'],
          kvNamespaces: ['SALTS'],
          bindings: {
            SETUP_TOKEN: 'a'.repeat(32),
            SESSION_SECRET: 'b'.repeat(32),
            DEFAULT_TZ: 'UTC',
            AUTH_PROVIDERS: 'local',
          },
        },
      },
    },
  },
});
