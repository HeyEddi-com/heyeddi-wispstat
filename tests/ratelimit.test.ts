import { describe, expect, it } from 'vitest';
import { allowRequest } from '../src/lib/ratelimit';

describe('rate limit', () => {
  it('allows a burst and then refuses until the window moves', () => {
    const key = `test:${Math.random()}`;
    expect(allowRequest(key, 2, 60, 1_000)).toBe(true);
    expect(allowRequest(key, 2, 60, 1_010)).toBe(true);
    expect(allowRequest(key, 2, 60, 1_020)).toBe(false);
    expect(allowRequest(key, 2, 60, 1_060)).toBe(true);
  });
});
