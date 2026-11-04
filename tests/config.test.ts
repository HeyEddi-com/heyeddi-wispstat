import { describe, expect, it } from 'vitest';
import { getConfig } from '../wispstat.config';

describe('getConfig', () => {
  it('requires SETUP_TOKEN length', () => {
    expect(() => getConfig({ SETUP_TOKEN: 'short' })).toThrow(/SETUP_TOKEN/);
  });

  it('is local-auth only and has no slack/firebase fields', () => {
    const config = getConfig({
      SETUP_TOKEN: 'a'.repeat(32),
      DEFAULT_TZ: 'America/Mexico_City',
    });
    expect(config.authProviders).toEqual(['local']);
    expect(config.defaultTz).toBe('America/Mexico_City');
    expect(config.schedules).toEqual({
      hourly: '5 * * * *',
      nightly: '0 9 * * *',
    });
    expect('slackWebhookUrl' in config).toBe(false);
    expect('firebaseProjectId' in config).toBe(false);
  });
});
