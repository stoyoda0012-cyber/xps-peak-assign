/**
 * Synthetic HAXPES fixture: HfO2/Si-like survey at hv = 7940 eV.
 *
 * Line positions are taken verbatim from src/data/binding-energies.json so
 * that a correct pipeline should, in principle, recover Si, Hf, O and C with
 * zero charging error. Amplitudes are hand-picked to be plausible for a thin
 * HfO2 layer on Si with adventitious carbon; they are NOT derived from cross
 * sections.
 */

import bindingEnergies from '../../data/binding-energies.json';
import { generateSpectrum, type SyntheticLine, type SyntheticSpectrum } from '../helpers/synthetic';

export const HFO2_SI_HV = 7940;

type BEEntry = { symbol: string; orbitals: Record<string, number> };

function be(symbol: string, orbital: string): number {
  const entry = (bindingEnergies as unknown as BEEntry[]).find(e => e.symbol === symbol);
  const value = entry?.orbitals[orbital];
  if (value === undefined) throw new Error(`No BE for ${symbol} ${orbital}`);
  return value;
}

const line = (symbol: string, orbital: string, amplitude: number): SyntheticLine => ({
  label: `${symbol} ${orbital}`,
  be: be(symbol, orbital),
  amplitude,
});

/** Lines in the fixture: Si 1s/2s/2p, Hf 3d5/2, 3d3/2, 4f, O 1s, C 1s. */
export const HFO2_SI_LINES: SyntheticLine[] = [
  line('Si', '1s', 1500),
  line('Si', '2s', 250),
  line('Si', '2p3/2', 300),
  line('Si', '2p1/2', 150),
  line('Hf', '3d5/2', 2400),
  line('Hf', '3d3/2', 1600),
  line('Hf', '4f7/2', 400),
  line('Hf', '4f5/2', 300),
  line('O', '1s', 1200),
  line('C', '1s', 400),
];

export function makeHfO2SiSpectrum(seed = 20261018): SyntheticSpectrum {
  return generateSpectrum({
    lines: HFO2_SI_LINES,
    beMin: 0,
    beMax: 2100,
    step: 0.5,
    fwhm: 1.6,
    eta: 0.3,
    baseline: 200,
    baselineSlope: 0.05,
    stepFactor: 0.02,
    seed,
  });
}
