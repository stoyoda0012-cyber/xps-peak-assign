import { parseCSV } from './parsers';
import type { ParsedFile } from './parsers';

/** Built-in sample spectra shipped under public/samples. */
export interface SampleDef {
  file: string;
  /** translations.ts key for the button label */
  labelKey: 'sampleTiO2' | 'sampleAuSiHAXPES';
  /** X-ray source to select when the sample is loaded */
  source: string;
}

export const SAMPLES: readonly SampleDef[] = [
  { file: 'tio2-wide.csv', labelKey: 'sampleTiO2', source: 'Al' },
  { file: 'au-si-haxpes.csv', labelKey: 'sampleAuSiHAXPES', source: 'Ga' },
];

/** Fetch and parse one of the bundled samples. Throws on HTTP or parse errors. */
export async function fetchSample(sample: SampleDef): Promise<ParsedFile> {
  const base = import.meta.env.BASE_URL || '/';
  const resp = await fetch(`${base}samples/${sample.file}`);
  if (!resp.ok) {
    throw new Error(`${sample.file}: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  return parseCSV(text, sample.file);
}
