/**
 * element-db.ts: XPS Element Database for auto-identification.
 * Ported from element_db.py — loads JSON data, builds XPSElement objects,
 * handles SO pair detection, Auger table, and candidate matching.
 */

import type {
  CoreLevel, AugerLine, SpinOrbitPair, XPSElement,
  CrossSectionEntry,
} from '../types';
import { AL_KA, XRAY_SOURCES, getSourceEnergy } from './energy';
import bindingEnergiesData from '../data/binding-energies.json';
import crossSectionsAlData from '../data/cross-sections-al.json';
import crossSectionsGaData from '../data/cross-sections-ga.json';

// ============================================================================
// Constants
// ============================================================================

const SO_BRANCHING: Record<string, [number, number]> = {
  p: [1.0, 2.0],  // (j_low, j_high)
  d: [2.0, 3.0],
  f: [3.0, 4.0],
};

const EXCLUDED_ELEMENTS = new Set([
  // Noble gases
  'He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn',
  // Lanthanides (La-Lu, Z=57-71): many shallow core levels cause false positives
  // by accidental BE overlap. Can be re-enabled for rare-earth studies.
  'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd',
  'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  // Radioactive/synthetic (Z>83 except U, Th)
  'Po', 'At', 'Fr', 'Ra', 'Ac', 'Pa', 'Np', 'Pu', 'Am', 'Cm',
  'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn',
  'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);

// Auger line table (KE in eV) — from Wagner et al. (1979)
const AUGER_TABLE: Record<string, AugerLine[]> = {
  C:  [{ name: 'KLL', kineticEnergy: 263.0 }],
  N:  [{ name: 'KLL', kineticEnergy: 379.0 }],
  O:  [{ name: 'KLL', kineticEnergy: 510.0 }],
  F:  [{ name: 'KLL', kineticEnergy: 656.0 }],
  Na: [{ name: 'KLL', kineticEnergy: 990.0 }],
  Mg: [{ name: 'KLL', kineticEnergy: 1186.0 }],
  Al: [{ name: 'KLL', kineticEnergy: 1393.0 }],
  Si: [{ name: 'KLL', kineticEnergy: 1619.0 }],
  S:  [{ name: 'KLL', kineticEnergy: 2117.0 }],
  Cl: [{ name: 'KLL', kineticEnergy: 2381.0 }],
  K:  [{ name: 'KLL', kineticEnergy: 2956.0 }],
  Ca: [{ name: 'KLL', kineticEnergy: 3310.0 }],
  Ti: [{ name: 'LMM', kineticEnergy: 418.0 }],
  V:  [{ name: 'LMM', kineticEnergy: 437.0 }],
  Cr: [{ name: 'LMM', kineticEnergy: 529.0 }],
  Mn: [{ name: 'LMM', kineticEnergy: 589.0 }],
  Fe: [{ name: 'LMM', kineticEnergy: 703.0 }],
  Co: [{ name: 'LMM', kineticEnergy: 775.0 }],
  Ni: [{ name: 'LMM', kineticEnergy: 848.0 }],
  Cu: [{ name: 'LMM', kineticEnergy: 920.0 }],
  Zn: [{ name: 'LMM', kineticEnergy: 992.0 }],
  Ga: [{ name: 'LMM', kineticEnergy: 1070.0 }],
  Ge: [{ name: 'LMM', kineticEnergy: 1145.0 }],
  As: [{ name: 'LMM', kineticEnergy: 1228.0 }],
  Mo: [{ name: 'MNN', kineticEnergy: 186.0 }],
  Ag: [{ name: 'MNN', kineticEnergy: 357.0 }],
  In: [{ name: 'MNN', kineticEnergy: 404.0 }],
  Sn: [{ name: 'MNN', kineticEnergy: 430.0 }],
  Pd: [{ name: 'MNN', kineticEnergy: 330.0 }],
  W:  [{ name: 'MNN', kineticEnergy: 169.0 }],
  Pt: [{ name: 'MNN', kineticEnergy: 237.0 }],
  Au: [{ name: 'MNN', kineticEnergy: 239.0 }],
  Pb: [{ name: 'NVV', kineticEnergy: 94.0 }],
};

// ============================================================================
// Orbital helpers
// ============================================================================

function parseOrbitalType(name: string): string {
  for (const ch of name) {
    if ('spdf'.includes(ch)) return ch;
  }
  throw new Error(`Cannot determine orbital type from '${name}'`);
}

function orbitalNL(name: string): [number, string] {
  return [parseInt(name[0], 10), name[1]];
}

function isJHigh(name: string): boolean | null {
  if (!name.includes('/')) return null;
  const jPart = name.split('/')[0]; // "2p3" from "2p3/2"
  const jNum = parseInt(jPart[jPart.length - 1], 10);
  const [, l] = orbitalNL(name);
  const lNum: Record<string, number> = { s: 0, p: 1, d: 2, f: 3 };
  return jNum === 2 * lNum[l] + 1;
}

// ============================================================================
// Cross-section matching
// ============================================================================

// Build CS lookups from JSON: {symbol: {unresolved_orbital: cs_Mb}}
function buildCSLookup(data: CrossSectionEntry[]): Record<string, Record<string, number>> {
  const lookup: Record<string, Record<string, number>> = {};
  for (const entry of data) {
    if (!lookup[entry.symbol]) lookup[entry.symbol] = {};
    lookup[entry.symbol][entry.orbital] = entry.crossSection;
  }
  return lookup;
}

const csLookupAl = buildCSLookup(crossSectionsAlData as CrossSectionEntry[]);
const csLookupGa = buildCSLookup(crossSectionsGaData as CrossSectionEntry[]);

function getCSLookup(source: string): Record<string, Record<string, number>> {
  if (source === 'Ga') return csLookupGa;
  return csLookupAl;
}

function matchOrbitalToCS(orbitalName: string, elementCS: Record<string, number> | undefined): number {
  if (!elementCS) return 0;
  const otype = parseOrbitalType(orbitalName);

  // Direct match (for 's' orbitals or if table has resolved name)
  if (orbitalName in elementCS) return elementCS[orbitalName];

  // Build unresolved name: '2p3/2' -> '2p'
  const [n, l] = orbitalNL(orbitalName);
  const unresolved = `${n}${l}`;
  if (!(unresolved in elementCS)) return 0;

  const totalCS = elementCS[unresolved];

  // Split by branching ratio
  if (otype in SO_BRANCHING) {
    const [ratioLow, ratioHigh] = SO_BRANCHING[otype];
    const total = ratioLow + ratioHigh;
    const high = isJHigh(orbitalName);
    if (high === true) return totalCS * ratioHigh / total;
    if (high === false) return totalCS * ratioLow / total;
  }

  return totalCS;
}

// ============================================================================
// SO pair detection
// ============================================================================

function detectSpinOrbitPairs(orbitals: Record<string, number>): SpinOrbitPair[] {
  const pairs: SpinOrbitPair[] = [];
  const nlGroups: Record<string, Record<string, [string, number]>> = {};

  for (const [name, be] of Object.entries(orbitals)) {
    if (!name.includes('/')) continue;
    const [n, l] = orbitalNL(name);
    const key = `${n}${l}`;
    const jFrac = name.slice(2); // after 'nl'
    if (!nlGroups[key]) nlGroups[key] = {};
    nlGroups[key][jFrac] = [name, be];
  }

  for (const [key, components] of Object.entries(nlGroups).sort()) {
    const l = key[1];
    if (!(l in SO_BRANCHING) || Object.keys(components).length < 2) continue;

    const [ratioLow, ratioHigh] = SO_BRANCHING[l];
    const lNum: Record<string, number> = { p: 1, d: 2, f: 3 };
    const jLowFrac = `${2 * lNum[l] - 1}/2`;
    const jHighFrac = `${2 * lNum[l] + 1}/2`;

    if (jLowFrac in components && jHighFrac in components) {
      const [nameLow, beLow] = components[jLowFrac];
      const [nameHigh, beHigh] = components[jHighFrac];
      const splitting = Math.abs(beLow - beHigh);
      if (splitting > 0) {
        pairs.push({
          levelHigh: nameHigh,
          levelLow: nameLow,
          splitting,
          ratioHigh,
          ratioLow,
        });
      }
    }
  }

  return pairs;
}

// ============================================================================
// Database builder
// ============================================================================

// Cache per source energy (key = source name)
const _dbCache = new Map<string, Map<string, XPSElement>>();
let _currentSource = 'Al';

function buildDB(source: string = 'Al'): Map<string, XPSElement> {
  if (_dbCache.has(source)) return _dbCache.get(source)!;

  const maxBE = XRAY_SOURCES[source] ?? AL_KA;
  const db = new Map<string, XPSElement>();

  for (const entry of (bindingEnergiesData as unknown as Array<{Z: number; symbol: string; orbitals: Record<string, number>}>)) {
    const { Z, symbol, orbitals } = entry;
    if (EXCLUDED_ELEMENTS.has(symbol)) continue;

    const csLookup = getCSLookup(source);
    const elemCS = csLookup[symbol];
    const coreLevels: CoreLevel[] = [];

    // Sort orbitals by BE descending
    const sortedOrbitals = Object.entries(orbitals).sort((a, b) => b[1] - a[1]);

    for (const [name, be] of sortedOrbitals) {
      if (be > maxBE) continue; // not accessible with this source

      let otype: string;
      try { otype = parseOrbitalType(name); }
      catch { continue; }

      const cs = matchOrbitalToCS(name, elemCS);
      coreLevels.push({ name, bindingEnergy: be, crossSection: cs, orbitalType: otype });
    }

    if (coreLevels.length === 0) continue;

    // Detect SO pairs
    const accessibleOrbitals: Record<string, number> = {};
    for (const cl of coreLevels) accessibleOrbitals[cl.name] = cl.bindingEnergy;
    const soPairs = detectSpinOrbitPairs(accessibleOrbitals);

    const auger = AUGER_TABLE[symbol] || [];

    db.set(symbol, {
      symbol,
      atomicNumber: Z,
      coreLevels,
      augerLines: auger,
      spinOrbitPairs: soPairs,
    });
  }

  _dbCache.set(source, db);
  return db;
}

export function setSource(source: string): void {
  _currentSource = source;
}

/** Clear cached DB for a source (needed when Synchrotron energy changes). */
export function clearDBCache(source?: string): void {
  if (source) {
    _dbCache.delete(source);
  } else {
    _dbCache.clear();
  }
}

// ============================================================================
// Public API
// ============================================================================

export function getDB(source?: string): Map<string, XPSElement> {
  return buildDB(source ?? _currentSource);
}

export function getElement(symbol: string, source?: string): XPSElement | undefined {
  return getDB(source).get(symbol);
}

export function getAllElements(source?: string): string[] {
  return Array.from(getDB(source).keys());
}

export function getCrossSection(symbol: string, orbitalName: string, source?: string): number {
  const elem = getElement(symbol, source);
  if (!elem) return 0;
  const cl = elem.coreLevels.find(c => c.name === orbitalName);
  return cl ? cl.crossSection : 0;
}

/**
 * Match peak positions to element database. Returns per-position match list.
 */
export function identifyCandidates(
  positions: number[],
  toleranceEV: number,
  source: string = 'Al',
  includeAuger: boolean = true,
): Array<Array<[string, string, number, number]>> {
  const db = getDB(source);
  const [, hv] = getSourceEnergy(source);

  // Build flat list of all peaks (symbol, lineName, BE)
  const allPeaks: Array<[string, string, number]> = [];

  for (const [, elem] of db) {
    // Photoelectric lines
    for (const cl of elem.coreLevels) {
      allPeaks.push([elem.symbol, cl.name, cl.bindingEnergy]);
    }

    // Auger lines (convert KE to apparent BE)
    if (includeAuger) {
      for (const aug of elem.augerLines) {
        const apparentBE = hv - aug.kineticEnergy;
        if (apparentBE > 0 && apparentBE < hv) {
          allPeaks.push([elem.symbol, `${aug.name}(Auger)`, apparentBE]);
        }
      }
    }
  }

  // For each observed position, find matches
  return positions.map(pos => {
    const matches: Array<[string, string, number, number]> = [];
    for (const [sym, name, be] of allPeaks) {
      const delta = pos - be;
      if (Math.abs(delta) <= toleranceEV) {
        matches.push([sym, name, be, delta]);
      }
    }
    matches.sort((a, b) => Math.abs(a[3]) - Math.abs(b[3]));
    return matches;
  });
}

export { EXCLUDED_ELEMENTS };
