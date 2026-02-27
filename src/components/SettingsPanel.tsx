import { useState, useRef, useEffect } from 'react';
import type { AnalysisSettings, Language } from '../types';
import { XRAY_SOURCES } from '../lib/energy';
import { Slider } from './Slider';
import { t } from '../i18n/translations';

const SOURCE_LABELS: Record<string, string> = {
  Al: 'Al Ka',
  Mg: 'Mg Ka',
  Zr: 'Zr La',
  Ag: 'Ag La',
  Ti: 'Ti Ka',
  Cr: 'Cr Ka',
  Ga: 'Ga Ka',
};

interface SettingsPanelProps {
  settings: AnalysisSettings;
  onChange: (settings: AnalysisSettings) => void;
  lang: Language;
  detectedEnergyType?: 'BE' | 'KE';
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings, onChange, lang, detectedEnergyType,
}) => {
  const [showEnergyDialog, setShowEnergyDialog] = useState(false);
  const [dialogEnergy, setDialogEnergy] = useState('');
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof AnalysisSettings, value: unknown) => {
    onChange({ ...settings, [key]: value });
  };

  // Auto-focus the dialog input when it opens
  useEffect(() => {
    if (showEnergyDialog && dialogInputRef.current) {
      dialogInputRef.current.focus();
      dialogInputRef.current.select();
    }
  }, [showEnergyDialog]);

  const handleSourceChange = (value: string) => {
    if (value === 'Synchrotron') {
      // Show dialog to input photon energy
      setDialogEnergy(String(settings.customEnergy ?? 10000));
      setShowEnergyDialog(true);
    } else {
      update('source', value);
    }
  };

  const confirmSynchrotronEnergy = () => {
    const eV = parseFloat(dialogEnergy);
    if (!isNaN(eV) && eV > 0) {
      onChange({ ...settings, source: 'Synchrotron', customEnergy: eV });
      setShowEnergyDialog(false);
    }
  };

  const cancelDialog = () => {
    setShowEnergyDialog(false);
  };

  // Standard sources (non-Synchrotron entries in XRAY_SOURCES)
  const standardSources = Object.entries(XRAY_SOURCES).filter(([key]) => key !== 'Synchrotron');

  return (
    <div className="settings-panel">
      <h3>{t('settings', lang)}</h3>

      <div className="param-section">
        <label className="slider-label">{t('xraySource', lang)}</label>
        <select
          value={settings.source}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="source-select"
        >
          {standardSources.map(([key, energy]) => (
            <option key={key} value={key}>
              {SOURCE_LABELS[key] ?? key} ({energy} eV)
            </option>
          ))}
          <option value="Synchrotron">
            {t('synchrotron', lang)}
            {settings.source === 'Synchrotron' && settings.customEnergy
              ? ` (${settings.customEnergy} eV)`
              : ''}
          </option>
        </select>
        {/* Inline edit button when Synchrotron is already selected */}
        {settings.source === 'Synchrotron' && !showEnergyDialog && (
          <button
            className="synchrotron-edit-btn"
            onClick={() => {
              setDialogEnergy(String(settings.customEnergy ?? 10000));
              setShowEnergyDialog(true);
            }}
            title={t('photonEnergy', lang)}
          >
            ✎ {settings.customEnergy} eV
          </button>
        )}
      </div>

      {/* Synchrotron energy dialog */}
      {showEnergyDialog && (
        <div className="synchrotron-dialog-overlay" onClick={cancelDialog}>
          <div className="synchrotron-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="synchrotron-dialog-title">
              {t('enterPhotonEnergy', lang)}
            </div>
            <div className="synchrotron-dialog-body">
              <label>{t('photonEnergy', lang)}</label>
              <input
                ref={dialogInputRef}
                type="number"
                value={dialogEnergy}
                onChange={(e) => setDialogEnergy(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmSynchrotronEnergy();
                  if (e.key === 'Escape') cancelDialog();
                }}
                min="100"
                max="100000"
                step="0.1"
                className="synchrotron-energy-input"
              />
            </div>
            <div className="synchrotron-dialog-actions">
              <button onClick={cancelDialog} className="dialog-cancel">Cancel</button>
              <button onClick={confirmSynchrotronEnergy} className="dialog-ok">OK</button>
            </div>
          </div>
        </div>
      )}

      <div className="param-section">
        <label className="slider-label">
          {t('energyAxis', lang)}
          {settings.energyType === 'auto' && detectedEnergyType && (
            <span className="energy-hint"> ({t('detectedAs', lang)} {detectedEnergyType})</span>
          )}
        </label>
        <div className="energy-type-toggle">
          {(['auto', 'BE', 'KE'] as const).map((val) => (
            <button
              key={val}
              className={settings.energyType === val ? 'active' : ''}
              onClick={() => update('energyType', val)}
            >
              {val === 'auto' ? t('energyAuto', lang) : val}
            </button>
          ))}
        </div>
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
