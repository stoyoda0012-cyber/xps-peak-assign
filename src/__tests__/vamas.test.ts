import { describe, expect, it } from 'vitest';
import { parseVAMAS, parseFile } from '../lib/parsers';

// Header layout seen in one lab instrument's export: two comment lines of
// which the first is EMPTY, one experimental variable, and an EMPTY transition
// label. Every empty line is a field in ISO 14976; skipping them shifts the
// whole block.
const sparseHeader = [
  'VAMAS Surface Chemical Analysis Standard Data Transfer Format 1988 May 4',
  'Unknown', 'Instrument', 'Operator', 'wide',
  '2', '', 'Analyser serial number: 12302',
  'NORM', 'REGULAR',
  '1',          // number of spectral regions
  '1', 'Slice', 'd',   // one experimental variable
  '0', '0', '0', '0',
  '1',          // number of blocks
  // block
  'wide slice', 'Sample 1; Description = ; Compound = oxide',
  '2024', '8', '29', '10', '50', '40', '0',
  '0',          // block comment lines
  'XPS',
  '0',          // experimental variable value
  'Al k alpha', '1486.7', '1E+37', '1E+37', '1E+37', '1E+37', '1E+37',
  'FAT', '100', '1E+37', '-0.136322065589018', '0', '22', '0.5', '1E+37', '1E+37',
  'wide', '',   // species label, EMPTY transition label
  '-1',
  'Kinetic Energy', 'eV', '287.1', '1',
  '1', 'Intensity', 'd',
  'analogue', '0.7588', '1', '1E+37',
  '1E+37', '1E+37', '1E+37',
  '0',          // additional numerical parameters
  '5',          // ordinate values
  '0', '1',
  '4820.15', '5468.587', '5790.6885', '4689.513', '5552.468',
].join('\r\n') + '\r\n';

// Header layout of a second instrument's export (Mg Ka): empty identifiers,
// block comment carrying the region name, several blocks, "end of experiment"
// trailer.
const block = (comment: string, start: string, data: number[]) => [
  '', '', '2018', '6', '14', '11', '45', '15', '0',
  '1', comment,
  'XPS', '',
  '1253.6', '300.0', '1E37', '1E37', '1E37', '1E37',
  'FAT', '50.00', '5.0', '4.500', '1E37', '2400', '1200', '1E37', '1E37',
  '', '', '-1',
  'kinetic energy', 'eV', start, '0.5',
  '1', 'count rate', 'c/s',
  'pulse counting', '0.050', '1', '70E-9',
  '1E37', '1E37', '1E37',
  '0',
  String(data.length), String(Math.min(...data)), String(Math.max(...data)),
  ...data.map(String),
];
const commentNamed = [
  'VAMAS Surface Chemical Analysis Standard Data Transfer Format 1988 May 4',
  '', '', '', '',
  '1', 'Experiment Type: XPS',
  'NORM', 'REGULAR', '2', '0', '0', '0', '0', '0', '2',
  ...block('survey', '50.0', [10, 20, 30]),
  ...block('O1s', '700.0', [5, 6, 7, 8]),
  'end of experiment',
].join('\r\n') + '\r\n';

describe('parseVAMAS', () => {
  it('reads a file whose header has empty comment and transition lines', () => {
    const f = parseVAMAS(sparseHeader, 'a.vms');
    expect(f.format).toBe('vamas');
    expect(f.regions).toHaveLength(1);
    const r = f.regions[0];
    expect(r.name).toBe('wide slice');
    expect(r.energyType).toBe('KE');
    expect(r.excitationEnergy).toBeCloseTo(1486.7);
    expect(r.energy).toEqual([287.1, 288.1, 289.1, 290.1, 291.1]);
    expect(r.intensity).toEqual([4820.15, 5468.587, 5790.6885, 4689.513, 5552.468]);
  });

  it('reads a multi-block file with empty identifiers and names blocks from the comment', () => {
    const f = parseVAMAS(commentNamed, 'b.vms');
    expect(f.regions.map(r => r.name)).toEqual(['survey', 'O1s']);
    expect(f.regions[0].excitationEnergy).toBeCloseTo(1253.6);
    expect(f.regions[0].energy).toEqual([50, 50.5, 51]);
    expect(f.regions[0].intensity).toEqual([10, 20, 30]);
    expect(f.regions[1].energy).toEqual([700, 700.5, 701, 701.5]);
    expect(f.regions[1].intensity).toEqual([5, 6, 7, 8]);
  });

  it('treats a binding-energy abscissa as BE', () => {
    const f = parseVAMAS(sparseHeader.replace('Kinetic Energy', 'Binding Energy'), 'be.vms');
    expect(f.regions[0].energyType).toBe('BE');
  });

  it('is reached through parseFile for .vms', () => {
    expect(parseFile(sparseHeader, 'x.vms').regions[0].name).toBe('wide slice');
  });

  it('fails clearly on a truncated file instead of returning an empty spectrum', () => {
    const cut = sparseHeader.split('\r\n').slice(0, 60).join('\r\n');
    expect(() => parseVAMAS(cut, 'cut.vms')).toThrow(/Invalid VAMAS file/);
  });
});
