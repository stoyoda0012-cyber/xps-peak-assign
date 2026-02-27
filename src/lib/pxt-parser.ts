/**
 * pxt-parser.ts: Binary PXT/IBW file parser for Igor Pro wave files (Scienta SES).
 *
 * Supports:
 *   - PXT v3: Packed experiment with multiple regions (.pxt)
 *   - IBW v5: Standalone single wave (.ibw)
 *
 * Ported from Python toyomacro-python/src/toyomacro/io/readers/pxt_reader.py
 */

import type { ParsedRegion, ParsedFile } from './parsers';

// ============================================================================
// Constants
// ============================================================================

const HEADER_SIZE: Record<number, number> = { 3: 64 + 328, 5: 64 + 320 };

/** wave_type → bytes per element */
const DTYPE_SIZE: Record<number, number> = {
  4: 8,   // float64
  2: 4,   // float32
  80: 2,  // uint16
  96: 4,  // uint32
};

// ============================================================================
// Low-level binary helpers
// ============================================================================

interface BinHeader {
  version: number;
  formulaSize: number;
  noteSize: number;
}

interface WaveHeader {
  waveType: number;
  nDim: number[];     // [4] active dimension sizes
  sfA: number[];      // [4] scale factors (delta)
  sfB: number[];      // [4] offsets (initial values)
  nPts: number;       // total number of data points
}

interface PXTRegion {
  nDimCount: number;
  xDelta: number[];
  xIni: number[];
  xFin: number[];
  data: Float64Array;  // always converted to float64
  dims: number[];      // active dimensions (e.g. [1024, 12, 25, 20])
  waveNotes: string;
}

function readBinHeader(view: DataView, position: number): BinHeader {
  const version = view.getInt16(position, true);

  let formulaSize: number;
  let noteSize: number;

  if (version === 3) {
    // skip 14 bytes
    formulaSize = view.getInt32(position + 16, true);
    noteSize = view.getInt32(position + 20, true);
  } else if (version === 5) {
    // skip 6 bytes
    formulaSize = view.getInt32(position + 8, true);
    noteSize = view.getInt32(position + 12, true);
  } else {
    throw new Error(`Unsupported PXT version ${version}. Only 3 (.pxt) and 5 (.ibw) supported.`);
  }

  return { version, formulaSize, noteSize };
}

function readWaveHeader(view: DataView, position: number, version: number): WaveHeader {
  const offset = version === 3 ? 88 : 80;
  const base = position + offset;

  const waveType = view.getUint16(base, true);
  // skip 50 bytes (base + 2 to base + 52)

  const nDim: number[] = [];
  for (let i = 0; i < 4; i++) {
    nDim.push(view.getInt32(base + 52 + i * 4, true));
  }

  const sfA: number[] = [];
  for (let i = 0; i < 4; i++) {
    sfA.push(view.getFloat64(base + 68 + i * 8, true));
  }

  const sfB: number[] = [];
  for (let i = 0; i < 4; i++) {
    sfB.push(view.getFloat64(base + 100 + i * 8, true));
  }

  const activeDims = nDim.filter(d => d > 0);
  const nPts = activeDims.length > 0 ? activeDims.reduce((a, b) => a * b, 1) : 0;

  return { waveType, nDim, sfA, sfB, nPts };
}

function readData(view: DataView, offset: number, waveHeader: WaveHeader): Float64Array {
  const itemSize = DTYPE_SIZE[waveHeader.waveType];
  if (itemSize === undefined) {
    throw new Error(`Unknown wave data type: ${waveHeader.waveType}`);
  }

  const result = new Float64Array(waveHeader.nPts);

  for (let i = 0; i < waveHeader.nPts; i++) {
    const pos = offset + i * itemSize;
    switch (waveHeader.waveType) {
      case 4:  // float64
        result[i] = view.getFloat64(pos, true);
        break;
      case 2:  // float32
        result[i] = view.getFloat32(pos, true);
        break;
      case 80: // uint16
        result[i] = view.getUint16(pos, true);
        break;
      case 96: // uint32
        result[i] = view.getUint32(pos, true);
        break;
    }
  }

  return result;
}

function readNotes(buf: ArrayBuffer, offset: number, binHeader: BinHeader): string {
  const notesStart = offset + binHeader.formulaSize;
  const bytes = new Uint8Array(buf, notesStart, binHeader.noteSize);
  // Decode as latin-1 (each byte = code point)
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function parseWaveNotes(notes: string): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const line of notes.split('\r')) {
    const trimmed = line.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const valStr = trimmed.slice(eqIdx + 1).trim();
    if (!key) continue;
    // Try numeric conversion
    if (valStr.includes('.')) {
      const f = parseFloat(valStr);
      if (!isNaN(f)) { result[key] = f; continue; }
    } else {
      const n = parseInt(valStr, 10);
      if (!isNaN(n) && String(n) === valStr) { result[key] = n; continue; }
    }
    result[key] = valStr;
  }
  return result;
}

// ============================================================================
// Region reading
// ============================================================================

function readAllRegions(buf: ArrayBuffer): PXTRegion[] {
  const view = new DataView(buf);
  const fileSize = buf.byteLength;

  // Detect format: PXT v3 or IBW v5
  const firstVersion = view.getInt16(0, true);

  if (firstVersion === 5) {
    return readIBWRegions(buf);
  }

  // --- PXT v3: Packed Experiment ---
  const regions: PXTRegion[] = [];
  let offset = 0;

  while (offset + 8 < fileSize) {
    const recType = view.getUint16(offset, true);
    // skip recVersion at offset+2
    const recSize = view.getUint32(offset + 4, true);

    // END marker
    if (recType === 0 && recSize === 0) break;

    // Only process wave records (type=3)
    if (recType !== 3) {
      offset += 8 + recSize;
      continue;
    }

    const waveStart = offset + 8;

    try {
      const binHeader = readBinHeader(view, waveStart);
      const waveHeader = readWaveHeader(view, waveStart, binHeader.version);
      const headerSize = HEADER_SIZE[binHeader.version];

      if (!(waveHeader.waveType in DTYPE_SIZE) || waveHeader.nPts <= 0) {
        offset += 8 + recSize;
        continue;
      }

      const activeDims = waveHeader.nDim.filter(d => d > 0);
      const nDimCount = activeDims.length;

      const xDelta = waveHeader.sfA.slice(0, nDimCount);
      const xIni = waveHeader.sfB.slice(0, nDimCount);
      const xFin = xIni.map((ini, i) => ini + (activeDims[i] - 1) * xDelta[i]);

      const dataOffset = waveStart + headerSize;
      const data = readData(view, dataOffset, waveHeader);

      const itemSize = DTYPE_SIZE[waveHeader.waveType];
      const notesOffset = dataOffset + waveHeader.nPts * itemSize;
      const notes = readNotes(buf, notesOffset, binHeader);

      // Skip axis scaling waves: 1D with no key=value notes
      const parsed = parseWaveNotes(notes);
      if (nDimCount <= 1 && Object.keys(parsed).length === 0) {
        offset += 8 + recSize;
        continue;
      }

      regions.push({
        nDimCount,
        xDelta,
        xIni,
        xFin,
        data,
        dims: activeDims,
        waveNotes: notes,
      });
    } catch {
      // Skip unparseable records
    }

    offset += 8 + recSize;
  }

  return regions;
}

function readIBWRegions(buf: ArrayBuffer): PXTRegion[] {
  const view = new DataView(buf);

  const binHeader = readBinHeader(view, 0);
  const waveHeader = readWaveHeader(view, 0, 5);
  const headerSize = HEADER_SIZE[5];

  if (!(waveHeader.waveType in DTYPE_SIZE) || waveHeader.nPts <= 0) {
    return [];
  }

  const activeDims = waveHeader.nDim.filter(d => d > 0);
  const nDimCount = activeDims.length;

  const xDelta = waveHeader.sfA.slice(0, nDimCount);
  const xIni = waveHeader.sfB.slice(0, nDimCount);
  const xFin = xIni.map((ini, i) => ini + (activeDims[i] - 1) * xDelta[i]);

  const data = readData(view, headerSize, waveHeader);

  const itemSize = DTYPE_SIZE[waveHeader.waveType];
  const notesOffset = headerSize + waveHeader.nPts * itemSize;
  const notes = readNotes(buf, notesOffset, binHeader);

  return [{
    nDimCount,
    xDelta,
    xIni,
    xFin,
    data,
    dims: activeDims,
    waveNotes: notes,
  }];
}

// ============================================================================
// Multi-dimensional data → 1D intensity (sum over non-energy axes)
// ============================================================================

/**
 * Collapse multi-dimensional data to 1D by summing over all non-energy axes.
 * Data is stored in Fortran (column-major) order:
 *   flat[i] → indices: (i % d0, floor(i/d0) % d1, floor(i/(d0*d1)) % d2, ...)
 * So dimension 0 (energy) varies fastest.
 */
function integrateToEnergy(data: Float64Array, dims: number[]): number[] {
  const nEnergy = dims[0];
  const result = new Float64Array(nEnergy);

  if (dims.length <= 1) {
    // 1D: already energy-only
    return Array.from(data);
  }

  // Sum all values sharing the same energy index (Fortran order: energy is fastest)
  for (let i = 0; i < data.length; i++) {
    const energyIdx = i % nEnergy;
    result[energyIdx] += data[i];
  }

  return Array.from(result);
}

// ============================================================================
// Public API
// ============================================================================

/** Check if an ArrayBuffer looks like a PXT or IBW file. */
export function isPXTorIBW(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 16) return false;
  const view = new DataView(buf);
  const version = view.getInt16(0, true);
  // PXT files start with a packed-record header; first 2 bytes (rec_type)
  // are typically 3 (wave). IBW files have version=5 at offset 0.
  if (version === 5) return true;
  // For PXT: first record type should be 3 (wave) or other valid type
  // The version field read as int16 will be the record type.
  // Let's just check file extension in the caller instead.
  return true; // caller handles extension check
}

/**
 * Parse a PXT or IBW binary file.
 *
 * Returns a ParsedFile with regions, each containing 1D energy + intensity
 * (multi-dimensional data is summed over non-energy axes).
 */
export function parsePXT(buf: ArrayBuffer, filename: string): ParsedFile {
  const regions = readAllRegions(buf);

  if (regions.length === 0) {
    throw new Error('No valid regions found in PXT/IBW file.');
  }

  const parsedRegions: ParsedRegion[] = regions.map(region => {
    const notes = parseWaveNotes(region.waveNotes);

    // Region name
    const name = String(
      notes['Region Name'] ?? notes['RegionName'] ?? `Region ${regions.indexOf(region) + 1}`
    );

    // Excitation energy
    const hv = Number(
      notes['Excitation Energy'] ?? notes['ExcitationEnergy'] ?? 0
    );

    // Energy scale
    const scaleStr = String(
      notes['Energy Scale'] ?? notes['EnergyScale'] ?? 'Kinetic'
    ).toLowerCase();
    const energyType: 'BE' | 'KE' = scaleStr.includes('binding') ? 'BE' : 'KE';

    // Build energy axis: linspace(xIni[0], xFin[0], nEnergy)
    const nEnergy = region.dims[0];
    const eStart = region.xIni[0];
    const eEnd = region.xFin[0];
    const energy: number[] = [];
    for (let i = 0; i < nEnergy; i++) {
      energy.push(nEnergy > 1 ? eStart + (eEnd - eStart) * i / (nEnergy - 1) : eStart);
    }

    // Intensity: sum over non-energy dimensions
    const intensity = integrateToEnergy(region.data, region.dims);

    return {
      name,
      energy,
      intensity,
      energyType,
      excitationEnergy: hv > 0 ? hv : undefined,
    };
  });

  const ext = filename.split('.').pop()?.toLowerCase();
  const format = (ext === 'ibw' ? 'ibw' : 'pxt') as 'csv'; // cast to satisfy type

  return { format: format as ParsedFile['format'], regions: parsedRegions };
}
