/**
 * The candidate filter drops lines whose photoionization cross-section is too
 * small. The threshold must be relative to each table's scale: the Scofield
 * table at Ga Ka is ~20x smaller in absolute terms than the Yeh-Lindau table
 * at Al Ka, and an absolute 0.001 Mb cut-off silently removed every line of
 * H..Mg (O 1s, C 1s, N 1s, ...) for HAXPES. These tests pin the fix.
 */
import { describe, expect, it } from 'vitest';
import { getCrossSection, getMinCrossSection } from '../lib/element-db';
import { autoIdentify } from '../lib/auto-identify';
import { generateSpectrum } from './helpers/synthetic';
import { DEFAULT_SETTINGS } from './helpers/analyse';

describe('cross-section threshold', () => {
  it('keeps the historical absolute threshold for the Al Ka table', () => {
    expect(getMinCrossSection('Al')).toBeCloseTo(0.001, 9);
    expect(getMinCrossSection('Mg')).toBeCloseTo(0.001, 9);      // other lab sources reuse the Al table
    expect(getMinCrossSection('Synchrotron')).toBeCloseTo(0.001, 9);
  });

  it('is scaled down for the Ga Ka (Scofield) table so light-element 1s lines survive', () => {
    const minGa = getMinCrossSection('Ga');
    expect(minGa).toBeLessThan(0.001);
    for (const el of ['O', 'C', 'N', 'F']) {
      expect(getCrossSection(el, '1s', 'Ga')).toBeGreaterThanOrEqual(minGa);
    }
  });

  it('identifies a lone O 1s peak at Ga Ka', () => {
    // Before the fix O was never a candidate for source 'Ga', whatever the spectrum.
    const s = generateSpectrum({
      lines: [{ label: 'O 1s', be: 531.0, amplitude: 5000 }],
      beMin: 100, beMax: 1200, step: 0.5, fwhm: 1.8, eta: 0.3,
      baseline: 50, baselineSlope: 0, stepFactor: 0.005, seed: 11,
    });
    const r = autoIdentify(s.energy, s.intensity, { ...DEFAULT_SETTINGS, source: 'Ga' });
    const o = r.candidates.find(c => c.element === 'O');
    expect(o, 'O should be an accepted candidate').toBeDefined();
    expect(o!.matchedLines.map(m => m.lineName)).toContain('1s');
  });
});
