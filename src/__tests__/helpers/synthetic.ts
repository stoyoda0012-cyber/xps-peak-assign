/**
 * Deterministic synthetic XPS survey-spectrum generator (test helper).
 *
 * Builds a spectrum on an ascending binding-energy grid as
 *
 *   I(E) = baseline(E) + sum_k peak_k(E) + step * sum_k cumArea_k(E)
 *
 * where peak_k is a pseudo-Voigt line (Gaussian/Lorentzian mix with a common
 * FWHM), cumArea_k(E) is the area of peak_k at binding energies below E
 * (a Shirley-like inelastic step that rises towards higher BE), and the
 * baseline is a gentle linear slope. Counts are then drawn with Poisson-like
 * noise from a seeded PRNG, so the same options always give the same array.
 *
 * No network, no file system, no Math.random: safe for golden tests.
 */

export interface SyntheticLine {
  /** Free-form label for debugging, e.g. "Hf 3d5/2". */
  label: string;
  /** Peak centre in binding energy (eV). */
  be: number;
  /** Peak height above the step background (counts). */
  amplitude: number;
  /** Optional per-line FWHM (eV); defaults to SyntheticOptions.fwhm. */
  fwhm?: number;
}

export interface SyntheticOptions {
  lines: SyntheticLine[];
  /** Grid limits in binding energy (eV), inclusive. */
  beMin: number;
  beMax: number;
  /** Grid step (eV). */
  step: number;
  /** Default FWHM (eV) for lines without their own. */
  fwhm: number;
  /** Lorentzian fraction of the pseudo-Voigt (0 = pure Gaussian). */
  eta: number;
  /** Flat baseline (counts) at beMin. */
  baseline: number;
  /** Baseline slope (counts per eV of BE). */
  baselineSlope: number;
  /** Shirley-like step height per unit peak area (counts / (counts*eV)). */
  stepFactor: number;
  /** PRNG seed. */
  seed: number;
}

export interface SyntheticSpectrum {
  /** Binding energy (eV), DESCENDING (high BE first), like most survey exports. */
  energy: number[];
  /** Noisy counts, aligned with `energy`. */
  intensity: number[];
}

/** mulberry32: tiny, fast, well-distributed 32-bit PRNG. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal deviate via Box-Muller (uses two uniforms per call). */
function normal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Poisson-like deviate: exact (Knuth) for small means, Gaussian
 * approximation N(lambda, sqrt(lambda)) for lambda >= 30, clamped at 0.
 */
export function poissonLike(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rand();
    } while (p > limit);
    return k - 1;
  }
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
}

function pseudoVoigt(x: number, x0: number, fwhm: number, eta: number): number {
  const d = x - x0;
  const hw = fwhm / 2;
  const gauss = Math.exp(-Math.LN2 * (d / hw) ** 2);
  const lorentz = 1 / (1 + (d / hw) ** 2);
  return eta * lorentz + (1 - eta) * gauss;
}

export function generateSpectrum(opts: SyntheticOptions): SyntheticSpectrum {
  const n = Math.round((opts.beMax - opts.beMin) / opts.step) + 1;
  const be: number[] = new Array(n);
  for (let i = 0; i < n; i++) be[i] = opts.beMin + i * opts.step;

  // Noise-free peak sum on the ascending grid.
  const peaks = new Array<number>(n).fill(0);
  for (const line of opts.lines) {
    const w = line.fwhm ?? opts.fwhm;
    for (let i = 0; i < n; i++) {
      peaks[i] += line.amplitude * pseudoVoigt(be[i], line.be, w, opts.eta);
    }
  }

  // Shirley-like step: proportional to the peak area at lower BE.
  const clean = new Array<number>(n);
  let cumArea = 0;
  for (let i = 0; i < n; i++) {
    cumArea += peaks[i] * opts.step;
    const base = opts.baseline + opts.baselineSlope * (be[i] - opts.beMin);
    clean[i] = base + peaks[i] + opts.stepFactor * cumArea;
  }

  const rand = mulberry32(opts.seed);
  const noisy = clean.map(v => poissonLike(v, rand));

  // Emit high-BE first.
  return { energy: be.reverse(), intensity: noisy.reverse() };
}
