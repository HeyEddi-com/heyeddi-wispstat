import { describe, expect, it } from 'vitest';
import { digestText } from '../src/cron/digest';

const empty = { visitors: 0, pv: 0, topSource: 'Direct', topPage: '/', conversions: 0, revenue: 0 };

describe('weekly digest', () => {
  it('flags a visitor spike above 3x', () => {
    const body = digestText('Blog', { ...empty, visitors: 40, pv: 80 }, { ...empty, visitors: 10, pv: 20 });
    expect(body.anomaly).toBe(true);
    expect(body.text).toContain('Blog');
    expect(body.text).toContain('Anomaly');
  });

  it('does not flag a normal week', () => {
    const body = digestText('Blog', { ...empty, visitors: 12 }, { ...empty, visitors: 10 });
    expect(body.anomaly).toBe(false);
  });
});
