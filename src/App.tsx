import { useState, useMemo, useCallback } from 'react';
import type { AnalysisSettings, IdentificationResult, Language, SpectrumData } from './types';
import { autoIdentify } from './lib/auto-identify';
import { t } from './i18n/translations';
import FileUpload from './components/FileUpload';
import SpectrumChart from './components/SpectrumChart';
import ElementTable from './components/ElementTable';
import SettingsPanel from './components/SettingsPanel';

const defaultSettings: AnalysisSettings = {
  source: 'Al',
  toleranceEV: 2.0,
  minConfidence: 0.3,
  bgMethod: 'shirley',
  includeAuger: true,
  chargingCorrection: true,
};

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [spectrum, setSpectrum] = useState<SpectrumData | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);

  // Auto-analyze when spectrum or settings change
  const result: IdentificationResult | null = useMemo(() => {
    if (!spectrum) return null;
    try {
      return autoIdentify(spectrum.energy, spectrum.intensity, settings);
    } catch (e) {
      console.error('Auto-identify error:', e);
      return null;
    }
  }, [spectrum, settings]);

  const handleLoad = useCallback((data: SpectrumData) => {
    setSpectrum(data);
  }, []);

  const handleSettingsChange = useCallback((newSettings: AnalysisSettings) => {
    setSettings(newSettings);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>{t('appTitle', lang)}</h1>
          <span className="subtitle">{t('appSubtitle', lang)}</span>
        </div>
        <div className="header-right">
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
          />
          <SettingsPanel
            settings={settings}
            onChange={handleSettingsChange}
            lang={lang}
          />
        </aside>

        <main className="content">
          <SpectrumChart
            spectrum={spectrum}
            result={result}
            lang={lang}
          />
          <ElementTable
            result={result}
            lang={lang}
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
