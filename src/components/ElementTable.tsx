import { useEffect, useRef } from 'react';
import type { IdentificationResult, Language } from '../types';
import { t } from '../i18n/translations';

interface ElementTableProps {
  result: IdentificationResult | null;
  lang: Language;
  selectedElement?: string | null;
  onElementClick?: (element: string | null) => void;
}

function confidenceColor(conf: number): string {
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
    return <div className="element-table-empty">{t('noResults', lang)}</div>;
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
            <th>{t('confidence', lang)}</th>
            <th>{t('matchedLines', lang)}</th>
            <th>{t('scoring', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {result.candidates.map((cand) => {
            const isSelected = selectedElement === cand.element;
            return (
              <tr
                key={cand.element}
                ref={isSelected ? selectedRowRef : undefined}
                className={isSelected ? 'selected' : ''}
                onClick={() => onElementClick?.(isSelected ? null : cand.element)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <span className="element-badge" style={{ background: confidenceColor(cand.confidence) }}>
                    {cand.element}
                  </span>
                </td>
                <td>
                  <div className="confidence-bar-container">
                    <div
                      className="confidence-bar"
                      style={{
                        width: `${cand.confidence * 100}%`,
                        background: confidenceColor(cand.confidence),
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
            {result.rejected.slice(0, 10).map((cand) => (
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
