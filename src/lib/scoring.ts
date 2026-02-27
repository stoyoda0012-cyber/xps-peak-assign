/**
 * scoring.ts: Multi-heuristic scoring engine for element candidates.
 * Ported from auto_identify.py _score_candidates() and _resolve_and_rank().
 *
 * Scoring components:
 *   A. Position match (prominence-weighted Gaussian) — per line
 *   B. SO pair confirmation — 3.0 per pair (splitting + intensity ratio)
 *   C. Cross-section ratio consistency — 1.5 per inter-group pair
 *   D. Auger confirmation — 2.0 per line
 *   E. Strongest-line penalty — x0.3 if missing
 *   F. Multi-line bonus — x1.3 per extra shell group
 */

import type { DetectedPeak, ElementCandidate, MatchedLine } from '../types';
import { getElement } from './element-db';

const MIN_CROSS_SECTION = 0.001; // Mb

export { MIN_CROSS_SECTION };

export function scoreCandidates(
  candidates: Map<string, ElementCandidate>,
  detected: DetectedPeak[],
  eMin: number,
  eMax: number,
  toleranceEV: number,
): void {
  // Use toleranceEV as sigma (not /2) — chemical shifts in survey spectra can be large
  const sigmaPos = toleranceEV;

  // Build quick lookups
  const peakHeightMap = new Map<number, number>();
  const peakPromMap = new Map<number, number>();
  let maxProminence = 1.0;
  for (const pk of detected) {
    peakHeightMap.set(pk.position, pk.height);
    peakPromMap.set(pk.position, pk.prominence);
    if (pk.prominence > maxProminence) maxProminence = pk.prominence;
  }

  for (const [, cand] of candidates) {
    let score = 0.0;
    const details: string[] = [];

    // De-duplicate matched lines (keep closest match per line)
    const seenLines = new Map<string, MatchedLine>();
    for (const ml of cand.matchedLines) {
      const existing = seenLines.get(ml.lineName);
      if (!existing || Math.abs(ml.deltaEV) < Math.abs(existing.deltaEV)) {
        seenLines.set(ml.lineName, ml);
      }
    }
    const uniqueLines = Array.from(seenLines.values());
    cand.matchedLines = uniqueLines;

    const photoLines = uniqueLines.filter(ml => ml.lineType === 'photo');
    const augerLines = uniqueLines.filter(ml => ml.lineType === 'auger');

    // --- A. Position match score (prominence-weighted) ---
    let aScore = 0.0;
    for (const ml of photoLines) {
      const w = Math.exp(-0.5 * (ml.deltaEV / sigmaPos) ** 2);
      const prom = peakPromMap.get(ml.detectedBE) ?? 0;
      const promWeight = 1.0 + 2.0 * (prom / maxProminence);
      aScore += promWeight * w;
    }
    score = aScore;
    if (photoLines.length > 0) {
      details.push(`pos=${aScore.toFixed(2)}(${photoLines.length}lines)`);
    }

    // --- B. SO pair confirmation (3.0 per pair) ---
    let bScore = 0.0;
    const elemData = getElement(cand.element);
    if (elemData) {
      for (const soPair of elemData.spinOrbitPairs) {
        const mlHi = seenLines.get(soPair.levelHigh);
        const mlLo = seenLines.get(soPair.levelLow);
        if (mlHi && mlLo) {
          const observedSplit = Math.abs(mlLo.detectedBE - mlHi.detectedBE);
          const expectedSplit = soPair.splitting;
          const splitErr = Math.abs(observedSplit - expectedSplit);
          if (splitErr < 1.5) {
            const splitQ = Math.exp(-0.5 * (splitErr / 0.5) ** 2);
            const hHi = peakHeightMap.get(mlHi.detectedBE) ?? 1.0;
            const hLo = peakHeightMap.get(mlLo.detectedBE) ?? 1.0;
            const expectedRatio = soPair.ratioHigh / Math.max(soPair.ratioLow, 1e-10);
            let ratioQ = 0.5;
            if (hLo > 1e-10) {
              const obsRatio = hHi / hLo;
              const ratioErr = Math.abs(obsRatio / expectedRatio - 1.0);
              ratioQ = Math.exp(-(ratioErr ** 2));
            }
            const pairBonus = 3.0 * splitQ * ratioQ;
            bScore += pairBonus;
            details.push(`SO(${soPair.levelHigh}/${soPair.levelLow})=${pairBonus.toFixed(2)}`);
          }
        }
      }
    }
    score += bScore;

    // --- C. Cross-section ratio consistency (1.5 per inter-group pair) ---
    let cScore = 0.0;
    if (photoLines.length >= 2) {
      // Group by shell (n,l): '3d5/2' and '3d3/2' → same '3d' group
      const shellGroups = new Map<string, MatchedLine>();
      for (const ml of photoLines) {
        const nl = ml.lineName.slice(0, 2);
        const existing = shellGroups.get(nl);
        if (!existing || ml.crossSection > existing.crossSection) {
          shellGroups.set(nl, ml);
        }
      }
      const groupReps = Array.from(shellGroups.values());

      for (let i = 0; i < groupReps.length; i++) {
        for (let j = i + 1; j < groupReps.length; j++) {
          const li = groupReps[i], lj = groupReps[j];
          if (li.crossSection > 1e-10 && lj.crossSection > 1e-10) {
            const expectedR = li.crossSection / lj.crossSection;
            const hI = peakHeightMap.get(li.detectedBE) ?? 1.0;
            const hJ = peakHeightMap.get(lj.detectedBE) ?? 1.0;
            if (hJ > 1e-10 && hI > 1e-10) {
              const observedR = hI / hJ;
              const logErr = Math.abs(Math.log(observedR / expectedR));
              if (logErr < Math.log(3)) {
                const csQ = Math.exp(-(logErr ** 2) / (2 * (Math.log(2) ** 2)));
                cScore += 1.5 * csQ;
              }
            }
          }
        }
      }
    }
    score += cScore;
    if (cScore > 0) details.push(`cs_ratio=${cScore.toFixed(2)}`);

    // --- D. Auger confirmation (2.0 per line) ---
    let dScore = 0.0;
    for (const ml of augerLines) {
      const w = Math.exp(-0.5 * (ml.deltaEV / sigmaPos) ** 2);
      dScore += 2.0 * w;
    }
    score += dScore;
    if (dScore > 0) details.push(`auger=${dScore.toFixed(2)}`);

    // --- E. Strongest-line penalty (x0.3) ---
    // Skip penalty if SO pair was confirmed (chemical shift moves both members)
    if (elemData && elemData.coreLevels.length > 0 && bScore === 0) {
      const strongest = elemData.coreLevels.reduce((a, b) =>
        a.crossSection > b.crossSection ? a : b
      );
      if (eMin <= strongest.bindingEnergy && strongest.bindingEnergy <= eMax
          && !seenLines.has(strongest.name)) {
        score *= 0.3;
        details.push(`penalty(missing ${strongest.name})`);
      }
    }

    // --- E2. Missing SO partner penalty (x0.5) ---
    // If one SO member matched but partner is in range and not found, penalize
    if (elemData && bScore === 0) {
      for (const soPair of elemData.spinOrbitPairs) {
        const hasHi = seenLines.has(soPair.levelHigh);
        const hasLo = seenLines.has(soPair.levelLow);
        if ((hasHi || hasLo) && !(hasHi && hasLo)) {
          // One matched, one missing — check if missing partner is in accessible range
          const missingLevel = hasHi ? soPair.levelLow : soPair.levelHigh;
          const missingCL = elemData.coreLevels.find(c => c.name === missingLevel);
          if (missingCL && eMin <= missingCL.bindingEnergy && missingCL.bindingEnergy <= eMax
              && soPair.splitting > 2.0) {  // only if splitting is resolvable
            score *= 0.5;
            details.push(`SO_miss(${missingLevel})`);
            break;  // apply once
          }
        }
      }
    }

    // --- F+G. Delta consistency then multi-line bonus ---
    // Real elements have consistent chemical shifts (low delta std).
    // Coincidental matches show scattered deltas → skip multi-line bonus.
    let isScattered = false;
    if (photoLines.length >= 3) {
      const deltas = photoLines.map(ml => ml.deltaEV);
      const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const variance = deltas.reduce((a, d) => a + (d - meanDelta) ** 2, 0) / deltas.length;
      const std = Math.sqrt(variance);
      if (std > toleranceEV) {
        score *= 0.3;
        isScattered = true;
        details.push(`scatter(σ=${std.toFixed(1)})`);
      } else if (std < toleranceEV / 2) {
        score *= 1.3;
        details.push(`chem_shift(μ=${meanDelta.toFixed(1)},σ=${std.toFixed(1)})`);
      }
    }

    // Multi-line bonus: x1.3 per extra shell group (skip if scattered)
    if (!isScattered) {
      const shellSet = new Set<string>();
      for (const ml of photoLines) {
        shellSet.add(ml.lineName.slice(0, 2));
      }
      const nGroups = shellSet.size;
      if (nGroups >= 2) {
        const multiplier = 1.0 + 0.3 * (nGroups - 1);
        score *= multiplier;
        details.push(`multi(${nGroups}grp/${photoLines.length}lines)x${multiplier.toFixed(1)}`);
      }
    }

    cand.rawScore = score;
    cand.detail = details.join('; ');
  }
}

export function resolveAndRank(
  candidates: Map<string, ElementCandidate>,
  detected: DetectedPeak[],
  minConfidence: number,
  toleranceEV: number,
): ElementCandidate[] {
  if (candidates.size === 0) return [];

  const ranked = Array.from(candidates.values()).sort((a, b) => b.rawScore - a.rawScore);
  let maxScore = ranked[0].rawScore;
  if (maxScore < 1e-10) maxScore = 1.0;

  // Build prominence ranking
  const sortedPeaks = [...detected].sort((a, b) => b.prominence - a.prominence);
  const nTop = Math.max(3, Math.floor(sortedPeaks.length / 3));
  const topPositions = new Set(sortedPeaks.slice(0, nTop).map(p => p.position));

  for (const cand of ranked) {
    cand.confidence = cand.rawScore / maxScore;

    // Prominence-based minimum floor
    const hasPenalty = cand.detail.includes('penalty(') || cand.detail.includes('SO_miss(') || cand.detail.includes('scatter(');
    const hasSOPair = cand.detail.includes('SO(');
    // Wider delta tolerance for elements with confirmed SO pairs (chemical shift)
    const floorDelta = hasSOPair ? toleranceEV * 4 : toleranceEV;
    if (cand.confidence < minConfidence && !hasPenalty) {
      for (const ml of cand.matchedLines) {
        if (topPositions.has(ml.detectedBE) && Math.abs(ml.deltaEV) <= floorDelta) {
          cand.confidence = Math.max(cand.confidence, minConfidence);
          if (!cand.detail.includes('prom_floor')) {
            cand.detail += '; prom_floor';
          }
          break;
        }
      }
    }
  }

  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}
