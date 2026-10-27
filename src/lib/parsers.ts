/**
 * parsers.ts: Multi-format XPS data file parser.
 *
 * Supported formats:
 *   - CSV/TSV: 2-column (energy, intensity)
 *   - NPL: Ulvac PHI line-oriented text (VAMAS variant)
 *   - VAMAS (.vms): ISO 14976 line-oriented text (TEL DA20, BL23SU, Omicron, ...)
 *   - SES TXT: Scienta SES INI-like text export
 *
 * Ported from Python toyomacro-python readers:
 *   npl_reader.py, vamas_reader.py, ses_reader.py
 */

import type { SpectrumData } from '../types';
import { resolveSource } from './energy';

// ============================================================================
// Types
// ============================================================================

export interface ParsedRegion {
  name: string;
  energy: number[];
  intensity: number[];       // 1D (summed over angles if multi-angle)
  energyType: 'BE' | 'KE';
  excitationEnergy?: number; // hv from file metadata (eV)
}

export interface ParsedFile {
  format: 'csv' | 'npl' | 'vamas' | 'ses' | 'pxt' | 'ibw';
  regions: ParsedRegion[];
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Read n non-empty lines starting at cursor, return [lines, newCursor]. */
function readNonEmptyLines(
  allLines: string[], cursor: number, n: number,
): [string[], number] {
  const result: string[] = [];
  let i = cursor;
  while (result.length < n && i < allLines.length) {
    // Strip NUL padding (seen in some instrument exports). replaceAll with a
    // string literal is equivalent to /\x00/g and avoids no-control-regex.
    const stripped = allLines[i].trim().replaceAll('\u0000', '');
    i++;
    if (stripped) result.push(stripped);
  }
  return [result, i];
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================================
// CSV / TSV parser
// ============================================================================

export function parseCSV(text: string, filename: string = 'uploaded'): ParsedFile {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const energy: number[] = [];
  const intensity: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Detect delimiter: tab, comma, or space(s)
    const parts = trimmed.split(/[\t,]+|\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const e = parseFloat(parts[0]);
    const iVal = parseFloat(parts[1]);

    if (isNaN(e) || isNaN(iVal)) continue;

    energy.push(e);
    intensity.push(iVal);
  }

  if (energy.length === 0) {
    throw new Error('No valid data found in file. Expected 2-column format (energy, intensity).');
  }

  return {
    format: 'csv',
    regions: [{
      name: filename,
      energy,
      intensity,
      energyType: 'BE',  // default; auto-detected later in App
    }],
  };
}

// ============================================================================
// NPL parser (Ulvac PHI)
// ============================================================================

const PHI_WORK_FUNCTION = 4.5; // eV

export function parseNPL(text: string, _filename: string = 'uploaded'): ParsedFile {
  const allLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let cursor = 0;

  // File header: 14 non-empty lines
  const [fileHeader, headerEnd] = readNonEmptyLines(allLines, cursor, 14);
  cursor = headerEnd;
  const nRegions = parseInt(fileHeader[7], 10);
  if (isNaN(nRegions) || nRegions < 1) {
    throw new Error('Invalid NPL file: cannot read number of regions');
  }

  const regions: ParsedRegion[] = [];

  for (let r = 0; r < nRegions; r++) {
    // Region header: 31 non-empty lines
    let regionHeader: string[];
    [regionHeader, cursor] = readNonEmptyLines(allLines, cursor, 31);

    let excitationEnergy = 0;
    try { excitationEnergy = parseFloat(regionHeader[14]); } catch { /* ignore */ }

    const regionNameFlag = regionHeader.length > 30 ? regionHeader[30] : '-1';

    let energyLabel: string;
    let eIni: number, eStep: number, nEnergy: number;
    let regionName: string;

    if (regionNameFlag === '-1') {
      // Unnamed region: 18 extended lines
      let ext: string[];
      [ext, cursor] = readNonEmptyLines(allLines, cursor, 18);
      energyLabel = ext[0].toLowerCase();
      eIni = parseFloat(ext[2]);
      eStep = parseFloat(ext[3]);
      nEnergy = parseInt(ext[15], 10);

      // Auto-detect region name
      const eFin = eIni + eStep * (nEnergy - 1);
      if (eFin < 1.0 && Math.abs(eStep * (nEnergy - 1)) < 100) {
        regionName = 'VB';
      } else {
        regionName = 'Wide';
      }
    } else {
      // Named region: 19 extended lines
      let ext: string[];
      [ext, cursor] = readNonEmptyLines(allLines, cursor, 19);
      energyLabel = ext[1].toLowerCase();
      eIni = parseFloat(ext[3]);
      eStep = parseFloat(ext[4]);
      nEnergy = parseInt(ext[16], 10);
      regionName = regionHeader[29] + regionNameFlag;
    }

    // Energy axis
    const rawEnergy = Array.from({ length: nEnergy }, (_, i) => eIni + i * eStep);

    let energy: number[];
    let energyType: 'BE' | 'KE';
    if (energyLabel.includes('binding')) {
      energy = rawEnergy;
      energyType = 'BE';
    } else {
      // KE → BE: BE = hv - KE - work_function
      energy = rawEnergy.map(ke => excitationEnergy - ke - PHI_WORK_FUNCTION);
      energyType = 'BE'; // already converted
    }

    // Data: nEnergy intensity values
    let dataLines: string[];
    [dataLines, cursor] = readNonEmptyLines(allLines, cursor, nEnergy);
    const intensity = dataLines.map(l => parseFloat(l));

    regions.push({
      name: regionName,
      energy,
      intensity,
      energyType,
      excitationEnergy: excitationEnergy > 0 ? excitationEnergy : undefined,
    });
  }

  if (regions.length === 0) {
    throw new Error('No valid regions found in NPL file');
  }

  return { format: 'npl', regions };
}

// ============================================================================
// VAMAS parser (ISO 14976)
// ============================================================================

/**
 * Sequential reader for the VAMAS format. Every line is significant in ISO
 * 14976, including empty ones (an empty comment line, an empty transition
 * label): the previous parser skipped empty lines and then read fixed
 * offsets, which shifted every field by one on files from TEL's DA20 and
 * silently produced an empty spectrum.
 */
class VamasLines {
  private i = 0;
  private readonly lines: string[];
  constructor(lines: string[]) { this.lines = lines; }

  next(what: string): string {
    if (this.i >= this.lines.length) {
      throw new Error(`Invalid VAMAS file: ended while reading ${what}`);
    }
    // Strip NUL padding seen in some instrument exports.
    return this.lines[this.i++].replaceAll('\u0000', '').trim();
  }

  int(what: string): number {
    const v = parseInt(this.next(what), 10);
    if (isNaN(v) || v < 0) throw new Error(`Invalid VAMAS file: ${what} is not a count`);
    return v;
  }

  num(what: string): number {
    const v = parseFloat(this.next(what));
    if (isNaN(v)) throw new Error(`Invalid VAMAS file: ${what} is not a number`);
    return v;
  }

  skip(n: number, what: string): void {
    for (let k = 0; k < n; k++) this.next(what);
  }
}

const VAMAS_SPUTTER_MODES = new Set(['MAPDP', 'MAPSVDP', 'SDP', 'SDPSV']);
const VAMAS_SPUTTER_TECHNIQUES = new Set([
  'FABMS', 'FABMS ENERGY SPEC', 'ISS', 'SIMS', 'SIMS ENERGY SPEC', 'SNMS', 'SNMS ENERGY SPEC',
]);
const VAMAS_SPECTROSCOPIES = new Set(['AES DIFF', 'AES DIR', 'EDX', 'ELS', 'UPS', 'XPS', 'XRF']);

/**
 * ISO 14976 (VAMAS) reader following the block layout of the standard, so
 * variable-length sections (comments, experimental variables, additional
 * parameters) are honoured instead of assuming one instrument's layout.
 * Checked against exports from a TEL DA20 and from a BL23SU end station.
 * Not supported: a non-empty parameter inclusion/exclusion list (blocks
 * after the first would then omit fields).
 */
export function parseVAMAS(text: string, _filename: string = 'uploaded'): ParsedFile {
  const r = new VamasLines(text.replace(/\r\n?/g, '\n').split('\n'));

  if (!r.next('format identifier').startsWith('VAMAS')) {
    throw new Error('Invalid VAMAS file: missing format identifier');
  }
  r.skip(4, 'experiment header'); // institution, instrument, operator, experiment identifier
  r.skip(r.int('number of comment lines'), 'comment lines');
  const expMode = r.next('experiment mode').toUpperCase();
  const scanMode = r.next('scan mode').toUpperCase();
  if (['MAP', 'MAPDP', 'NORM', 'SDP'].includes(expMode)) r.int('number of spectral regions');
  if (['MAP', 'MAPDP'].includes(expMode)) r.skip(3, 'analysis positions');
  const nExpVar = r.int('number of experimental variables');
  r.skip(2 * nExpVar, 'experimental variable labels');
  if (r.int('number of entries in the inclusion/exclusion list') !== 0) {
    throw new Error('VAMAS files with a parameter inclusion/exclusion list are not supported');
  }
  r.skip(r.int('number of manually entered items'), 'manually entered items');
  const nFutureExp = r.int('number of future upgrade experiment entries');
  const nFutureBlock = r.int('number of future upgrade block entries');
  r.skip(nFutureExp, 'future upgrade experiment entries');
  const nBlocks = r.int('number of blocks');
  if (nBlocks < 1) throw new Error('No valid regions found in VAMAS file');

  const regions: ParsedRegion[] = [];

  for (let b = 0; b < nBlocks; b++) {
    const blockId = r.next('block identifier');
    r.next('sample identifier');
    r.skip(7, 'date and time');
    const comments: string[] = [];
    const nComments = r.int('number of block comment lines');
    for (let k = 0; k < nComments; k++) comments.push(r.next('block comment'));
    const technique = r.next('technique').toUpperCase();
    if (['MAP', 'MAPDP'].includes(expMode)) r.skip(2, 'x/y coordinate');
    r.skip(nExpVar, 'experimental variable values');
    r.next('analysis source label');
    if (VAMAS_SPUTTER_MODES.has(expMode) || VAMAS_SPUTTER_TECHNIQUES.has(technique)) {
      r.skip(3, 'sputtering ion');
    }
    const hv = r.num('analysis source characteristic energy');
    r.next('analysis source strength');
    r.skip(2, 'beam width');
    if (['MAP', 'MAPDP', 'MAPSV', 'MAPSVDP', 'SEM'].includes(expMode)) r.skip(2, 'field of view');
    if (['MAPSV', 'MAPSVDP', 'SEM'].includes(expMode)) r.skip(6, 'linescan');
    r.skip(2, 'source angles');
    r.next('analyser mode');
    r.next('pass energy');
    if (technique === 'AES DIFF') r.next('differential width');
    r.next('magnification');
    r.next('work function');
    r.next('target bias');
    r.skip(2, 'analysis width');
    r.skip(2, 'take-off angles');
    const species = r.next('species label');
    const transition = r.next('transition label');
    r.next('charge of detected particle');

    let abscissaLabel = '';
    let start = 0;
    let step = 0;
    if (scanMode === 'REGULAR') {
      abscissaLabel = r.next('abscissa label');
      r.next('abscissa units');
      start = r.num('abscissa start');
      step = r.num('abscissa increment');
    }
    const nCorr = r.int('number of corresponding variables');
    const corrLabels: string[] = [];
    for (let k = 0; k < nCorr; k++) {
      corrLabels.push(r.next('corresponding variable label'));
      r.next('corresponding variable units');
    }
    r.next('signal mode');
    r.next('signal collection time');
    r.next('number of scans');
    r.next('signal time correction');
    if (VAMAS_SPECTROSCOPIES.has(technique) && VAMAS_SPUTTER_MODES.has(expMode)) {
      r.skip(7, 'sputtering source');
    }
    r.skip(2, 'sample tilt');
    r.next('sample rotation');
    r.skip(3 * r.int('number of additional numerical parameters'), 'additional parameters');
    r.skip(nFutureBlock, 'future upgrade block entries');
    const nOrd = r.int('number of ordinate values');
    r.skip(2 * nCorr, 'ordinate minimum/maximum');
    if (nCorr < 1 || nOrd % nCorr !== 0) {
      throw new Error(`Invalid VAMAS file: ${nOrd} ordinate values for ${nCorr} variables`);
    }
    const values: number[] = new Array(nOrd);
    for (let k = 0; k < nOrd; k++) values[k] = r.num('ordinate value');

    // REGULAR: abscissa from start/step, first corresponding variable is the
    // signal. IRREGULAR: the abscissa is stored as the first corresponding
    // variable, the signal as the second. Values are interleaved.
    const column = (c: number) => values.filter((_, k) => k % nCorr === c);
    let energy: number[];
    let intensity: number[];
    let axisLabel: string;
    if (scanMode === 'REGULAR') {
      energy = Array.from({ length: nOrd / nCorr }, (_, k) => start + k * step);
      intensity = column(0);
      axisLabel = abscissaLabel;
    } else {
      if (nCorr < 2) throw new Error('Invalid VAMAS file: irregular scan without a signal column');
      energy = column(0);
      intensity = column(1);
      axisLabel = corrLabels[0];
    }

    const name = blockId || comments[0] || [species, transition].filter(Boolean).join(' ') || `Block ${b + 1}`;
    regions.push({
      name,
      energy,
      intensity,
      energyType: axisLabel.toLowerCase().includes('binding') ? 'BE' : 'KE',
      // 1E37 is the standard's "not specified"
      excitationEnergy: hv > 0 && hv < 1e30 ? hv : undefined,
    });
  }

  return { format: 'vamas', regions };
}

// ============================================================================
// SES TXT parser (Scienta)
// ============================================================================

/** Check if text has SES INI-like markers. */
function isSESFormat(text: string): boolean {
  // Check first ~200 lines for [Data or [Info]
  const lines = text.split('\n', 200);
  return lines.some(l => l.trim().startsWith('[Data') || l.trim() === '[Info]');
}

/** Parse INI-like sections from SES text. */
function parseSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = text.split(/^\[([^\]]+)\]\s*$/m);
  // parts[0] = preamble, then pairs: [1]=name, [2]=body, [3]=name, [4]=body, ...
  for (let i = 1; i < parts.length - 1; i += 2) {
    sections.set(parts[i].trim(), parts[i + 1] || '');
  }
  return sections;
}

/** Parse key=value pairs from a section body. */
function parseKV(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of body.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx >= 0) {
      fields.set(line.slice(0, eqIdx).trim(), line.slice(eqIdx + 1).trim());
    }
  }
  return fields;
}

/** Parse space/comma-separated dimension scale values. */
function parseDimensionScale(s: string): number[] {
  if (!s.trim()) return [];
  const parts = s.includes(',')
    ? s.split(',').map(p => p.trim()).filter(Boolean)
    : s.split(/\s+/).filter(Boolean);
  return parts.map(p => parseFloat(p)).filter(v => !isNaN(v));
}

/** Parse a data block into a 2D array of numbers (rows x cols). */
function parseDataBlock(text: string): number[][] {
  const rows: number[][] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[')) continue;
    // Must start with digit, sign, or whitespace+digit
    if (!/^[\s\d+\-.]/.test(trimmed)) continue;
    const vals = trimmed.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length > 0) rows.push(vals);
  }
  return rows;
}

export function parseSES(text: string, filename: string = 'uploaded'): ParsedFile {
  if (!isSESFormat(text)) {
    // Fallback: treat as simple 2-column text (same as CSV)
    return parseCSV(text, filename);
  }

  const sections = parseSections(text);
  const globalInfo = parseKV(sections.get('Info') || '');
  const nRegions = parseInt(globalInfo.get('Number of Regions') || '1', 10);

  const regions: ParsedRegion[] = [];

  for (let regIdx = 1; regIdx <= nRegions; regIdx++) {
    const regionFields = parseKV(sections.get(`Region ${regIdx}`) || '');
    const infoFields = parseKV(sections.get(`Info ${regIdx}`) || '');

    // Metadata
    const regionName = infoFields.get('Region Name')
      || infoFields.get('Spectrum Name')
      || regionFields.get('Region Name')
      || `Region ${regIdx}`;
    const excitationEnergy = parseFloat(infoFields.get('Excitation Energy') || '0');
    const energyScale = (infoFields.get('Energy Scale') || 'Kinetic').toLowerCase();

    // Dimension scales
    const d1 = parseDimensionScale(regionFields.get('Dimension 1 scale') || '');

    // Collect data blocks for this region
    const dataBlocks: string[] = [];
    const mainData = sections.get(`Data ${regIdx}`);
    if (mainData) dataBlocks.push(mainData);
    // Check sub-blocks [Data N:1], [Data N:2], ...
    let sweepIdx = 1;
    while (sections.has(`Data ${regIdx}:${sweepIdx}`)) {
      dataBlocks.push(sections.get(`Data ${regIdx}:${sweepIdx}`)!);
      sweepIdx++;
    }

    if (dataBlocks.length === 0) continue;

    // Parse first data block
    const dataRows = parseDataBlock(dataBlocks[0]);
    if (dataRows.length === 0) continue;

    let energy: number[];
    let intensity: number[];

    if (d1.length > 0) {
      // Dimension 1 scale provides energy axis
      energy = d1;
      // Data columns: first col may be energy (if ncols > 1) or just intensities
      const nCols = dataRows[0].length;
      if (nCols >= 2) {
        // Multiple columns: col 0 = energy (skip), cols 1+ = intensities per angle
        // Sum over angles for 1D output
        intensity = dataRows.map(row => {
          let sum = 0;
          for (let c = 1; c < row.length; c++) sum += row[c];
          return sum;
        });
      } else {
        intensity = dataRows.map(row => row[0]);
      }
      // Trim to d1 length
      if (intensity.length > energy.length) intensity = intensity.slice(0, energy.length);
      if (energy.length > intensity.length) energy = energy.slice(0, intensity.length);
    } else {
      // No dimension scale — col 0 = energy, col 1 = intensity
      if (dataRows[0].length >= 2) {
        energy = dataRows.map(row => row[0]);
        // Sum remaining columns
        intensity = dataRows.map(row => {
          let sum = 0;
          for (let c = 1; c < row.length; c++) sum += row[c];
          return sum;
        });
      } else {
        throw new Error(`SES region ${regIdx}: no energy axis found`);
      }
    }

    // If multiple sweep blocks, sum them
    for (let bi = 1; bi < dataBlocks.length; bi++) {
      const sweepRows = parseDataBlock(dataBlocks[bi]);
      for (let ri = 0; ri < Math.min(sweepRows.length, intensity.length); ri++) {
        const row = sweepRows[ri];
        if (d1.length > 0 && row.length >= 2) {
          for (let c = 1; c < row.length; c++) intensity[ri] += row[c];
        } else if (row.length >= 2) {
          for (let c = 1; c < row.length; c++) intensity[ri] += row[c];
        }
      }
    }

    const energyType: 'BE' | 'KE' = energyScale.includes('binding') ? 'BE' : 'KE';

    regions.push({
      name: regionName,
      energy,
      intensity,
      energyType,
      excitationEnergy: excitationEnergy > 0 ? excitationEnergy : undefined,
    });
  }

  if (regions.length === 0) {
    throw new Error('No valid regions found in SES file');
  }

  return { format: 'ses', regions };
}

// ============================================================================
// Unified parser + energy detection
// ============================================================================

/** Detect file format and parse accordingly. */
export function parseFile(text: string, filename: string): ParsedFile {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'npl') return parseNPL(text, filename);
  if (ext === 'vms') return parseVAMAS(text, filename);

  // For .txt: check if SES format
  if (ext === 'txt' && isSESFormat(text)) {
    return parseSES(text, filename);
  }

  // Default: CSV/TSV
  return parseCSV(text, filename);
}

/** Auto-detect if energy axis is KE based on source photon energy. */
export function detectEnergyType(energy: number[], sourceHv: number): 'BE' | 'KE' {
  if (energy.length === 0) return 'BE';
  const med = median(energy);
  // If median energy > 55% of hv, likely KE
  return med > sourceHv * 0.55 ? 'KE' : 'BE';
}

/** Convert a ParsedRegion to SpectrumData. */
export function regionToSpectrum(region: ParsedRegion, filename: string): SpectrumData {
  const source = region.excitationEnergy
    ? resolveSource(region.excitationEnergy)
    : undefined;

  return {
    energy: region.energy,
    intensity: region.intensity,
    name: region.name !== filename ? `${filename} [${region.name}]` : filename,
    energyType: region.energyType,
    source,
    excitationEnergy: region.excitationEnergy,
  };
}
