/**
 * Tests for channel grouping logic
 */

import { describe, it, expect } from 'vitest';
import { computeChannel } from '../src/lib/channels';
import { CONSTANTS } from '../edgemetry.config';
import type { BeaconPayload, Site } from '../src/lib/types';

const mockSite: Site = {
  sid: 1,
  site_id: 's_test',
  slug: 'test',
  name: 'Test Site',
  domains: ['example.com'],
  tz: 'UTC',
  currency: 'USD',
  honor_dnt: false,
  ingest_paused: false,
  digest_enabled: false,
  sessions_enabled: false,
  consent_mode: false,
  created_at: 0,
};

describe('Channel grouping', () => {
  it('identifies paid traffic by medium', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
      um: 'cpc',
      us: 'google',
    };
    
    const result = computeChannel(payload, null, ['example.com'], [mockSite]);
    expect(result.channel).toBe(CONSTANTS.CHANNEL_PAID);
  });
  
  it('identifies email by medium', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
      um: 'email',
      us: 'newsletter',
    };
    
    const result = computeChannel(payload, null, ['example.com'], [mockSite]);
    expect(result.channel).toBe(CONSTANTS.CHANNEL_EMAIL);
  });
  
  it('identifies Hacker News by source alias', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
      us: 'hn',
    };
    
    const result = computeChannel(payload, null, ['example.com'], [mockSite]);
    expect(result.channel).toBe('Hacker News');
  });
  
  it('identifies channels by referrer host', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(
      payload,
      'https://news.ycombinator.com/item?id=123',
      ['example.com'],
      [mockSite]
    );
    expect(result.channel).toBe('Hacker News');
    expect(result.ref_host).toBe('news.ycombinator.com');
  });
  
  it('identifies organic search', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(
      payload,
      'https://www.google.com/search?q=test',
      ['example.com'],
      [mockSite]
    );
    expect(result.channel).toBe(CONSTANTS.CHANNEL_ORGANIC);
  });
  
  it('ignores self-referrals', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(
      payload,
      'https://example.com/other-page',
      ['example.com'],
      [mockSite]
    );
    expect(result.channel).toBe(CONSTANTS.CHANNEL_DIRECT);
    expect(result.ref_host).toBeNull();
  });
  
  it('identifies own sites', () => {
    const otherSite: Site = {
      ...mockSite,
      sid: 2,
      site_id: 's_other',
      domains: ['other.com'],
    };
    
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(
      payload,
      'https://other.com/page',
      ['example.com'],
      [mockSite, otherSite]
    );
    expect(result.channel).toBe(CONSTANTS.CHANNEL_OWN_SITES);
    expect(result.source).toBe('other.com');
  });
  
  it('falls back to direct with no referrer or UTM', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(payload, null, ['example.com'], [mockSite]);
    expect(result.channel).toBe(CONSTANTS.CHANNEL_DIRECT);
  });
  
  it('falls back to referral for unknown referrers', () => {
    const payload: BeaconPayload = {
      s: 's_test',
      k: 'pv',
      p: '/',
    };
    
    const result = computeChannel(
      payload,
      'https://unknown-site.com',
      ['example.com'],
      [mockSite]
    );
    expect(result.channel).toBe(CONSTANTS.CHANNEL_REFERRAL);
    expect(result.ref_host).toBe('unknown-site.com');
  });
});
