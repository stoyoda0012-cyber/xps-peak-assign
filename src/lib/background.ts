/**
 * background.ts: Shirley iterative background subtraction.
 * Ported from toyomacro.background.Shirley.
 *
 * B(E) = I_right + (I_left - I_right) * cumSum(signal) / totalSum
 * Iterate until convergence.
 */

const MAX_ITER = 50;
const TOL = 1e-5;

export function shirleyBackground(
  energy: number[],
  intensity: number[],
): number[] {
  const n = intensity.length;
  if (n < 3) {
    const mean = intensity.reduce((a, b) => a + b, 0) / n;
    return new Array(n).fill(mean);
  }

  // Work with ascending energy internally
  let iWork = intensity;
  let reversed = false;
  if (energy[0] > energy[energy.length - 1]) {
    iWork = [...intensity].reverse();
    reversed = true;
  }

  // Endpoint values (average over 10% of spectrum)
  const m = Math.max(1, Math.floor(n / 10));
  let iLeft = 0, iRight = 0;
  for (let i = 0; i < m; i++) iLeft += iWork[i];
  iLeft /= m;
  for (let i = n - m; i < n; i++) iRight += iWork[i];
  iRight /= m;

  // Iterative Shirley
  let bg = new Array(n).fill(0);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Compute cumulative sum of (intensity - background) from right to left
    // In ascending BE, "right" = high BE = high index
    const signal = iWork.map((v, i) => Math.max(v - bg[i], 0));

    // Cumulative sum from index n-1 down to 0
    const cumSum = new Array(n).fill(0);
    cumSum[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) {
      cumSum[i] = cumSum[i + 1] + signal[i + 1];
    }
    const total = cumSum[0] + signal[0];

    if (Math.abs(total) < 1e-10) break;

    const bgNew = new Array(n);
    for (let i = 0; i < n; i++) {
      bgNew[i] = iRight + (iLeft - iRight) * cumSum[i] / total;
    }

    // Check convergence
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(bgNew[i] - bg[i]);
      if (diff > maxChange) maxChange = diff;
    }

    bg = bgNew;
    if (maxChange < TOL) break;
  }

  if (reversed) bg.reverse();
  return bg;
}

export function subtractBackground(
  energy: number[],
  intensity: number[],
): [number[], number[]] {
  const bg = shirleyBackground(energy, intensity);
  const signal = intensity.map((v, i) => Math.max(v - bg[i], 0));
  return [signal, bg];
}
