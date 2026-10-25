import { describe, expect, it } from 'vitest';
import { buildDisplaySeries } from '../lib/chart-data';

// Descending BE, as most instrument exports (and the bundled Au/Si sample) are
const be = [1100, 1099.6, 1099.2, 500, 0.4, 0];
const raw = [10, 20, 30, 40, 50, 60];
const result = { background: [1, 2, 3, 4, 5, 6], signal: [9, 18, 27, 36, 45, 54] };

const isAscending = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);

describe('buildDisplaySeries', () => {
  it('sorts descending BE input ascending for the BE axis and keeps rows aligned', () => {
    const s = buildDisplaySeries(be, raw, result, false, 1486.6);
    expect(isAscending(s.x)).toBe(true);
    expect(s.x).toEqual([0, 0.4, 500, 1099.2, 1099.6, 1100]);
    expect(s.raw).toEqual([60, 50, 40, 30, 20, 10]);
    expect(s.background).toEqual([6, 5, 4, 3, 2, 1]);
    expect(s.signal).toEqual([54, 45, 36, 27, 18, 9]);
  });

  it('leaves ascending BE input in place', () => {
    const asc = [...be].reverse();
    const s = buildDisplaySeries(asc, [60, 50, 40, 30, 20, 10], null, false, 1486.6);
    expect(s.x).toEqual(asc);
    expect(s.raw).toEqual([60, 50, 40, 30, 20, 10]);
    expect(s.background).toBeNull();
    expect(s.signal).toBeNull();
  });

  it('converts to KE and sorts ascending (descending BE is already ascending KE)', () => {
    const s = buildDisplaySeries(be, raw, result, true, 1486.6);
    expect(isAscending(s.x)).toBe(true);
    expect(s.x[0]).toBeCloseTo(1486.6 - 1100);
    expect(s.x[5]).toBeCloseTo(1486.6);
    expect(s.raw).toEqual(raw);
    expect(s.signal).toEqual(result.signal);
  });

  it('handles ascending BE input on the KE axis (needs reversing)', () => {
    const asc = [...be].reverse();
    const s = buildDisplaySeries(asc, [60, 50, 40, 30, 20, 10], null, true, 1486.6);
    expect(isAscending(s.x)).toBe(true);
    expect(s.raw).toEqual([10, 20, 30, 40, 50, 60]);
  });
});
