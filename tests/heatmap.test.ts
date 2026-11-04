import { describe, expect, it } from 'vitest';
import { parseHeatName, parseScrollName, HEAT_GRID } from '../src/api/heatmap';

describe('heatmap parsers', () => {
  it('parses grid cells', () => {
    expect(parseHeatName('hm.0.0')).toEqual({ gx: 0, gy: 0 });
    expect(parseHeatName(`hm.${HEAT_GRID - 1}.${HEAT_GRID - 1}`)).toEqual({
      gx: HEAT_GRID - 1,
      gy: HEAT_GRID - 1,
    });
    expect(parseHeatName('hm.12.0')).toBeNull();
    expect(parseHeatName('outbound:x.com')).toBeNull();
  });

  it('parses scroll milestones', () => {
    expect(parseScrollName('scroll.25')).toBe(25);
    expect(parseScrollName('scroll.100')).toBe(100);
    expect(parseScrollName('scroll.30')).toBeNull();
  });
});
