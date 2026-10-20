import { useEffect, useRef } from 'react';
import type { IdentificationResult, Language } from '../types';
import { t } from '../i18n/translations';

interface ElementTableProps {
  result: IdentificationResult | null;
  lang: Language;
  selectedElement?: string | null;
  onElementClick?: (element: string | null) => void;
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
  result, lang, selectedElement, onElementClick,
}) => {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

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
            <th>{t('scoring', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {result.candidates.map((cand) => {
            const isSelected = selectedElement === cand.element;
            const photoLines = cand.matchedLines.filter(ml => ml.lineType === 'photo');
            const isSingleLine = photoLines.length <= 1;
            const atFloor = cand.detail.includes('prom_floor');
            const color = confidenceColor(cand.confidence, isSingleLine);
            return (
              <tr
                key={cand.element}
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
                <td className="detail-cell">{cand.detail}</td>
              </tr>
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
