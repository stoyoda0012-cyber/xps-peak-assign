/**
 * auto-identify.ts: Main orchestrator for automatic element identification.
 * Ported from auto_identify.py ElementIdentifier.identify().
 *
 * Pipeline:
 *   1. Background subtraction (Shirley)
 *   2. Peak detection (S/N-adaptive)
 *   3. Charging correction (C 1s)
 *   4. DB matching
 *   5. Scoring + ranking
 */

import type {
  AnalysisSettings, DetectedPeak, ElementCandidate,
  IdentificationResult, MatchedLine,
} from '../types';
import { subtractBackground } from './background';
import { detectPeaks } from './peak-detection';
import { identifyCandidates, getCrossSection } from './element-db';
import { scoreCandidates, resolveAndRank, MIN_CROSS_SECTION } from './scoring';

// Charging constants
const C1S_REFERENCE_BE = 284.8;
const C1S_SEARCH_RANGE: [number, number] = [270, 320];
const MAX_CHARGING_EV = 35.0;

// ============================================================================
// Charging correction
// ============================================================================

function estimateCharging(detected: DetectedPeak[]): number {
  const c1sCandidates = detected.filter(
    pk => pk.position >= C1S_SEARCH_RANGE[0] && pk.position <= C1S_SEARCH_RANGE[1]
  );
  if (c1sCandidates.length === 0) return 0.0;

  // Pick most prominent
  const best = c1sCandidates.reduce((a, b) =>
    a.prominence > b.prominence ? a : b
  );
  const charging = best.position - C1S_REFERENCE_BE;

  if (Math.abs(charging) > MAX_CHARGING_EV) return 0.0;
  return charging;
}

// ============================================================================
// Main identification
// ============================================================================

export function autoIdentify(
  energy: number[],
  intensity: number[],
  settings: AnalysisSettings,
): IdentificationResult {
  const {
    source,
    toleranceEV,
    minConfidence,
    includeAuger,
    chargingCorrection,
  } = settings;

  // 1. Background subtraction
  const [signal, background] = subtractBackground(energy, intensity);

  // 2. Normalize to ascending BE
  let eAsc: number[], sAsc: number[];
  let reversed = false;
  if (energy[0] > energy[energy.length - 1]) {
    eAsc = [...energy].reverse();
    sAsc = [...signal].reverse();
    reversed = true;
  } else {
    eAsc = energy;
    sAsc = signal;
  }

  // 3. Detect peaks
  let detected = detectPeaks(eAsc, sAsc);
  if (reversed) {
    const n = energy.length;
    detected = detected.map(pk => ({
      ...pk,
      index: n - 1 - pk.index,
    }));
  }

  // 3b. Charging correction
  let chargingEV = 0.0;
  if (chargingCorrection && detected.length > 0) {
    chargingEV = estimateCharging(detected);
  }
  if (Math.abs(chargingEV) > 0.5) {
    detected = detected.map(pk => ({
      ...pk,
      position: pk.position - chargingEV,
    }));
  }

  // 4. Match to element database
  const positions = detected.map(pk => pk.position);
  const allMatches = identifyCandidates(positions, toleranceEV, source, includeAuger);

  // Group by element
  const candidates = new Map<string, ElementCandidate>();
  for (let peakIdx = 0; peakIdx < detected.length; peakIdx++) {
    const pk = detected[peakIdx];
    const matches = allMatches[peakIdx];

    for (const [elemSym, lineName, dbBE, delta] of matches) {
      const isAuger = lineName.includes('(Auger)');
      let cs = 0;
      if (!isAuger) {
        cs = getCrossSection(elemSym, lineName);
        if (cs < MIN_CROSS_SECTION) continue;
      }

      const ml: MatchedLine = {
        lineName,
        lineType: isAuger ? 'auger' : 'photo',
        databaseBE: dbBE,
        detectedBE: pk.position,
        deltaEV: delta,
        crossSection: cs,
      };

      if (!candidates.has(elemSym)) {
        candidates.set(elemSym, {
          element: elemSym,
          confidence: 0,
          rawScore: 0,
          matchedLines: [],
          detail: '',
        });
      }
      candidates.get(elemSym)!.matchedLines.push(ml);
    }
  }

  // 5. Score candidates
  const eMin = Math.min(...eAsc);
  const eMax = Math.max(...eAsc);
  scoreCandidates(candidates, detected, eMin, eMax, toleranceEV);

  // 6. Resolve and rank
  const ranked = resolveAndRank(candidates, detected, minConfidence, toleranceEV);

  // Split accepted/rejected
  const accepted = ranked.filter(c => c.confidence >= minConfidence);
  const rejected = ranked.filter(c => c.confidence < minConfidence);

  // Ensure C in accepted if charging correction applied
  if (Math.abs(chargingEV) > 0.5) {
    const cInAccepted = accepted.some(c => c.element === 'C');
    if (!cInAccepted) {
      let cCand: ElementCandidate | null = null;
      const cIdx = rejected.findIndex(c => c.element === 'C');
      if (cIdx >= 0) {
        cCand = rejected.splice(cIdx, 1)[0];
      }
      if (!cCand) {
        const c1sPeak = detected
          .filter(pk => pk.position >= C1S_SEARCH_RANGE[0] && pk.position <= C1S_SEARCH_RANGE[1])
          .reduce<DetectedPeak | null>((best, pk) =>
            !best || pk.prominence > best.prominence ? pk : best, null
          );
        if (c1sPeak) {
          cCand = {
            element: 'C',
            confidence: minConfidence,
            rawScore: 0,
            matchedLines: [{
              lineName: '1s',
              lineType: 'photo',
              databaseBE: C1S_REFERENCE_BE,
              detectedBE: c1sPeak.position,
              deltaEV: c1sPeak.position - C1S_REFERENCE_BE,
              crossSection: 0.013,
            }],
            detail: 'charging_ref',
          };
        }
      }
      if (cCand) {
        cCand.confidence = Math.max(cCand.confidence, minConfidence);
        accepted.push(cCand);
      }
    }
  }

  // Restore original positions for reporting
  if (Math.abs(chargingEV) > 0.5) {
    detected = detected.map(pk => ({
      ...pk,
      position: pk.position + chargingEV,
    }));
  }

  return {
    elements: accepted.map(c => c.element),
    confidences: Object.fromEntries(accepted.map(c => [c.element, c.confidence])),
    candidates: accepted,
    detectedPeaks: detected,
    signal,
    background,
    rejected,
    chargingEV,
  };
}
