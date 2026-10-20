import { useState } from 'react';
import type { Language } from '../types';
import { SAMPLES } from '../lib/samples';
import type { SampleDef } from '../lib/samples';
import { t } from '../i18n/translations';

interface EmptyStateProps {
  lang: Language;
  /** Resolves when the sample is loaded; rejects with an Error to show */
  onLoadSample: (sample: SampleDef) => Promise<void>;
}

/**
 * Shown in the main area before any spectrum is loaded. Gives the first-time
 * visitor a one-click path (try a sample) instead of relying on the small
 * buttons in the sidebar.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ lang, onLoadSample }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (sample: SampleDef) => {
    setBusy(true);
    setError(null);
    try {
      await onLoadSample(sample);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="empty-state">
      <div className="empty-state-icon">{'📈'}</div>
      <h2>{t('emptyTitle', lang)}</h2>
      <p>{t('emptyBody', lang)}</p>
      <div className="empty-state-samples">
        <span>{t('trySample', lang)}</span>
        {SAMPLES.map(s => (
          <button key={s.file} onClick={() => load(s)} disabled={busy}>
            {t(s.labelKey, lang)}
          </button>
        ))}
      </div>
      {error && <div className="inline-error">{'⚠'} {t('loadFailed', lang)}: {error}</div>}
    </div>
  );
};

export default EmptyState;
