import { useEffect, useRef, useState, Fragment } from 'react';
import type { IdentificationResult, Language } from '../types';
import { t } from '../i18n/translations';
import { explainDetail, summariseScore } from '../lib/explain-detail';

interface ElementTableProps {
  result: IdentificationResult | null;
  lang: Language;
  selectedElement?: string | null;
  onElementClick?: (element: string | null) => void;
  /** Developer option: also show the raw scoring string inside the Why panel */
  showRaw?: boolean;
  /** Opens the "How it works" page */
  onOpenMethod?: () => void;
}

const SINGLE_LINE_COLOR = '#7f8c8d';

function confidenceColor(conf: number, singleLine: boolean): string {
  // A single-line element (C 1s, O 1s, F 1s, ...) has nothing to cross-check against,
  // so its confidence is structurally low. Showing it red reads as "suspicious element",
  // which is misleading for e.g. O in TiO2; gray says "cannot be rated" instead.
  if (singleLine) return SINGLE_LINE_COLOR;
  if (conf >= 0.8) return '#27ae60';
  if (conf >= 0.5) return '#f39c12';
  return '#e74c3c';
}

export const ElementTable: React.FC<ElementTableProps> = ({
  result, lang, selectedElement, onElementClick, showRaw = false, onOpenMethod,
}) => {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  // Elements whose "why" panel is open. The raw scoring string is developer-facing,
  // so it stays hidden until asked for.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (element: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(element)) next.delete(element); else next.add(element);
      return next;
    });
  };

  // Scroll selected row into view
  useEffect(() => {
    if (selectedElement && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedElement]);

  if (!result || result.candidates.length === 0) {
    return <div className="element-table-empty">{t('noCandidates', lang)}</div>;
  }

  return (
    <div className="element-table-container">
      <h3>{t('results', lang)}</h3>

      {Math.abs(result.chargingEV) > 0.5 && (
        <div className="charging-info">
          ⚡ {t('charging', lang)}: {result.chargingEV > 0 ? '+' : ''}{result.chargingEV.toFixed(1)} eV
        </div>
      )}

      <table className="element-table">
        <thead>
          <tr>
            <th>{t('element', lang)}</th>
            <th title={t('confidenceLegend', lang)} className="th-help">{t('confidence', lang)}</th>
            <th>{t('matchedLines', lang)}</th>
            <th className="why-header">{t('why', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {result.candidates.map((cand) => {
            const isSelected = selectedElement === cand.element;
            const photoLines = cand.matchedLines.filter(ml => ml.lineType === 'photo');
            const isSingleLine = photoLines.length <= 1;
            const atFloor = cand.detail.includes('prom_floor');
            const color = confidenceColor(cand.confidence, isSingleLine);
            const isExpanded = expanded.has(cand.element);
            return (
              <Fragment key={cand.element}>
              <tr
                ref={isSelected ? selectedRowRef : undefined}
                className={isSelected ? 'selected' : ''}
                onClick={() => onElementClick?.(isSelected ? null : cand.element)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <span className="element-badge" style={{ background: color }}>
                    {cand.element}
                  </span>
                  {isSingleLine && (
                    <span className="single-line-tag" title={t('singleLineHint', lang)}>
                      {t('singleLine', lang)}
                    </span>
                  )}
                </td>
                <td>
                  <div
                    className="confidence-bar-container"
                    title={atFloor ? t('promFloorHint', lang) : undefined}
                  >
                    <div
                      className="confidence-bar"
                      style={{
                        width: `${cand.confidence * 100}%`,
                        background: color,
                      }}
                    />
                    <span className="confidence-value">{(cand.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="lines-cell">
                  {cand.matchedLines
                    .filter(ml => ml.lineType === 'photo')
                    .map(ml => ml.lineName)
                    .join(', ')}
                  {cand.matchedLines.some(ml => ml.lineType === 'auger') && (
                    <span className="auger-tag"> +Auger</span>
                  )}
                </td>
                <td className="why-cell">
                  <button
                    className={'detail-toggle' + (isExpanded ? ' open' : '')}
                    onClick={(e) => { e.stopPropagation(); toggleExpanded(cand.element); }}
                    aria-expanded={isExpanded}
                    title={t('whyHint', lang)}
                  >
                    {isExpanded ? '\u25BE' : '\u25B8'} {t('why', lang)}
                  </button>
                </td>
              </tr>
              {isExpanded && (() => {
                const rows = explainDetail(cand.detail, lang);
                const score = summariseScore(cand, result);
                return (
                <tr className="detail-row">
                  <td colSpan={4}>
                    <table className="explain-table">
                      <thead>
                        <tr>
                          <th>{t('explainWhat', lang)}</th>
                          <th>{t('explainFound', lang)}</th>
                          <th>{t('explainEffect', lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.filter(r => r.kind !== 'note').map((r, i) => (
                          <tr key={i} className={'explain-' + r.kind}>
                            <td className="explain-label">{r.label}</td>
                            <td>{r.observation}</td>
                            <td className="explain-effect">{r.effect}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="score-summary">
                      {t('scoreTotal', lang)} {score.rawScore.toFixed(2)}
                      {' \u00F7 '}{t('scoreTop', lang)} ({score.topElement}) {score.maxScore.toFixed(2)}
                      {' = '}{score.ratio.toFixed(2)}
                      {' \u2192 '}{t('confidence', lang)} {(score.confidence * 100).toFixed(0)}%
                      {score.floored && <span className="score-floored"> ({t('scoreFloored', lang)})</span>}
                    </div>
                    {rows.filter(r => r.kind === 'note').map((r, i) => (
                      <div key={i} className="explain-note">
                        {'\u24D8'} {r.label}{r.observation ? `: ${r.observation}` : ''}
                      </div>
                    ))}
                    <table className="lines-table">
                      <thead>
                        <tr>
                          <th>{t('lineCol', lang)}</th>
                          <th>{t('dbBE', lang)}</th>
                          <th>{t('detectedBE', lang)}</th>
                          <th>{'\u0394'} (eV)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cand.matchedLines.map(ml => (
                          <tr key={ml.lineName}>
                            <td>{ml.lineName}{ml.lineType === 'auger' && <span className="auger-tag"> Auger</span>}</td>
                            <td>{ml.databaseBE.toFixed(1)}</td>
                            <td>{ml.detectedBE.toFixed(1)}</td>
                            <td>{ml.deltaEV >= 0 ? '+' : ''}{ml.deltaEV.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {showRaw && (
                      <details className="raw-detail">
                        <summary>{t('rawScoring', lang)}</summary>
                        <code>{cand.detail}</code>
                      </details>
                    )}
                    {onOpenMethod && (
                      <button
                        className="link-button method-link"
                        onClick={(e) => { e.stopPropagation(); onOpenMethod(); }}
                      >
                        {t('methodLink', lang)}
                      </button>
                    )}
                  </td>
                </tr>
                );
              })()}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {result.rejected.length > 0 && (
        <details className="rejected-section">
          <summary>{t('rejected', lang)} ({result.rejected.length})</summary>
          <div className="rejected-list">
            {result.rejected.map((cand) => (
              <span key={cand.element} className="rejected-item">
                {cand.element} ({(cand.confidence * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default ElementTable;
