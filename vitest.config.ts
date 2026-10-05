import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2024-10-01',
          compatibilityFlags: ['nodejs_compat'],
          // Use in-memory D1 and KV for tests
          bindings: {
            CORE: { d1: true },
            INGEST: { d1: true },
            SALTS: { kv: true },
          },
        },
      },
    },
  },
});
