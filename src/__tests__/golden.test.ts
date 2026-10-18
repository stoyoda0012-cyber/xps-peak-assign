/**
 * Golden tests: pin the CURRENT output of the identification pipeline.
 *
 * Purpose: later PRs (photon-energy unification, regenerated cross-section /
 * BE tables, ...) will intentionally change results. These tests make every
 * such change show up as an explicit, reviewable diff of this file rather
 * than a silent drift.
 *
 * Cases inside a "KNOWN-WRONG" describe block document behaviour that is
 * believed to be incorrect today. They assert what the code produces NOW and
 * are expected to be updated (not deleted) by the PR that fixes the bug.
 *
 * Every case runs the pipeline exactly as App.tsx does for a CSV with the
 * default settings (see helpers/analyse.ts).
 */

import { describe, expect, it } from 'vitest';
import tio2Csv from '../../public/samples/tio2-wide.csv?raw';
import auSiCsv from '../../public/samples/au-si-haxpes.csv?raw';
import { parseCSV } from '../lib/parsers';
import { analyse, summarise, type GoldenSummary } from './helpers/analyse';
import { generateSpectrum, mulberry32 } from './helpers/synthetic';
import { HFO2_SI_HV, makeHfO2SiSpectrum } from './fixtures/hfo2-si-7940';

function loadCsv(text: string, name: string) {
  const region = parseCSV(text, name).regions[0];
  return { energy: region.energy, intensity: region.intensity };
}

const tio2 = loadCsv(tio2Csv, 'tio2-wide.csv');
const auSi = loadCsv(auSiCsv, 'au-si-haxpes.csv');

const AU_ALL_LINES = [
  '4d5/2', '4d3/2', '4p3/2', '4p1/2', '4s',
  '3d5/2', '3d3/2', '3p3/2', '3p1/2', '3s',
];

describe('golden: bundled samples with their intended source', () => {
  it('tio2-wide.csv @ Al Ka', () => {
    const expected: GoldenSummary = {
      chargingEV: 5.6,
      accepted: [
        { element: 'Ti', confidence: 1.0, lines: ['3p1/2', '3p3/2', '3s', '2s', 'LMM(Auger)', '2p3/2', '2p1/2'] },
        { element: 'Sn', confidence: 0.72, lines: ['4d3/2', '4d5/2', '3d5/2', '3d3/2', '3p3/2', '3p1/2'] },
        { element: 'Na', confidence: 0.3, lines: ['2s', 'KLL(Auger)', '1s'] },
        { element: 'O', confidence: 0.3, lines: ['1s', 'KLL(Auger)'] },
        { element: 'C', confidence: 0.3, lines: ['1s'] },
      ],
    };
    expect(summarise(analyse(tio2.energy, tio2.intensity, { source: 'Al' }))).toEqual(expected);
  });

  it('au-si-haxpes.csv @ Ga Ka (9251.7 eV)', () => {
    const expected: GoldenSummary = {
      chargingEV: 0,
      accepted: [
        { element: 'Au', confidence: 1.0, lines: AU_ALL_LINES },
        { element: 'Si', confidence: 0.3, lines: ['1s'] },
      ],
    };
    expect(summarise(analyse(auSi.energy, auSi.intensity, { source: 'Ga' }))).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// KNOWN-WRONG behaviour. These assertions document current output that is
// believed to be incorrect. Expected to change in PR1 / PR2; when they do,
// update the expectations here and explain the change in that PR.
// ---------------------------------------------------------------------------

describe('KNOWN-WRONG (documents current behaviour; expected to change in PR1/PR2)', () => {
  // F1: a synchrotron/HAXPES spectrum analysed with a source whose hv does
  // not match the measurement. With source 'Al', App's energy-type
  // auto-detection decides the 0-9254 eV axis is KE (median > 0.55 * 1486.6)
  // and converts it with hv = 1486.6, so the analysis runs on a nonsense
  // axis. Users who do not set the photon energy by hand silently get this.
  // Expected to change in PR1 (photon-energy unification).
  it('F1: au-si-haxpes.csv analysed as Al Ka -> spurious elements, no Au', () => {
    const expected: GoldenSummary = {
      chargingEV: 0,
      accepted: [
        { element: 'Tl', confidence: 1.0, lines: ['4p1/2', '4s'] },
        { element: 'Cs', confidence: 0.8, lines: ['3d5/2'] },
        { element: 'Bi', confidence: 0.68, lines: ['4s'] },
        { element: 'Pt', confidence: 0.65, lines: ['4s'] },
        { element: 'Fe', confidence: 0.61, lines: ['2s'] },
        { element: 'Ag', confidence: 0.5, lines: ['MNN(Auger)'] },
      ],
    };
    const got = summarise(analyse(auSi.energy, auSi.intensity, { source: 'Al' }));
    expect(got).toEqual(expected);
    expect(got.accepted.map(c => c.element)).not.toContain('Au');
  });

  // F2: source 'Synchrotron' at exactly the Ga Ka energy. The BE window is
  // right, but getCSLookup() only returns the Scofield table for source
  // === 'Ga' and falls back to the Al Ka (Yeh-Lindau) table for anything
  // else, so deep levels (Au 3d/3p/3s, Si 1s) have no cross section and are
  // dropped. Compare with the Ga Ka golden above: same hv, different result.
  // Expected to change in PR1/PR2 (hv-dependent cross sections).
  it('F2: au-si-haxpes.csv as Synchrotron @ 9251.7 eV -> Au without deep levels, no Si', () => {
    const expected: GoldenSummary = {
      chargingEV: 0,
      accepted: [
        { element: 'Au', confidence: 1.0, lines: ['4d5/2', '4d3/2', '4p3/2', '4p1/2', '4s'] },
      ],
    };
    const got = summarise(
      analyse(auSi.energy, auSi.intensity, { source: 'Synchrotron', synchrotronEV: 9251.7 }),
    );
    expect(got).toEqual(expected);
    expect(got.accepted.map(c => c.element)).not.toContain('Si');
  });

  // Synthetic HfO2/Si survey at hv = 7940 eV with Si 1s/2s/2p, Hf 3d/4f,
  // O 1s and C 1s at their database BEs (see fixtures/hfo2-si-7940.ts).
  // Today Hf is missed (Hf 3d has no entry in the Al-table cross sections,
  // same root cause as F2), O is not accepted, the Si 1s peak is not
  // assigned to Si, and Sb / Rb / In are false positives.
  // Expected to change in PR1/PR2.
  it('synthetic HfO2/Si @ Synchrotron 7940 eV', () => {
    const s = makeHfO2SiSpectrum();
    const expected: GoldenSummary = {
      chargingEV: -0.8,
      accepted: [
        { element: 'Si', confidence: 1.0, lines: ['2p1/2', '2p3/2', '2s'] },
        { element: 'Sb', confidence: 0.49, lines: ['4p1/2', '4p3/2', '4s', '3d5/2'] },
        { element: 'Rb', confidence: 0.39, lines: ['4p3/2', '4p1/2'] },
        { element: 'In', confidence: 0.31, lines: ['4d5/2', '4d3/2'] },
        { element: 'C', confidence: 0.3, lines: ['1s'] },
      ],
    };
    const got = summarise(
      analyse(s.energy, s.intensity, { source: 'Synchrotron', synchrotronEV: HFO2_SI_HV }),
    );
    expect(got).toEqual(expected);
  });
});

describe('synthetic spectrum generator', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('same seed -> identical spectrum; different seed -> different noise', () => {
    const a = makeHfO2SiSpectrum(1);
    const b = makeHfO2SiSpectrum(1);
    const c = makeHfO2SiSpectrum(2);
    expect(b).toEqual(a);
    expect(c.energy).toEqual(a.energy);
    expect(c.intensity).not.toEqual(a.intensity);
  });

  it('HfO2/Si fixture shape is pinned (guards the golden case above)', () => {
    const s = makeHfO2SiSpectrum();
    expect(s.energy.length).toBe(4201);
    expect(s.energy[0]).toBe(2100); // high BE first
    expect(s.energy[s.energy.length - 1]).toBe(0);
    expect(s.intensity.slice(0, 5)).toEqual([659, 646, 635, 664, 665]);
    expect(Math.max(...s.intensity)).toBe(2796);
  });

  it('places a lone peak at the requested BE (noise-free check via high counts)', () => {
    const s = generateSpectrum({
      lines: [{ label: 'test', be: 500, amplitude: 1e6 }],
      beMin: 400, beMax: 600, step: 0.5, fwhm: 1.5, eta: 0.3,
      baseline: 100, baselineSlope: 0, stepFactor: 0.01, seed: 7,
    });
    const iMax = s.intensity.indexOf(Math.max(...s.intensity));
    expect(s.energy[iMax]).toBe(500);
    // Step background: high-BE side sits above the low-BE side.
    expect(s.intensity[0]).toBeGreaterThan(s.intensity[s.intensity.length - 1]);
  });
});
