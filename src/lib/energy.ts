/**
 * energy.ts: X-ray source registry and energy conversion utilities.
 * Ported from element_db.py (energy conversion section).
 */

export const XRAY_SOURCES: Record<string, number> = {
  Al: 1486.6,   // Al Ka
  Mg: 1253.6,   // Mg Ka
  Zr: 2042.4,   // Zr La
  Ag: 2984.3,   // Ag La
  Ti: 4510.8,   // Ti Ka
  Cr: 5414.7,   // Cr Ka
  Ga: 9251.7,   // Ga Ka
};

export const AL_KA = 1486.6;

/**
 * Set custom photon energy for Synchrotron source.
 * Dynamically updates XRAY_SOURCES so all downstream code picks it up.
 */
export function setSynchrotronEnergy(eV: number): void {
  XRAY_SOURCES['Synchrotron'] = eV;
}

export function getSourceEnergy(source: string): [string, number] {
  for (const [key, energy] of Object.entries(XRAY_SOURCES)) {
    if (key.toLowerCase() === source.toLowerCase()) {
      return [key, energy];
    }
  }
  throw new Error(`Unknown X-ray source '${source}'. Known: ${Object.keys(XRAY_SOURCES).join(', ')}`);
}

export function beToKe(bindingEnergy: number, source: string = 'Al'): number {
  const [, hv] = getSourceEnergy(source);
  return hv - bindingEnergy;
}

export function keToBe(kineticEnergy: number, source: string = 'Al'): number {
  const [, hv] = getSourceEnergy(source);
  return hv - kineticEnergy;
}

/** Map photon energy (eV) to source name. Returns undefined if no match (±5 eV). */
export function resolveSource(hv: number): string | undefined {
  for (const [name, energy] of Object.entries(XRAY_SOURCES)) {
    if (Math.abs(energy - hv) < 5) return name;
  }
  return undefined;
}
