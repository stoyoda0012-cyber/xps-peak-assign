import { useState, useMemo, useCallback, useEffect } from 'react';
import type { AnalysisSettings, IdentificationResult, Language, SpectrumData } from './types';
import { autoIdentify } from './lib/auto-identify';
import { XRAY_SOURCES, setSynchrotronEnergy } from './lib/energy';
import { clearDBCache } from './lib/element-db';
import { detectEnergyType } from './lib/parsers';
import { t } from './i18n/translations';
import FileUpload from './components/FileUpload';
import SpectrumChart from './components/SpectrumChart';
import ElementTable from './components/ElementTable';
import SettingsPanel from './components/SettingsPanel';

type Theme = 'light' | 'dark';

const defaultSettings: AnalysisSettings = {
  source: 'Al',
  toleranceEV: 2.0,
  minConfidence: 0.3,
  bgMethod: 'shirley',
  includeAuger: true,
  chargingCorrection: true,
  energyType: 'auto',
};

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('xps-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [spectrum, setSpectrum] = useState<SpectrumData | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  // "Sticky" KE declaration: once user explicitly selects KE, interpretation stays KE
  // even when switching to BE display. Reset by clicking Auto or loading a new file.
  const [interpretAsKE, setInterpretAsKE] = useState(false);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('xps-theme', theme);
  }, [theme]);

  // Keep Synchrotron energy in sync with XRAY_SOURCES registry (must run before useMemo)
  useMemo(() => {
    if (settings.source === 'Synchrotron' && settings.customEnergy) {
      if (XRAY_SOURCES['Synchrotron'] !== settings.customEnergy) {
        setSynchrotronEnergy(settings.customEnergy);
        clearDBCache('Synchrotron');
      }
    }
  }, [settings.source, settings.customEnergy]);

  // Produce "working" spectrum: always convert to BE for analysis.
  // Interpretation logic:
  //   interpretAsKE=true → always treat raw data as KE (sticky after user clicks KE)
  //   'auto' → auto-detect (parser hint + heuristic)
  //   'BE'   → force interpret as BE (only when interpretAsKE is false)
  //   'KE'   → force interpret as KE (also sets interpretAsKE=true)
  // Display is controlled separately by settings.energyType (KE → show KE axis).
  const workingSpectrum: SpectrumData | null = useMemo(() => {
    if (!spectrum) return null;

    let effectiveType = spectrum.energyType;

    if (interpretAsKE) {
      // User has declared this is KE data — always convert, regardless of display toggle
      effectiveType = 'KE';
    } else if (settings.energyType === 'auto') {
      // Auto: trust parser, then run heuristic for ambiguous formats (CSV defaults to 'BE')
      if (effectiveType === 'BE') {
        const hv = spectrum.excitationEnergy ?? XRAY_SOURCES[settings.source] ?? 1486.6;
        effectiveType = detectEnergyType(spectrum.energy, hv);
      }
    } else {
      // Manual override: 'BE' or 'KE' (KE only if interpretAsKE hasn't been set yet)
      effectiveType = settings.energyType;
    }

    if (effectiveType === 'KE') {
      const hv = spectrum.excitationEnergy ?? XRAY_SOURCES[settings.source] ?? 1486.6;
      return {
        ...spectrum,
        energy: spectrum.energy.map(ke => hv - ke),
        energyType: 'BE' as const,
      };
    }
    return spectrum;
  }, [spectrum, settings.source, settings.customEnergy, settings.energyType, interpretAsKE]);

  // Display mode: KE when user explicitly selects KE, otherwise BE
  const displayMode: 'BE' | 'KE' = settings.energyType === 'KE' ? 'KE' : 'BE';
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
    setInterpretAsKE(false); // Reset KE declaration for new file
  }, []);

  const handleSettingsChange = useCallback((newSettings: AnalysisSettings) => {
    // Track sticky KE declaration:
    //   KE clicked → set sticky (user declares "this is KE data")
    //   Auto clicked → clear sticky (reset to auto-detection)
    //   BE clicked → no change (keep KE interpretation if previously declared)
    if (newSettings.energyType === 'KE') {
      setInterpretAsKE(true);
    } else if (newSettings.energyType === 'auto') {
      setInterpretAsKE(false);
    }
    setSettings(newSettings);
  }, []);

  const handleSettingsPatch = useCallback((patch: Partial<AnalysisSettings>) => {
    if ('energyType' in patch) {
      if (patch.energyType === 'KE') setInterpretAsKE(true);
      else if (patch.energyType === 'auto') setInterpretAsKE(false);
    }
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
            detectedEnergyType={spectrum?.energyType}
          />
        </aside>

        <main className="content">
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
          <ElementTable
            result={result}
            lang={lang}
            selectedElement={selectedElement}
            onElementClick={handlePeakClick}
          />
        </main>
      </div>

      <footer className="app-footer">
        <span>{t('poweredBy', lang)}</span>
        <span className="footer-right">Built with Claude Code</span>
      </footer>
    </div>
  );
}

export default App;
