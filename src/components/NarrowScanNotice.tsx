import { useMemo } from 'react';
import type { AnalysisSettings, IdentificationResult, Language } from '../types';
import { identifyCandidates, getCrossSection, getMaxCrossSection } from '../lib/element-db';
import { t } from '../i18n/translations';

/** Scans narrower than this (eV) are treated as narrow / high-resolution scans, not surveys. */
export const NARROW_SCAN_EV = 150;

interface NarrowScanNoticeProps {
  lang: Language;
  /** Energy span of the loaded spectrum (eV) */
  spanEV: number;
  result: IdentificationResult;
  settings: AnalysisSettings;
}

interface LineHit {
  element: string;
  line: string;
  tableBE: number;
  deltaEV: number;
  /** cross-section relative to the strongest line of the table, 0..1 */
  relCS: number;
}

/**
 * Shown when the loaded spectrum is a narrow scan. Element identification is
 * built for survey spectra: in a 20 eV window there are no spin-orbit partners,
 * other shells or Auger lines to cross-check, so every candidate is a single
 * line and the ranking only reflects the distance to the tabulated value.
 * Instead of pretending otherwise, list the table lines near each detected
 * peak and let the analyst decide.
 */
export const NarrowScanNotice: React.FC<NarrowScanNoticeProps> = ({ lang, spanEV, result, settings }) => {
  const peaks = useMemo(
    () => [...result.detectedPeaks].sort((a, b) => b.prominence - a.prominence).slice(0, 6),
    [result],
  );
  const hitsPerPeak = useMemo(() => {
    const positions = peaks.map(p => p.position);
    const matches = identifyCandidates(positions, settings.toleranceEV, settings.source, false);
    const maxCS = getMaxCrossSection(settings.source) || 1;
    return matches.map(list => {
      const hits: LineHit[] = list.map(([element, line, tableBE, deltaEV]) => ({
        element,
        line,
        tableBE,
        deltaEV,
        relCS: getCrossSection(element, line, settings.source) / maxCS,
      }));
      hits.sort((a, b) => Math.abs(a.deltaEV) - Math.abs(b.deltaEV));
      return hits;
    });
  }, [peaks, settings.toleranceEV, settings.source]);

  const ja = lang === 'ja';
  const fmtDelta = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;

  return (
    <div className="narrow-notice" role="note">
      <div className="narrow-title">
        {'⚠'} {t('narrowTitle', lang).replace('{span}', spanEV.toFixed(0))}
      </div>
      <p className="narrow-body">{t('narrowBody', lang)}</p>
      {peaks.length > 0 && (
        <table className="narrow-table">
          <thead>
            <tr>
              <th>{t('narrowPeak', lang)}</th>
              <th>{t('narrowLines', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {peaks.map((pk, i) => (
              <tr key={pk.position}>
                <td className="narrow-peak">{(pk.position + result.chargingEV).toFixed(1)} eV</td>
                <td>
                  {hitsPerPeak[i].length === 0
                    ? <span className="narrow-none">{t('narrowNoLine', lang)}</span>
                    : hitsPerPeak[i].map(h => (
                      <span key={`${h.element}-${h.line}`} className="narrow-hit" title={ja
                        ? `表の値 ${h.tableBE.toFixed(1)} eV、ずれ ${fmtDelta(h.deltaEV)} eV、断面積は表の最強ラインの ${(h.relCS * 100).toFixed(1)}%`
                        : `table ${h.tableBE.toFixed(1)} eV, Δ ${fmtDelta(h.deltaEV)} eV, cross-section ${(h.relCS * 100).toFixed(1)}% of the table's strongest line`}
                      >
                        <strong>{h.element} {h.line}</strong>
                        <span className="narrow-meta"> {fmtDelta(h.deltaEV)} eV · {(h.relCS * 100).toFixed(1)}%</span>
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="narrow-foot">{t('narrowFoot', lang)}</p>
    </div>
  );
};

export default NarrowScanNotice;
