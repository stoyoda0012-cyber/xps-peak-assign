import type { AnalysisSettings, Language } from '../types';
import { Slider } from './Slider';
import { t } from '../i18n/translations';

interface SettingsPanelProps {
  settings: AnalysisSettings;
  onChange: (settings: AnalysisSettings) => void;
  lang: Language;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, lang }) => {
  const update = (key: keyof AnalysisSettings, value: unknown) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="settings-panel">
      <h3>{t('settings', lang)}</h3>

      <div className="param-section">
        <label className="slider-label">{t('xraySource', lang)}</label>
        <select
          value={settings.source}
          onChange={(e) => update('source', e.target.value)}
          className="source-select"
        >
          <option value="Al">Al Ka (1486.6 eV)</option>
        </select>
      </div>

      <Slider
        label={t('tolerance', lang)}
        value={settings.toleranceEV}
        min={0.5} max={5.0} step={0.1}
        unit="eV"
        onChange={(v) => update('toleranceEV', v)}
      />

      <Slider
        label={t('minConfidence', lang)}
        value={settings.minConfidence}
        min={0.1} max={0.8} step={0.05}
        onChange={(v) => update('minConfidence', v)}
      />

      <div className="checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={settings.includeAuger}
            onChange={(e) => update('includeAuger', e.target.checked)}
          />
          {t('includeAuger', lang)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.chargingCorrection}
            onChange={(e) => update('chargingCorrection', e.target.checked)}
          />
          {t('chargingCorrection', lang)}
        </label>
      </div>
    </div>
  );
};

export default SettingsPanel;
