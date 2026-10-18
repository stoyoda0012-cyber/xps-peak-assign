/**
 * Test helper: run the identification pipeline the same way App.tsx does
 * with the default settings, and reduce the result to a small, stable
 * summary suitable for golden assertions.
 */

import { autoIdentify } from '../../lib/auto-identify';
import { clearDBCache } from '../../lib/element-db';
import { XRAY_SOURCES, setSynchrotronEnergy } from '../../lib/energy';
import { detectEnergyType } from '../../lib/parsers';
import type { AnalysisSettings, IdentificationResult } from '../../types';

/** Default settings, identical to `defaultSettings` in src/App.tsx. */
export const DEFAULT_SETTINGS: AnalysisSettings = {
  source: 'Al',
  toleranceEV: 3.0,
  minConfidence: 0.3,
  bgMethod: 'shirley',
  includeAuger: true,
  chargingCorrection: true,
  energyType: 'auto',
};

export interface AnalyseOptions {
  source: string;
  /** Photon energy for source 'Synchrotron' (eV). */
  synchrotronEV?: number;
}

/**
 * Mirrors App.tsx for a CSV-loaded spectrum with energyType 'auto':
 *  1. For 'Synchrotron', register the custom hv and drop the cached DB
 *     (App's useMemo calls setSynchrotronEnergy + clearDBCache).
 *  2. CSV regions are tagged 'BE', so App runs detectEnergyType() with
 *     hv = XRAY_SOURCES[source]; if that says 'KE' the axis is converted
 *     with BE = hv - KE before analysis.
 *  3. autoIdentify() with the default settings and the chosen source.
 */
export function analyse(
  energy: number[],
  intensity: number[],
  { source, synchrotronEV }: AnalyseOptions,
): IdentificationResult {
  if (source === 'Synchrotron') {
    if (synchrotronEV === undefined) throw new Error('synchrotronEV required');
    setSynchrotronEnergy(synchrotronEV);
    clearDBCache('Synchrotron');
  }

  const hv = XRAY_SOURCES[source] ?? 1486.6;
  const workingEnergy =
    detectEnergyType(energy, hv) === 'KE' ? energy.map(ke => hv - ke) : energy;

  return autoIdentify(workingEnergy, intensity, { ...DEFAULT_SETTINGS, source });
}

export interface GoldenSummary {
  chargingEV: number;
  accepted: Array<{ element: string; confidence: number; lines: string[] }>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Reduce a result to element / confidence (2 dp) / matched line names / charging (2 dp). */
export function summarise(result: IdentificationResult): GoldenSummary {
  return {
    chargingEV: round2(result.chargingEV),
    accepted: result.candidates.map(c => ({
      element: c.element,
      confidence: round2(c.confidence),
      lines: c.matchedLines.map(m => m.lineName),
    })),
  };
}
