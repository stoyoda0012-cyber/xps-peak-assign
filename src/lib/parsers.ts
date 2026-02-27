/**
 * parsers.ts: Multi-format XPS data file parser.
 *
 * Supported formats:
 *   - CSV/TSV: 2-column (energy, intensity)
 *   - NPL: Ulvac PHI line-oriented text (VAMAS variant)
 *   - VAMAS (.vms): ISO 14976 line-oriented text (Omicron instruments)
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
  format: 'csv' | 'npl' | 'vamas' | 'ses';
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
    const stripped = allLines[i].trim().replace(/\x00/g, '');
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
  let fileHeader: string[];
  [fileHeader, cursor] = readNonEmptyLines(allLines, cursor, 14);
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

export function parseVAMAS(text: string, _filename: string = 'uploaded'): ParsedFile {
  const allLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let cursor = 0;

  // File header: 12 non-empty lines
  let fileHeader: string[];
  [fileHeader, cursor] = readNonEmptyLines(allLines, cursor, 12);
  const nRegions = parseInt(fileHeader[5], 10);
  if (isNaN(nRegions) || nRegions < 1) {
    throw new Error('Invalid VAMAS file: cannot read number of regions');
  }

  const regions: ParsedRegion[] = [];

  for (let r = 0; r < nRegions; r++) {
    // Region header: 9 non-empty lines
    let regionHeader: string[];
    [regionHeader, cursor] = readNonEmptyLines(allLines, cursor, 9);

    const regionNameField = regionHeader.length > 8 ? regionHeader[8] : 'XPS';

    let eIni: number, eStep: number, nEnergy: number;
    let displayName: string;

    if (regionNameField === 'XPS') {
      // Extended: 34 non-empty lines
      let ext: string[];
      [ext, cursor] = readNonEmptyLines(allLines, cursor, 34);
      eIni = parseFloat(ext[18]);
      eStep = parseFloat(ext[19]);
      nEnergy = parseInt(ext[31], 10);
      displayName = `XPS${r + 1}`;
    } else {
      // Extended: 35 non-empty lines
      let ext: string[];
      [ext, cursor] = readNonEmptyLines(allLines, cursor, 35);
      eIni = parseFloat(ext[19]);
      eStep = parseFloat(ext[20]);
      nEnergy = parseInt(ext[32], 10);
      displayName = regionNameField;
    }

    // Energy axis (always KE in VAMAS)
    const energy = Array.from({ length: nEnergy }, (_, i) => eIni + i * eStep);

    // Data: nEnergy intensity values
    let dataLines: string[];
    [dataLines, cursor] = readNonEmptyLines(allLines, cursor, nEnergy);
    const intensity = dataLines.map(l => parseFloat(l));

    regions.push({
      name: displayName,
      energy,
      intensity,
      energyType: 'KE', // VAMAS is always KE
    });
  }

  if (regions.length === 0) {
    throw new Error('No valid regions found in VAMAS file');
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
