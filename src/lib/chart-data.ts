/**
 * Builds the aligned data arrays that SpectrumChart hands to uPlot.
 *
 * uPlot requires the x array to be sorted ascending; it binary-searches it for
 * the cursor index and for the drag-zoom range. Instrument exports are very
 * often in descending BE (ascending KE), and feeding such an array straight
 * to uPlot makes the cursor read-out stick to the end values and makes most
 * drag-zooms render an empty chart (reported by a user, reproduced with the
 * bundled Au/Si sample, whose CSV is in descending BE). So every display
 * mode goes through the same sort here, not only KE.
 */

export interface DisplaySeries {
  /** Display-axis values (BE, or KE = hv - BE), strictly ascending */
  x: number[];
  raw: number[];
  background: number[] | null;
  signal: number[] | null;
}

export function buildDisplaySeries(
  energyBE: readonly number[],
  intensity: readonly number[],
  result: { background: readonly number[]; signal: readonly number[] } | null,
  isKE: boolean,
  hv: number,
): DisplaySeries {
  const x = isKE ? energyBE.map(be => hv - be) : Array.from(energyBE);
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  return {
    x: idx.map(i => x[i]),
    raw: idx.map(i => intensity[i]),
    background: result ? idx.map(i => result.background[i]) : null,
    signal: result ? idx.map(i => result.signal[i]) : null,
  };
}
