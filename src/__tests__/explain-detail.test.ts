import { describe, expect, it } from 'vitest';
import { explainDetail, summariseScore } from '../lib/explain-detail';
import type { ElementCandidate, IdentificationResult } from '../types';

const ALL_TOKENS =
  'pos=2.91(6lines); SO(2p3/2/2p1/2)=2.17; SO(4d5/2/4d3/2)=0.36; cs_ratio=8.25; auger=0.90; ' +
  'penalty(missing 2p3/2); SO_miss(3d3/2); scatter(σ=4.1); chem_shift(μ=-0.6,σ=0.8); ' +
  'multi(4grp/6lines)x1.9; prom_floor; charging_ref; something_new';

describe('explainDetail', () => {
  it('maps every known token to a row with the right kind and effect', () => {
    const rows = explainDetail(ALL_TOKENS, 'en');
    expect(rows.map(r => [r.kind, r.effect])).toEqual([
      ['base', '+2.91'],
      ['bonus', '+2.17'],
      ['bonus', '+0.36'],
      ['bonus', '+8.25'],
      ['bonus', '+0.90'],
      ['penalty', '×0.3'],
      ['penalty', '×0.5'],
      ['penalty', '×0.3'],
      ['bonus', '×1.3'],
      ['bonus', '×1.9'],
      ['note', ''],
      ['note', ''],
      ['note', ''],
    ]);
  });

  it('splits spin-orbit pairs whose level names contain a slash', () => {
    const [row] = explainDetail('SO(2p3/2/2p1/2)=2.17', 'en');
    expect(row.observation).toContain('2p3/2 and 2p1/2');
    const [row2] = explainDetail('SO(4d5/2/4d3/2)=0.36', 'ja');
    expect(row2.observation).toContain('4d5/2 と 4d3/2');
  });

  it('passes unknown tokens through unchanged', () => {
    const [row] = explainDetail('something_new', 'en');
    expect(row).toEqual({ kind: 'note', label: 'something_new', observation: '', effect: '' });
  });

  it('gives Japanese and English text', () => {
    expect(explainDetail('pos=1.00(1lines)', 'ja')[0].label).toBe('位置一致');
    expect(explainDetail('pos=1.00(1lines)', 'en')[0].label).toBe('Position match');
  });
});

function cand(element: string, rawScore: number, confidence: number, detail = ''): ElementCandidate {
  return { element, rawScore, confidence, detail, matchedLines: [] };
}

function result(candidates: ElementCandidate[], rejected: ElementCandidate[] = []): IdentificationResult {
  return {
    elements: candidates.map(c => c.element),
    confidences: {},
    candidates,
    detectedPeaks: [],
    signal: [],
    background: [],
    rejected,
    chargingEV: 0,
  };
}

describe('summariseScore', () => {
  it('normalises by the highest raw score across accepted and rejected candidates', () => {
    const ti = cand('Ti', 20, 1.0);
    const sn = cand('Sn', 14.4, 0.72);
    const s = summariseScore(sn, result([ti, sn]));
    expect(s.topElement).toBe('Ti');
    expect(s.maxScore).toBe(20);
    expect(s.ratio).toBeCloseTo(0.72, 5);
    expect(s.floored).toBe(false);
  });

  it('flags candidates raised by the prominence floor', () => {
    const ti = cand('Ti', 20, 1.0);
    const o = cand('O', 2, 0.3, 'pos=1.0(1lines); prom_floor');
    const s = summariseScore(o, result([ti, o]));
    expect(s.ratio).toBeCloseTo(0.1, 5);
    expect(s.confidence).toBe(0.3);
    expect(s.floored).toBe(true);
  });
});
