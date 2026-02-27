/**
 * peak-detection.ts: Savitzky-Golay smoothing + peak detection.
 * Ported from auto_identify.py _detect_peaks_wide().
 */

import type { DetectedPeak } from '../types';

// Constants (from auto_identify.py, tuned for survey spectra)
const SMOOTH_WINDOW_EV = 2.0;  // narrower to preserve SO doublets (e.g., Ta 4f split=1.9)
const SMOOTH_ORDER = 3;
const MIN_PEAK_DISTANCE_EV = 2.0;
const MAX_PEAKS = 30;
const MIN_PEAK_HEIGHT = 0.03;
const MIN_PEAK_PROMINENCE = 0.02;
const NOISE_PROMINENCE_SIGMA = 3.5;  // lowered: noisy PXT data inflates noise estimate
const NOISE_HEIGHT_SIGMA = 3.0;
const MIN_RELATIVE_PROMINENCE = 0.03;  // slightly relaxed for weaker edge peaks

// ============================================================================
// Savitzky-Golay filter (simplified)
// ============================================================================

/**
 * Simple moving average as SG approximation for quick MVP.
 * For a proper SG filter, we'd need polynomial coefficient computation.
 */
function savgolFilter(data: number[], windowSize: number, _polyOrder: number): number[] {
  const n = data.length;
  const half = Math.floor(windowSize / 2);
  const result = new Array(n);

  // Use weighted moving average (triangular window) as SG approximation
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let wsum = 0;
    for (let j = -half; j <= half; j++) {
      const idx = Math.min(Math.max(i + j, 0), n - 1);
      const w = half + 1 - Math.abs(j); // triangular weight
      sum += data[idx] * w;
      wsum += w;
    }
    result[i] = sum / wsum;
  }
  return result;
}

// ============================================================================
// Peak finding (scipy.signal.find_peaks equivalent)
// ============================================================================

interface PeakResult {
  indices: number[];
  prominences: number[];
}

function computeProminence(data: number[], peakIdx: number): number {
  const n = data.length;
  const peakHeight = data[peakIdx];

  // Walk left to find base
  let leftMin = peakHeight;
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (data[i] > peakHeight) break;
    if (data[i] < leftMin) leftMin = data[i];
  }

  // Walk right to find base
  let rightMin = peakHeight;
  for (let i = peakIdx + 1; i < n; i++) {
    if (data[i] > peakHeight) break;
    if (data[i] < rightMin) rightMin = data[i];
  }

  return peakHeight - Math.max(leftMin, rightMin);
}

function findPeaks(
  data: number[],
  height: number,
  distance: number,
  prominence: number,
): PeakResult {
  const n = data.length;
  const candidates: number[] = [];

  // Find local maxima
  for (let i = 1; i < n - 1; i++) {
    if (data[i] > data[i - 1] && data[i] >= data[i + 1] && data[i] >= height) {
      candidates.push(i);
    }
  }

  // Apply distance filter (keep tallest when too close)
  const filtered: number[] = [];
  for (const idx of candidates) {
    let keep = true;
    for (let j = filtered.length - 1; j >= 0; j--) {
      if (Math.abs(idx - filtered[j]) < distance) {
        // Keep the taller one
        if (data[idx] > data[filtered[j]]) {
          filtered.splice(j, 1);
        } else {
          keep = false;
        }
        break;
      }
    }
    if (keep) filtered.push(idx);
  }

  // Compute prominences and filter
  const indices: number[] = [];
  const prominences: number[] = [];
  for (const idx of filtered) {
    const prom = computeProminence(data, idx);
    if (prom >= prominence) {
      indices.push(idx);
      prominences.push(prom);
    }
  }

  return { indices, prominences };
}

// ============================================================================
// FWHM estimation
// ============================================================================

function estimateFWHM(energy: number[], signal: number[], peakIdx: number): number {
  const halfMax = signal[peakIdx] / 2.0;
  const n = signal.length;

  // Search left
  let leftE = energy[0];
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (signal[i] <= halfMax) {
      const denom = signal[i + 1] - signal[i];
      const frac = denom > 1e-10 ? (halfMax - signal[i]) / denom : 0;
      leftE = energy[i] + frac * (energy[i + 1] - energy[i]);
      break;
    }
  }

  // Search right
  let rightE = energy[n - 1];
  for (let i = peakIdx + 1; i < n; i++) {
    if (signal[i] <= halfMax) {
      const denom = signal[i - 1] - signal[i];
      const frac = denom > 1e-10 ? (halfMax - signal[i]) / denom : 0;
      rightE = energy[i] + frac * (energy[i - 1] - energy[i]);
      break;
    }
  }

  return Math.abs(rightE - leftE);
}

// ============================================================================
// Main: detectPeaks
// ============================================================================

export function detectPeaks(
  energy: number[],
  signal: number[],
): DetectedPeak[] {
  const n = signal.length;
  if (n < 7) return [];

  // Convert physical SG window to samples
  const energyStep = Math.abs(energy[n - 1] - energy[0]) / Math.max(n - 1, 1);
  let sw = Math.max(5, Math.round(SMOOTH_WINDOW_EV / energyStep));
  if (sw % 2 === 0) sw += 1;
  if (sw > Math.floor(n / 3)) {
    sw = Math.max(5, Math.floor(n / 3));
    if (sw % 2 === 0) sw += 1;
  }

  const smoothed = savgolFilter(signal, sw, Math.min(SMOOTH_ORDER, sw - 1));

  const maxIntensity = Math.max(...smoothed);
  if (maxIntensity < 1e-10) return [];

  // Noise estimate
  let noiseSum = 0;
  for (let i = 0; i < n; i++) {
    noiseSum += (signal[i] - smoothed[i]) ** 2;
  }
  let noiseStd = Math.sqrt(noiseSum / n);
  if (noiseStd < 1e-10) noiseStd = 1e-10;

  const snr = maxIntensity / noiseStd;
  if (snr < 5.0) return [];

  // S/N-adaptive thresholding
  const snrFactor = Math.max(0.4, Math.min(1.0, 1.0 - 0.6 * (snr - 10) / 40));

  const prominenceThreshold = Math.max(
    maxIntensity * MIN_PEAK_PROMINENCE,
    NOISE_PROMINENCE_SIGMA * snrFactor * noiseStd,
  );
  const heightThreshold = Math.max(
    maxIntensity * MIN_PEAK_HEIGHT,
    NOISE_HEIGHT_SIGMA * snrFactor * noiseStd,
  );

  const minDistSamples = Math.max(3, Math.round(MIN_PEAK_DISTANCE_EV / energyStep));

  let { indices, prominences } = findPeaks(
    smoothed,
    heightThreshold,
    minDistSamples,
    prominenceThreshold,
  );

  if (indices.length === 0) return [];

  // Secondary filter: remove minor peaks relative to dominant
  const maxProm = Math.max(...prominences);
  const keepMask = prominences.map(p => p >= maxProm * MIN_RELATIVE_PROMINENCE);
  indices = indices.filter((_, i) => keepMask[i]);
  prominences = prominences.filter((_, i) => keepMask[i]);

  // Limit to top N by prominence
  if (indices.length > MAX_PEAKS) {
    const sorted = indices
      .map((idx, i) => ({ idx, prom: prominences[i] }))
      .sort((a, b) => b.prom - a.prom)
      .slice(0, MAX_PEAKS);
    sorted.sort((a, b) => a.idx - b.idx);
    indices = sorted.map(s => s.idx);
    prominences = sorted.map(s => s.prom);
  }

  // Build DetectedPeak objects
  return indices.map((idx, i) => ({
    position: energy[idx],
    height: smoothed[idx],
    prominence: prominences[i],
    fwhmEstimate: estimateFWHM(energy, smoothed, idx),
    index: idx,
  }));
}
