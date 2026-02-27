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
import { identifyCandidates, getCrossSection, getElement, setSource } from './element-db';
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
// SO pair recovery by splitting pattern
// ============================================================================

/**
 * Recover spin-orbit pair assignments using the splitting pattern.
 * When only one SO member matched (or both mapped to the same peak),
 * search detected peaks for a pair whose splitting matches the expected value.
 * This handles chemical-state shifts that move both peaks by the same amount.
 */
function recoverSOPairMatches(
  candidates: Map<string, ElementCandidate>,
  detected: DetectedPeak[],
  toleranceEV: number,
): void {
  const splitTolerance = Math.max(toleranceEV, 2.0);

  for (const [elemSym, cand] of candidates) {
    const elem = getElement(elemSym);
    if (!elem) continue;

    for (const soPair of elem.spinOrbitPairs) {
      const clHi = elem.coreLevels.find(c => c.name === soPair.levelHigh);
      const clLo = elem.coreLevels.find(c => c.name === soPair.levelLow);
      if (!clHi || !clLo) continue;

      // Check current match state
      const hiLines = cand.matchedLines.filter(ml => ml.lineName === soPair.levelHigh);
      const loLines = cand.matchedLines.filter(ml => ml.lineName === soPair.levelLow);

      // Only recover when at least one member already matched
      if (hiLines.length === 0 && loLines.length === 0) continue;

      // Already matched to two different peaks? Skip
      if (hiLines.length > 0 && loLines.length > 0) {
        const hiPeaks = new Set(hiLines.map(m => m.detectedBE));
        const loPeaks = new Set(loLines.map(m => m.detectedBE));
        let different = false;
        for (const hp of hiPeaks) for (const lp of loPeaks) if (hp !== lp) different = true;
        if (different) continue;
      }

      // Search all pairs of detected peaks for a matching splitting pattern
      const expectedSplit = soPair.splitting;
      const expectedCenter = (clHi.bindingEnergy + clLo.bindingEnergy) / 2;
      const centerTolerance = 8.0; // Wide enough for chemical shifts

      let bestScore = Infinity;
      let bestHiPk: DetectedPeak | null = null;
      let bestLoPk: DetectedPeak | null = null;

      for (let i = 0; i < detected.length; i++) {
        for (let j = i + 1; j < detected.length; j++) {
          const split = Math.abs(detected[i].position - detected[j].position);
          if (Math.abs(split - expectedSplit) > splitTolerance) continue;

          // Lower BE = high-j (e.g., 2p3/2), higher BE = low-j (e.g., 2p1/2)
          const [pkHi, pkLo] = detected[i].position < detected[j].position
            ? [detected[i], detected[j]]
            : [detected[j], detected[i]];

          const observedCenter = (pkHi.position + pkLo.position) / 2;
          const centerDiff = Math.abs(observedCenter - expectedCenter);
          if (centerDiff > centerTolerance) continue;

          const score = centerDiff + Math.abs(split - expectedSplit) * 2;
          if (score < bestScore) {
            bestScore = score;
            bestHiPk = pkHi;
            bestLoPk = pkLo;
          }
        }
      }

      if (bestHiPk && bestLoPk) {
        // Remove any existing matches for these SO pair lines
        cand.matchedLines = cand.matchedLines.filter(ml =>
          ml.lineName !== soPair.levelHigh && ml.lineName !== soPair.levelLow
        );

        cand.matchedLines.push({
          lineName: soPair.levelHigh,
          lineType: 'photo',
          databaseBE: clHi.bindingEnergy,
          detectedBE: bestHiPk.position,
          deltaEV: bestHiPk.position - clHi.bindingEnergy,
          crossSection: clHi.crossSection,
        });
        cand.matchedLines.push({
          lineName: soPair.levelLow,
          lineType: 'photo',
          databaseBE: clLo.bindingEnergy,
          detectedBE: bestLoPk.position,
          deltaEV: bestLoPk.position - clLo.bindingEnergy,
          crossSection: clLo.crossSection,
        });
      }
    }
  }
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

  // Set active source for element DB (controls accessible BE range)
  setSource(source);

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

  // 4b. Recover SO pairs by splitting pattern (handles chemical shifts)
  recoverSOPairMatches(candidates, detected, toleranceEV);

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
