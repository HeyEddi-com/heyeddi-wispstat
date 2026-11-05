import { describe, expect, it } from 'vitest';
import { funnelCounts } from '../src/lib/funnel';
import { convertMinor } from '../src/lib/money';
import { digestText } from '../src/cron/digest';

describe('ordered funnels', () => {
  it('counts a visitor only after earlier steps', () => {
    const counts = funnelCounts(['signup', 'pay'], [
      { vh: 'a', name: 'pay', ts: 1 },
      { vh: 'a', name: 'signup', ts: 2 },
      { vh: 'b', name: 'signup', ts: 1 },
      { vh: 'b', name: 'pay', ts: 2 },
    ]);
    expect(counts).toEqual([2, 1]);
  });
});

describe('currency conversion', () => {
  it('converts minor units through USD rates', () => {
    expect(convertMinor(100, 'EUR', 'USD', { EUR: 1.1, USD: 1 })).toBe(110);
    expect(convertMinor(50, 'USD', 'USD', {})).toBe(50);
  });
});

describe('slack digest', () => {
  it('includes totals and no email address', () => {
    const text = digestText('Example', 12, 40, 'Organic Search (9)');
    expect(text).toContain('Visitors 12');
    expect(text).not.toMatch(/@/);
  });
});
