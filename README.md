# XPS Peak Assign

Automatic peak assignment for XPS (X-ray Photoelectron Spectroscopy) survey spectra. Runs entirely in the browser -- no server required.

## Features

- **Automatic element identification** from wide-scan survey spectra
- **Multi-format support**: CSV, TSV, NPL, VAMAS, SES TXT, PXT, IBW
- **HAXPES support**: Ga Ka (9.25 keV) with Scofield cross-sections
- **KE/BE display toggle** with sticky interpretation
- **Synchrotron source** support (custom photon energy)
- **6-component scoring**: position match, spin-orbit pairs, cross-section ratios, Auger confirmation, strongest-line penalty, multi-line bonus
- **Dark mode** with theme persistence
- **Bilingual UI**: English / Japanese

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser. Drag & drop an XPS survey file or try the built-in sample data.

## Algorithm

1. **Shirley background** subtraction (iterative)
2. **Peak detection** via Savitzky-Golay smoothing + prominence filtering
3. **Charging correction** from C 1s reference (with SO doublet fallback for HAXPES)
4. **Candidate matching** against NIST binding energy database (103 elements)
5. **Multi-heuristic scoring** and ranking with confidence thresholds

## Supported File Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| CSV/TSV | `.csv`, `.tsv` | 2-column (energy, intensity) |
| NPL | `.npl` | National Physical Laboratory format |
| VAMAS | `.vms` | ISO 14976 |
| SES TXT | `.txt` | Scienta Omicron SES format |
| PXT | `.pxt` | Igor Pro Packed Experiment (multi-region) |
| IBW | `.ibw` | Igor Pro Binary Wave (single-region) |

## Tech Stack

- React 19 + TypeScript
- Vite 7
- uPlot (high-performance canvas charting)
- Zero backend dependencies

## License

MIT
