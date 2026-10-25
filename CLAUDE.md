# XPS Peak Assign — Web App

Browser-based automatic XPS survey spectrum peak assignment tool.
React SPA deployed on GitHub Pages (no backend):
https://stoyoda0012-cyber.github.io/xps-peak-assign/

> **Every push/merge to `main` deploys to the public site immediately**
> (`.github/workflows/deploy.yml`). Never push to `main` directly: work on a
> branch, open a PR, and let CI (`ci.yml`: lint + test + build) pass first.

## Tech Stack

- **React 19** + **TypeScript ~5.9** + **Vite 7**
- **uPlot 1.6** for high-performance canvas charting
- No other runtime dependencies
- **Vitest 4** for tests (dev only; 4.x because CI runs Node 20)

## Project Structure

```
xps-peak-assign/
├── public/samples/          # Sample CSV data
│   ├── tio2-wide.csv        # NPL TiO2/FTO Wide survey (public data), Al Ka
│   └── au-si-haxpes.csv     # Au/Si HAXPES survey, Ga Ka (9251.7 eV)
├── src/
│   ├── App.tsx              # Layout + state management
│   ├── App.css              # Light/dark theme styles (CSS variables)
│   ├── types.ts             # All shared TypeScript interfaces
│   ├── components/
│   │   ├── FileUpload.tsx   # Drag & drop + sample buttons
│   │   ├── SpectrumChart.tsx # uPlot chart + peak annotations
│   │   ├── ElementTable.tsx # Identification results table
│   │   ├── SettingsPanel.tsx # Parameter settings sidebar
│   │   ├── EmptyState.tsx   # First-visit panel with sample buttons
│   │   ├── MethodPage.tsx   # "How it works": pipeline, scoring rules, data provenance
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
│   ├── __tests__/
│   │   ├── golden.test.ts   # Golden tests pinning current pipeline output
│   │   ├── explain-detail.test.ts # Scoring-string -> explanation rows, score summary
│   │   ├── helpers/         # analyse() (mirrors App.tsx), synthetic spectrum generator
│   │   └── fixtures/        # Synthetic fixtures (e.g. HfO2/Si @ 7940 eV)
│   ├── data/
│   │   ├── binding-energies.json  # Standard elemental BE table (103 elements)
│   │   ├── cross-sections-al.json # Yeh & Lindau (1985) CS (Al Ka)
│   │   └── cross-sections-ga.json # Scofield (1973) CS (Ga Ka, HAXPES)
│   └── i18n/
│       └── translations.ts  # EN/JA bilingual strings
├── scripts/
│   ├── convert-csv.py       # CSV -> JSON data converter (one-shot)
│   └── export-samples.py    # NPL -> CSV sample exporter (one-shot)
└── .github/workflows/
    ├── ci.yml               # PR / non-main branches: lint + test + build
    └── deploy.yml           # push to main -> build + deploy to GitHub Pages
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

## Data Provenance

- `binding-energies.json`: the standard elemental core-level binding-energy
  table (Bearden & Burr 1967 / Fuggle & Mårtensson 1980 lineage). It is
  identical to toyomacro's `binding_energy.json`. It is **not** a NIST
  database export.
- `cross-sections-al.json`: Yeh & Lindau, *At. Data Nucl. Data Tables* 32, 1
  (1985), subshell photoionization cross sections at Al Ka.
- `cross-sections-ga.json`: Scofield, UCRL-51326 (1973), at Ga Ka (HAXPES).
- Only source `'Ga'` uses the Scofield table. Every other source, including
  `'Synchrotron'`, currently falls back to the Al Ka table (known bug F2,
  pinned in the golden tests).
- The two tables differ in absolute scale by ~20x. The candidate filter's
  minimum cross-section is therefore **relative** to each table's strongest
  line (`getMinCrossSection()` in `element-db.ts`; the fraction is chosen so
  the Al Ka threshold is the historical 0.001 Mb). An absolute threshold had
  removed every H..Mg line (O 1s, C 1s, ...) for HAXPES.
- The UI footer names these sources, and the in-app "How it works" page
  (`components/MethodPage.tsx`, EN/JA) documents the pipeline, the scoring
  rules with their constants, score-to-confidence normalisation, provenance
  and limitations. Keep it in sync when constants in `lib/` change.

## Python Source Correspondence

| TypeScript | Python Source |
|---|---|
| `lib/energy.ts` | `element_db.py` XRAY_SOURCES |
| `lib/element-db.ts` | `element_db.py` _build_db(), query functions |
| `lib/background.ts` | `toyomacro/background/shirley.py` |
| `lib/peak-detection.ts` | `auto_identify.py` _detect_peaks_wide() |
| `lib/scoring.ts` | `auto_identify.py` _score_candidates() |
| `lib/auto-identify.ts` | `auto_identify.py` ElementIdentifier.identify() |

Python source (private): the `peak_analysis/wide_spectrum/` package. Build
scripts locate it via `XPS_SOURCE_ROOT` (see `scripts/`).

## Key Conventions

- **X-axis**: Reversed (high BE left, low BE right) — XPS convention
  - uPlot: `scales: { x: { time: false, dir: -1 } }`
- **Energy**: Always Binding Energy (eV) internally
  - `settings.inputEnergyType` ('auto' | 'BE' | 'KE') decides how the file's energy column is
    interpreted (auto = parser hint + heuristic) and is reset to 'auto' on every load.
  - `settings.displayEnergy` ('BE' | 'KE') only picks the chart axis; it never changes the analysis.
- **Multiple sources**: Al Ka (1486.6 eV), Mg Ka, Zr La, Ag La, Ti Ka, Cr Ka, Ga Ka, Synchrotron
- **Lanthanides excluded** (La-Lu) to prevent false positives
- **Light/dark theme** via CSS variables on `data-theme` (light is the default, choice persisted)
  - The attribute is set in a `useLayoutEffect` so SpectrumChart's `getComputedStyle` reads the
    new theme before it rebuilds the chart.

## Commands

```bash
npm run dev      # Development server (port 5173)
npm run build    # Production build -> dist/
npm run preview  # Preview production build
npm run lint     # ESLint (must exit 0; `_`-prefixed unused args are allowed)
npm test         # Vitest (golden + generator tests), Node environment
```

## Tests

`src/__tests__/golden.test.ts` pins the **current** output of `autoIdentify()`:
accepted elements, confidences (2 dp), matched line names, and chargingEV.
It covers the bundled samples, plus synthetic fixtures built by the seeded
generator in `helpers/synthetic.ts`. Cases run through `helpers/analyse.ts`,
which reproduces App.tsx's preprocessing for a CSV (energyType `auto` KE/BE
detection, and the Synchrotron hv registration).

The `KNOWN-WRONG` describe block records output that is known to be incorrect
today: F1 (HAXPES data analysed as Al Ka), F2 (Synchrotron uses the Al Ka
cross-section table), and the synthetic HfO2/Si fixture at 7940 eV. A PR
that changes results must update these expectations deliberately and explain
the diff. Do not loosen the assertions to make them pass.

## GitHub

- Repo: https://github.com/stoyoda0012-cyber/xps-peak-assign
- Live site: https://stoyoda0012-cyber.github.io/xps-peak-assign/ (deployed by `deploy.yml` on every push to `main`)
- PR checks: `ci.yml` (Node 20: `npm ci`, lint, test, build)
- Pushing changes under `.github/workflows/` requires a token with the `workflow` scope

## Versioning and releases

The version lives in `package.json` only. Vite injects it as `__APP_VERSION__`
(`vite.config.ts` `define`); the footer shows it as `vX.Y.Z` linking to the
GitHub Releases page, and the feedback message carries it. Git tags and
GitHub Releases are the public history of what changed.

For a PR that changes behaviour a user could notice (a fix, a feature):
1. On the branch: `npm version patch --no-git-tag-version` (or `minor`)
   and commit it with the change. One bump per PR; refactors and docs do not bump.
2. After the merge, on the updated `main`:
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`
3. `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."` with 2-5 lines
   written for users (what they will see differently), not a commit list.

Do not create the tag before the merge: it must point at the `main` commit
that the live site is built from.

## Analytics

GoatCounter (`index.html` script tag -> https://xps-peak-assign.goatcounter.com)
counts page views; `lib/analytics.ts` counts four coarse events. No cookies,
no file names, no data. Keep the privacy section of `MethodPage.tsx` in sync
if events are added. Localhost is ignored by count.js.

## Known Limitations

- Shirley background only (no Tougaard)
- Single-line elements (C, O, F) have structurally low confidence
- Narrow scans (< `NARROW_SCAN_EV` = 150 eV) cannot be cross-checked; the UI
  shows `NarrowScanNotice` (table lines near each peak) above the results
  instead of trusting the ranking. Multi-region PXT files are analysed one
  region at a time.
- No quantitative analysis (atomic %)
- No result export (PDF/CSV)
- Offline use is `npm run dev` (README "Using it offline"). `npm run preview`
  renders blank: `vite.config.ts` sees `command === 'serve'` for preview too
  and sets base `/`, while `dist/` was built for `/xps-peak-assign/` (fix:
  use `isPreview` from Vite's ConfigEnv). `file://` cannot work in Chromium
  (module script blocked from a `null` origin).

## Roadmap

- Tougaard background
- Interactive peak editing
- Quantitative analysis
- Result export
- Web Worker for large datasets
