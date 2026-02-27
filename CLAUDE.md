# XPS Peak Assign — Web App

Browser-based automatic XPS survey spectrum peak assignment tool.
React SPA deployed on GitHub Pages (no backend).

## Tech Stack

- **React 19** + **TypeScript ~5.9** + **Vite 7**
- **uPlot 1.6** for high-performance canvas charting
- No other runtime dependencies

## Project Structure

```
xps-peak-assign/
├── public/samples/          # Sample CSV data
│   └── tio2-wide.csv        # NPL TiO2/FTO Wide survey (public data)
├── src/
│   ├── App.tsx              # Layout + state management
│   ├── App.css              # Dark theme styles
│   ├── types.ts             # All shared TypeScript interfaces
│   ├── components/
│   │   ├── FileUpload.tsx   # Drag & drop + sample buttons
│   │   ├── SpectrumChart.tsx # uPlot chart + peak annotations
│   │   ├── ElementTable.tsx # Identification results table
│   │   ├── SettingsPanel.tsx # Parameter settings sidebar
│   │   └── Slider.tsx       # Reusable slider component
│   ├── lib/
│   │   ├── energy.ts        # X-ray source registry, BE/KE conversion
│   │   ├── element-db.ts    # Element DB, SO pairs, Auger, candidate matching
│   │   ├── background.ts    # Shirley iterative background subtraction
│   │   ├── peak-detection.ts # SG smoothing + findPeaks + prominence
│   │   ├── scoring.ts       # 6-component heuristic scoring (A-F)
│   │   ├── auto-identify.ts # Main orchestrator pipeline
│   │   ├── parsers.ts       # CSV/NPL/VAMAS/SES text parsers
│   │   └── pxt-parser.ts    # PXT/IBW binary parser (Igor Pro)
│   ├── data/
│   │   ├── binding-energies.json  # NIST BE data (103 elements)
│   │   ├── cross-sections-al.json # Yeh-Lindau CS (Al Ka)
│   │   └── cross-sections-ga.json # Scofield CS (Ga Ka, HAXPES)
│   └── i18n/
│       └── translations.ts  # EN/JA bilingual strings
├── scripts/
│   ├── convert-csv.py       # CSV -> JSON data converter (one-shot)
│   └── export-samples.py    # NPL -> CSV sample exporter (one-shot)
└── .github/workflows/
    └── deploy.yml           # GitHub Pages CI/CD (not yet pushed)
```

## Core Algorithm Pipeline

`auto-identify.ts` orchestrates:
1. **Shirley background** subtraction (iterative, max 50 iterations)
2. **Peak detection** (Savitzky-Golay smoothing + local maxima + prominence filter)
3. **Charging correction** (C 1s search in 270-320 eV range)
4. **Candidate matching** (BE tolerance-based, from element DB)
5. **Multi-heuristic scoring** (6 components):
   - A. Position match (prominence-weighted Gaussian)
   - B. Spin-orbit pair confirmation (splitting + intensity ratio) x3.0
   - C. Cross-section ratio consistency (inter-group log-error) x1.5
   - D. Auger line confirmation x2.0
   - E. Strongest-line missing penalty x0.3
   - F. Multi-line (shell group count) bonus x1.3/group
6. **Ranking** by composite score, min_confidence threshold

## Python Source Correspondence

| TypeScript | Python Source |
|---|---|
| `lib/energy.ts` | `element_db.py` XRAY_SOURCES |
| `lib/element-db.ts` | `element_db.py` _build_db(), query functions |
| `lib/background.ts` | `toyomacro/background/shirley.py` |
| `lib/peak-detection.ts` | `auto_identify.py` _detect_peaks_wide() |
| `lib/scoring.ts` | `auto_identify.py` _score_candidates() |
| `lib/auto-identify.ts` | `auto_identify.py` ElementIdentifier.identify() |

Python source: `/Users/toyodasatoshi/MATLAB-Drive/SourceCode/peak_analysis/wide_spectrum/`

## Key Conventions

- **X-axis**: Reversed (high BE left, low BE right) — XPS convention
  - uPlot: `scales: { x: { time: false, dir: -1 } }`
- **Energy**: Always Binding Energy (eV) internally
- **Multiple sources**: Al Ka (1486.6 eV), Mg Ka, Zr La, Ag La, Ti Ka, Cr Ka, Ga Ka, Synchrotron
- **Lanthanides excluded** (La-Lu) to prevent false positives
- **Dark theme** UI with CSS variables

## Commands

```bash
npm run dev      # Development server (port 5173)
npm run build    # Production build -> dist/
npm run preview  # Preview production build
```

## GitHub

- Repo: https://github.com/stoyoda0012-cyber/xps-peak-assign
- GitHub Pages deploy workflow exists locally but not yet pushed (needs PAT with `workflow` scope)

## Known Limitations

- Shirley background only (no Tougaard)
- Single-line elements (C, O, F) have structurally low confidence
- No quantitative analysis (atomic %)
- No result export (PDF/CSV)

## Roadmap

- Tougaard background
- Interactive peak editing
- Quantitative analysis
- Result export
- Web Worker for large datasets
