import { useState, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import type { AnalysisSettings, IdentificationResult, Language, SpectrumData } from './types';
import { autoIdentify } from './lib/auto-identify';
import { XRAY_SOURCES, setSynchrotronEnergy } from './lib/energy';
import { clearDBCache } from './lib/element-db';
import { detectEnergyType } from './lib/parsers';
import { t } from './i18n/translations';
import FileUpload from './components/FileUpload';
import EmptyState from './components/EmptyState';
import MethodPage from './components/MethodPage';
import NarrowScanNotice, { NARROW_SCAN_EV } from './components/NarrowScanNotice';
import FeedbackMenu from './components/FeedbackMenu';
import { fetchSample } from './lib/samples';
import type { SampleDef } from './lib/samples';
import { regionToSpectrum } from './lib/parsers';
import { SAMPLES } from './lib/samples';
import { trackEvent, fileLoadedEvent } from './lib/analytics';
import SpectrumChart from './components/SpectrumChart';
import ElementTable from './components/ElementTable';
import SettingsPanel from './components/SettingsPanel';

type Theme = 'light' | 'dark';

const defaultSettings: AnalysisSettings = {
  source: 'Al',
  toleranceEV: 3.0,
  minConfidence: 0.3,
  bgMethod: 'shirley',
  includeAuger: true,
  chargingCorrection: true,
  inputEnergyType: 'auto',
  displayEnergy: 'BE',
};

function getInitialLang(): Language {
  const saved = localStorage.getItem('xps-lang');
  if (saved === 'en' || saved === 'ja') return saved;
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('xps-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}

function App() {
  const [lang, setLang] = useState<Language>(getInitialLang);
  const [spectrum, setSpectrum] = useState<SpectrumData | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  // Developer option: show the raw scoring string in the Why panel
  const [showRaw, setShowRaw] = useState<boolean>(() => localStorage.getItem('xps-dev-raw') === '1');

  // Apply theme to document.
  // useLayoutEffect (not useEffect): SpectrumChart reads the theme's CSS variables via
  // getComputedStyle inside its own useEffect, and child passive effects run before the
  // parent's. A layout effect runs before every passive effect, so the attribute is in
  // place before the chart is rebuilt and it picks up the new theme's colors.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('xps-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('xps-lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('xps-dev-raw', showRaw ? '1' : '0');
  }, [showRaw]);

  // Keep Synchrotron energy in sync with XRAY_SOURCES registry (must run before useMemo)
  useMemo(() => {
    if (settings.source === 'Synchrotron' && settings.customEnergy) {
      if (XRAY_SOURCES['Synchrotron'] !== settings.customEnergy) {
        setSynchrotronEnergy(settings.customEnergy);
        clearDBCache('Synchrotron');
      }
    }
  }, [settings.source, settings.customEnergy]);

  // What the raw energy column actually is. This is the only thing that decides whether
  // the data gets converted before analysis; the display axis never affects it.
  //   'auto' → trust the parser hint, then run the heuristic for ambiguous formats
  //            (CSV defaults to 'BE')
  //   'BE' / 'KE' → user override for this file
  const effectiveInputType: 'BE' | 'KE' | undefined = useMemo(() => {
    if (!spectrum) return undefined;
    if (settings.inputEnergyType !== 'auto') return settings.inputEnergyType;
    if (spectrum.energyType === 'KE') return 'KE';
    const hv = spectrum.excitationEnergy ?? XRAY_SOURCES[settings.source] ?? 1486.6;
    return detectEnergyType(spectrum.energy, hv);
  }, [spectrum, settings.source, settings.customEnergy, settings.inputEnergyType]);

  // Produce "working" spectrum: always BE for analysis.
  const workingSpectrum: SpectrumData | null = useMemo(() => {
    if (!spectrum) return null;
    if (effectiveInputType === 'KE') {
      const hv = spectrum.excitationEnergy ?? XRAY_SOURCES[settings.source] ?? 1486.6;
      return {
        ...spectrum,
        energy: spectrum.energy.map(ke => hv - ke),
        energyType: 'BE' as const,
      };
    }
    return spectrum;
  }, [spectrum, effectiveInputType, settings.source, settings.customEnergy]);

  // Energy span of the loaded data; narrow scans get a notice instead of a confident ranking
  const spanEV = useMemo(() => {
    if (!workingSpectrum || workingSpectrum.energy.length === 0) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const e of workingSpectrum.energy) { if (e < lo) lo = e; if (e > hi) hi = e; }
    return hi - lo;
  }, [workingSpectrum]);
  const isNarrowScan = spanEV > 0 && spanEV < NARROW_SCAN_EV;

  // Display axis is presentation only
  const displayMode: 'BE' | 'KE' = settings.displayEnergy;
  const displayHv = spectrum?.excitationEnergy ?? XRAY_SOURCES[settings.source] ?? 1486.6;

  // Auto-analyze when spectrum or settings change
  const result: IdentificationResult | null = useMemo(() => {
    if (!workingSpectrum) return null;
    try {
      return autoIdentify(workingSpectrum.energy, workingSpectrum.intensity, settings);
    } catch (e) {
      console.error('Auto-identify error:', e);
      return null;
    }
  }, [workingSpectrum, settings]);

  const handleLoad = useCallback((data: SpectrumData) => {
    setSpectrum(data);
    // The input-unit override belongs to one file; a new file starts from auto-detection.
    setSettings(prev => prev.inputEnergyType === 'auto' ? prev : { ...prev, inputEnergyType: 'auto' });
    // Usage counting: bundled sample by name, user files by extension only
    const baseName = data.name.split(' [')[0];
    const sample = SAMPLES.find(s => s.file === baseName);
    trackEvent(sample ? `sample-loaded/${sample.file}` : fileLoadedEvent(baseName));
  }, []);

  const openMethod = useCallback(() => {
    setMethodOpen(true);
    trackEvent('method-opened');
  }, []);

  // Used by the empty-state "try a sample" buttons; the sidebar has its own copy
  // because it also tracks the parsed file for the region selector.
  const handleLoadSample = useCallback(async (sample: SampleDef) => {
    const parsed = await fetchSample(sample);
    handleLoad(regionToSpectrum(parsed.regions[0], sample.file));
    setSettings(prev => ({ ...prev, source: sample.source }));
  }, [handleLoad]);

  const handleSettingsChange = useCallback((newSettings: AnalysisSettings) => {
    setSettings(newSettings);
  }, []);

  const handleSettingsPatch = useCallback((patch: Partial<AnalysisSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const handlePeakClick = useCallback((element: string | null) => {
    setSelectedElement(element);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>{t('appTitle', lang)}</h1>
          <span className="subtitle">{t('appSubtitle', lang)}</span>
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'light' ? '\u263E' : '\u2600'}
          </button>
          <div className="lang-toggle">
            <button
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >EN</button>
            <button
              className={lang === 'ja' ? 'active' : ''}
              onClick={() => setLang('ja')}
            >JA</button>
          </div>
          <a
            href="https://github.com/stoyoda0012-cyber/xps-peak-assign"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >GitHub</a>
          <FeedbackMenu
            lang={lang}
            context={{ lang, theme, settings, fileName: spectrum?.name ?? null, result }}
          />
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <FileUpload
            onLoad={handleLoad}
            lang={lang}
            currentFile={spectrum?.name ?? null}
            onSettingsChange={handleSettingsPatch}
          />
          <SettingsPanel
            settings={settings}
            onChange={handleSettingsChange}
            lang={lang}
            effectiveInputType={effectiveInputType}
            showRaw={showRaw}
            onShowRawChange={setShowRaw}
          />
        </aside>

        <main className="content">
          {!workingSpectrum ? (
            <EmptyState lang={lang} onLoadSample={handleLoadSample} />
          ) : (
            <>
              <SpectrumChart
                spectrum={workingSpectrum}
                result={result}
                lang={lang}
                theme={theme}
                settings={settings}
                selectedElement={selectedElement}
                onPeakClick={handlePeakClick}
                displayMode={displayMode}
                displayHv={displayHv}
              />
              {isNarrowScan && result && (
                <NarrowScanNotice lang={lang} spanEV={spanEV} result={result} settings={settings} />
              )}
              <ElementTable
                result={result}
                lang={lang}
                selectedElement={selectedElement}
                onElementClick={handlePeakClick}
                showRaw={showRaw}
                onOpenMethod={openMethod}
              />
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <span>
          {t('poweredBy', lang)}
          {' \u00B7 '}
          <button className="link-button" onClick={openMethod}>{t('howItWorks', lang)}</button>
        </span>
        <span className="footer-right">Built with Claude Code</span>
      </footer>

      {methodOpen && <MethodPage lang={lang} onClose={() => setMethodOpen(false)} />}
    </div>
  );
}

export default App;
