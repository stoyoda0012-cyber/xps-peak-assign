/**
 * parsers.ts: Parse 2-column CSV/TSV text files (BE, Intensity).
 */

import type { SpectrumData } from '../types';

export function parseCSV(text: string, filename: string = 'uploaded'): SpectrumData {
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
    const i = parseFloat(parts[1]);

    if (isNaN(e) || isNaN(i)) continue; // skip header or invalid rows

    energy.push(e);
    intensity.push(i);
  }

  if (energy.length === 0) {
    throw new Error('No valid data found in file. Expected 2-column format (energy, intensity).');
  }

  return { energy, intensity, name: filename };
}
