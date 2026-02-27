import { useEffect, useRef, useCallback, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { AnalysisSettings, IdentificationResult, Language, SpectrumData } from '../types';
import { identifyCandidates } from '../lib/element-db';
import { t } from '../i18n/translations';

interface SpectrumChartProps {
  spectrum: SpectrumData | null;
  result: IdentificationResult | null;
  lang: Language;
  theme?: string;
  settings?: AnalysisSettings;
  selectedElement?: string | null;
  onPeakClick?: (element: string | null) => void;
  displayMode?: 'BE' | 'KE';
  displayHv?: number;
}

// Element → color mapping (consistent colors)
const ELEMENT_COLORS: Record<string, string> = {
  C: '#ff6b6b', O: '#4ecdc4', N: '#45b7d1', F: '#f7dc6f',
  Si: '#bb8fce', Ti: '#85c1e9', Sn: '#f0b27a', Al: '#abebc6',
  Au: '#f9e79f', S: '#d7bde2', Cl: '#a3e4d7', Fe: '#f5cba7',
  Cu: '#d4ac0d', Ni: '#58d68d', Zn: '#5dade2', Ca: '#eb984e',
  Na: '#af7ac5', K: '#48c9b0', Mg: '#f1948a', Cr: '#82e0aa',
  Mn: '#7fb3d8', Co: '#d98880',
};

function getColor(element: string): string {
  return ELEMENT_COLORS[element] || '#aaa';
}

interface PopupInfo {
  x: number;
  y: number;
  peakBE: number;
  candidates: Array<{ element: string; lineName: string; databaseBE: number; delta: number }>;
}

export const SpectrumChart: React.FC<SpectrumChartProps> = ({
  spectrum, result, lang, theme, settings, selectedElement, onPeakClick,
  displayMode = 'BE', displayHv = 1486.6,
}) => {
  const isKE = displayMode === 'KE';
  const toDisplay = (be: number) => isKE ? displayHv - be : be;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const updateAnnotationsRef = useRef<(chart: uPlot) => void>(() => {});
  const [popup, setPopup] = useState<PopupInfo | null>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!popup) return;
    const handler = (e: MouseEvent) => {
      const el = document.querySelector('.peak-popup');
      if (el && !el.contains(e.target as Node)) {
        setPopup(null);
      }
    };
    // Delay to avoid same-click trigger
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [popup]);

  const updateAnnotations = useCallback((chart: uPlot) => {
    if (!overlayRef.current || !result || !containerRef.current) return;
    overlayRef.current.innerHTML = '';

    const uWrap = containerRef.current.querySelector('.u-wrap');
    let offsetX = 0, offsetY = 0;
    if (uWrap && overlayRef.current) {
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const uWrapRect = uWrap.getBoundingClientRect();
      offsetX = uWrapRect.left - overlayRect.left;
      offsetY = uWrapRect.top - overlayRect.top;
    }

    const plotLeft = chart.bbox.left / devicePixelRatio + offsetX;
    const plotTop = chart.bbox.top / devicePixelRatio + offsetY;
    const plotHeight = chart.bbox.height / devicePixelRatio;
    const plotWidth = chart.bbox.width / devicePixelRatio;

    const labels: { px: number; topOffset: number; cand: typeof result.candidates[0]; lineName: string }[] = [];

    for (const cand of result.candidates) {
      const photoLines = cand.matchedLines.filter(ml => ml.lineType === 'photo');
      if (photoLines.length === 0) continue;

      const maxCS = Math.max(...photoLines.map(ml => ml.crossSection));
      const csThreshold = maxCS * 0.15;

      const shellGroups = new Map<string, typeof photoLines[0]>();
      for (const ml of photoLines) {
        if (ml.crossSection < csThreshold) continue;
        const key = ml.lineName.slice(0, 2);
        const existing = shellGroups.get(key);
        if (!existing || ml.crossSection > existing.crossSection) {
          shellGroups.set(key, ml);
        }
      }

      for (const [, bestLine] of shellGroups) {
        const labelBE = bestLine.detectedBE + (result?.chargingEV ?? 0);
        const displayVal = toDisplay(labelBE);
        const px = chart.valToPos(displayVal, 'x') + plotLeft;
        if (isNaN(px) || px < plotLeft || px > plotLeft + plotWidth) continue;
        labels.push({ px, topOffset: 0, cand, lineName: bestLine.lineName });
      }
    }

    labels.sort((a, b) => a.px - b.px);
    for (let i = 1; i < labels.length; i++) {
      if (Math.abs(labels[i].px - labels[i - 1].px) < 50) {
        labels[i].topOffset = labels[i - 1].topOffset + 16;
      }
    }

    for (const { px, topOffset, cand, lineName } of labels) {
      const color = getColor(cand.element);
      const isSelected = selectedElement === cand.element;

      const label = document.createElement('div');
      label.className = 'peak-label' + (isSelected ? ' selected' : '');
      label.style.left = `${px}px`;
      label.style.top = `${plotTop + 4 + topOffset}px`;
      label.style.color = isSelected ? '#fff' : color;
      label.style.borderColor = color;
      if (isSelected) label.style.background = color;
      label.textContent = `${cand.element} ${lineName}`;
      label.title = `${cand.element} (${(cand.confidence * 100).toFixed(0)}%) ${cand.detail}`;
      // Click on label → select element
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        setPopup(null);
        onPeakClick?.(isSelected ? null : cand.element);
      });
      overlayRef.current!.appendChild(label);

      const line = document.createElement('div');
      line.className = 'peak-marker-line' + (isSelected ? ' selected' : '');
      line.style.left = `${px}px`;
      line.style.top = `${plotTop}px`;
      line.style.height = `${plotHeight}px`;
      line.style.borderColor = color;
      if (isSelected) line.style.opacity = '0.6';
      overlayRef.current!.appendChild(line);
    }
  }, [result, selectedElement, onPeakClick, isKE, displayHv]);

  useEffect(() => {
    updateAnnotationsRef.current = updateAnnotations;
  }, [updateAnnotations]);

  // Chart click handler — detect peak and show popup or select element
  const handleChartClick = useCallback((e: MouseEvent) => {
    const chart = chartRef.current;
    if (!chart || !result || !containerRef.current) return;

    // Ignore if user is doing drag-zoom (uPlot sets cursor.drag)
    // Check if click is within plot area
    const uWrap = containerRef.current.querySelector('.u-wrap') as HTMLElement;
    if (!uWrap) return;
    const uWrapRect = uWrap.getBoundingClientRect();
    const plotAreaLeft = chart.bbox.left / devicePixelRatio;
    const plotAreaWidth = chart.bbox.width / devicePixelRatio;

    const relX = e.clientX - uWrapRect.left - plotAreaLeft;
    if (relX < 0 || relX > plotAreaWidth) return;

    const clickDisplayVal = chart.posToVal(relX, 'x');
    if (isNaN(clickDisplayVal)) return;
    const clickBE = isKE ? displayHv - clickDisplayVal : clickDisplayVal;

    // Correct for charging to match detected peaks (which are in corrected BE)
    const chargingEV = result.chargingEV ?? 0;
    const correctedBE = clickBE - chargingEV;

    // Find nearest detected peak
    let bestPeak = result.detectedPeaks[0];
    let bestDist = Infinity;
    for (const pk of result.detectedPeaks) {
      const dist = Math.abs(pk.position - correctedBE);
      if (dist < bestDist) {
        bestDist = dist;
        bestPeak = pk;
      }
    }

    // Tolerance: ±5 eV for peak snapping
    if (bestDist > 5) {
      // No peak near click — show DB candidates at click position
      const source = settings?.source ?? 'Al';
      const tolerance = settings?.toleranceEV ?? 2.0;
      const matches = identifyCandidates([correctedBE], tolerance * 2, source, true);
      if (matches[0] && matches[0].length > 0) {
        setPopup({
          x: e.clientX,
          y: e.clientY,
          peakBE: correctedBE,
          candidates: matches[0].slice(0, 8).map(([elem, line, dbBE, delta]) => ({
            element: elem, lineName: line, databaseBE: dbBE, delta,
          })),
        });
      }
      onPeakClick?.(null);
      return;
    }

    // Found a peak — check if it's matched to accepted candidates
    const matchedCands = result.candidates.filter(c =>
      c.matchedLines.some(ml => Math.abs(ml.detectedBE - bestPeak.position) < 0.5)
    );

    if (matchedCands.length > 0) {
      // Click on accepted peak → select/deselect the top element
      const topElem = matchedCands[0].element;
      setPopup(null);
      onPeakClick?.(selectedElement === topElem ? null : topElem);
    } else {
      // Unmatched peak — show rejected candidates + DB matches
      const rejMatched = result.rejected.filter(c =>
        c.matchedLines.some(ml => Math.abs(ml.detectedBE - bestPeak.position) < 0.5)
      );

      const source = settings?.source ?? 'Al';
      const tolerance = settings?.toleranceEV ?? 2.0;
      const dbMatches = identifyCandidates([correctedBE], tolerance * 2, source, true);
      const items: PopupInfo['candidates'] = [];

      // Rejected candidates first
      for (const rc of rejMatched) {
        for (const ml of rc.matchedLines) {
          if (Math.abs(ml.detectedBE - bestPeak.position) < 0.5) {
            items.push({
              element: rc.element,
              lineName: ml.lineName,
              databaseBE: ml.databaseBE,
              delta: ml.deltaEV,
            });
          }
        }
      }

      // Then DB matches not already in rejected
      const seen = new Set(items.map(i => `${i.element}:${i.lineName}`));
      if (dbMatches[0]) {
        for (const [elem, line, dbBE, delta] of dbMatches[0]) {
          const key = `${elem}:${line}`;
          if (!seen.has(key)) {
            items.push({ element: elem, lineName: line, databaseBE: dbBE, delta });
            seen.add(key);
          }
        }
      }

      if (items.length > 0) {
        setPopup({
          x: e.clientX,
          y: e.clientY,
          peakBE: bestPeak.position,
          candidates: items.slice(0, 8),
        });
      }
      onPeakClick?.(null);
    }
  }, [result, settings, selectedElement, onPeakClick, isKE, displayHv]);

  // Attach click listener to chart container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleChartClick);
    return () => el.removeEventListener('click', handleChartClick);
  }, [handleChartClick]);

  useEffect(() => {
    if (!containerRef.current || !spectrum) return;
    chartRef.current?.destroy();

    const { energy, intensity } = spectrum;

    // Build display arrays — for KE, convert and ensure ascending x for uPlot
    let displayEnergy: number[];
    let displayIntensity: number[];
    let displayBg: number[] | null = null;
    let displaySignal: number[] | null = null;

    if (isKE) {
      const keArr = energy.map(be => displayHv - be);
      // Build index array for sorting by KE ascending
      const idx = keArr.map((_, i) => i).sort((a, b) => keArr[a] - keArr[b]);
      displayEnergy = idx.map(i => keArr[i]);
      displayIntensity = idx.map(i => intensity[i]);
      if (result) {
        displayBg = idx.map(i => result.background[i]);
        displaySignal = idx.map(i => result.signal[i]);
      }
    } else {
      displayEnergy = energy;
      displayIntensity = intensity;
      if (result) {
        displayBg = result.background;
        displaySignal = result.signal;
      }
    }

    const cs = getComputedStyle(document.documentElement);
    const rawColor = cs.getPropertyValue('--chart-raw').trim() || '#e74c3c';
    const bgColor = cs.getPropertyValue('--chart-bg').trim() || '#888';
    const sigColor = cs.getPropertyValue('--chart-signal').trim() || '#3498db';
    const textColor = cs.getPropertyValue('--text-primary').trim() || '#2c3e50';
    const gridColor = cs.getPropertyValue('--border').trim() || '#dcdde1';

    const axisLabel = isKE ? t('kineticEnergy', lang) : t('bindingEnergy', lang);

    const seriesData: (number[] | null)[] = [displayEnergy];
    const series: uPlot.Series[] = [
      { label: axisLabel },
      { label: t('rawSpectrum', lang), stroke: rawColor, width: 1.5 },
    ];
    seriesData.push(displayIntensity);

    if (result) {
      series.push({ label: t('backgroundLabel', lang), stroke: bgColor, width: 1, dash: [6, 4] });
      seriesData.push(displayBg);
      series.push({ label: t('signalLabel', lang), stroke: sigColor, width: 1.5 });
      seriesData.push(displaySignal);
    }

    const width = containerRef.current.clientWidth;
    const height = 360;

    const opts: uPlot.Options = {
      width,
      height,
      scales: { x: { time: false, dir: (isKE ? 1 : -1) as 1 | -1 } },
      axes: [
        {
          label: axisLabel,
          labelFont: '12px sans-serif', font: '11px sans-serif',
          stroke: textColor, grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor }, size: 40,
          values: (_u: uPlot, vals: number[]) => vals.map(v => v.toFixed(0)),
        },
        {
          label: t('intensityLabel', lang),
          labelFont: '12px sans-serif', font: '11px sans-serif',
          stroke: textColor, grid: { stroke: gridColor, width: 1 },
          ticks: { stroke: gridColor }, size: 60,
          values: (_u: uPlot, vals: number[]) => vals.map(v =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
          ),
        },
      ],
      series,
      cursor: { show: true, drag: { x: true, y: false } },
      legend: { show: true },
      hooks: {
        ready: [(u: uPlot) => { updateAnnotationsRef.current(u); }],
        draw: [(u: uPlot) => { updateAnnotationsRef.current(u); }],
      },
    };

    const chart = new uPlot(opts, seriesData as uPlot.AlignedData, containerRef.current);
    chartRef.current = chart;

    return () => { chart.destroy(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrum, result, lang, theme, isKE, displayHv]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.setSize({ width: containerRef.current.clientWidth, height: 360 });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Redraw annotations when selectedElement changes (without recreating chart)
  useEffect(() => {
    if (chartRef.current) {
      updateAnnotationsRef.current(chartRef.current);
    }
  }, [selectedElement]);

  return (
    <div className="spectrum-chart-wrapper">
      <div ref={containerRef} className="spectrum-chart">
        <div ref={overlayRef} className="peak-overlay" />
      </div>
      {popup && (
        <div
          className="peak-popup"
          style={{
            left: Math.min(popup.x, window.innerWidth - 280),
            top: popup.y + 10,
          }}
        >
          <div className="peak-popup-title">
            {isKE ? 'KE' : 'BE'} = {toDisplay(popup.peakBE).toFixed(1)} eV
          </div>
          <table className="peak-popup-table">
            <tbody>
              {popup.candidates.map((c, i) => (
                <tr key={i} className="peak-popup-item">
                  <td>
                    <span
                      className="popup-element-badge"
                      style={{ background: getColor(c.element) }}
                    >
                      {c.element}
                    </span>
                  </td>
                  <td>{c.lineName}</td>
                  <td className="popup-be">{toDisplay(c.databaseBE).toFixed(1)}</td>
                  <td className="popup-delta">
                    {c.delta >= 0 ? '+' : ''}{c.delta.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SpectrumChart;
