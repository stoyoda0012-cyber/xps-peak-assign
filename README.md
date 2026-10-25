# XPS Peak Assign

Automatic peak assignment for XPS (X-ray Photoelectron Spectroscopy) survey spectra. Runs entirely in the browser -- no server required.

**Try it without installing anything:** https://stoyoda0012-cyber.github.io/xps-peak-assign/

> **Synchrotron data:** set the X-ray source (photon energy) by hand under *X-ray Source -> Synchrotron*. The default is Al Ka (1486.6 eV), and the automatic KE/BE detection also depends on this value.

## Features

- **Automatic element identification** from wide-scan survey spectra
- **Multi-format support**: CSV, TSV, NPL, VAMAS, SES TXT, PXT, IBW
- **HAXPES support**: Ga Ka (9.25 keV) with Scofield cross-sections
- **Input unit (BE/KE) auto-detection** with manual override, separate from the **BE/KE display axis**
- **Synchrotron source** support (custom photon energy)
- **6-component scoring**: position match, spin-orbit pairs, cross-section ratios, Auger confirmation, strongest-line penalty, multi-line bonus
- **Dark mode** with theme persistence
- **Bilingual UI**: English / Japanese

## Quick Start

To run it locally instead of using the web version, you need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/stoyoda0012-cyber/xps-peak-assign.git
cd xps-peak-assign
npm install
npm run dev
```

Open http://localhost:5173 in your browser. Drag & drop an XPS survey file or try the built-in sample data.

## Using it offline

The web version is the normal way to use the app. If the computer that
holds the data has no internet access (a beamline or instrument PC), run the
app locally: everything, including the element database and the sample
spectra, is in the repository, and the analysis never talks to a server.

1. **While online** (any computer): install Git and Node.js 20 or newer,
   then run the Quick Start above through `npm install`.
2. **Move the folder** to the offline computer (copy it including
   `node_modules/`), or do step 1 on that computer while it is still online.
3. **Offline**: in the folder run `npm run dev` and open
   http://localhost:5173 in the browser.

What to expect without a network connection:

- Loading files, identification, the *Why* panel, *How it works*, the BE/KE
  axis and the Synchrotron setting all work as online.
- The browser console shows one failed request for `gc.zgo.at/count.js`
  (the visit counter). It is harmless; nothing waits for it.
- In the *Feedback* menu, the Google Form and GitHub options open a tab that
  cannot load. Use **Copy the message** instead and send the text later.
- Opening `dist/index.html` directly (`file://`) does not work in Chrome and
  Edge: they refuse to load the app's module script from a file. Use the
  development server above, or serve a build made with
  `npm run build -- --base ./` from any static web server
  (for example `python3 -m http.server` inside `dist/`).

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

## Privacy and usage counting

The spectrum never leaves the browser. Visits are counted with
[GoatCounter](https://www.goatcounter.com) (no cookies, no personal data;
dashboard: https://xps-peak-assign.goatcounter.com). `src/lib/analytics.ts`
also counts four coarse events (sample loaded, file loaded by extension,
feedback opened, how-it-works opened). `count.js` ignores localhost, so
development runs are not counted.

## Versions

The footer shows the version you are running (for example `v0.1.1`); click
it for the release notes on
[GitHub Releases](https://github.com/stoyoda0012-cyber/xps-peak-assign/releases).
The same version is included in feedback messages.

## Feedback

The **Feedback** button in the header opens a Google Form (no account
needed) with the environment field pre-filled, or a pre-filled GitHub issue,
or copies the same message for e-mail. The message carries the settings, the
file name and the element list, never the spectrum data. The form URL and
its question IDs live in `FEEDBACK_FORM` in `src/lib/feedback.ts`.

## License

MIT -- see [LICENSE](LICENSE).
