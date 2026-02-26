import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { IdentificationResult, Language, SpectrumData } from '../types';
import { t } from '../i18n/translations';

interface SpectrumChartProps {
  spectrum: SpectrumData | null;
  result: IdentificationResult | null;
  lang: Language;
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

export const SpectrumChart: React.FC<SpectrumChartProps> = ({ spectrum, result, lang }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !spectrum) return;

    // Dispose previous chart
    chartRef.current?.destroy();

    const { energy, intensity } = spectrum;

    // Build data arrays: [energy, raw, background?, signal?]
    const seriesData: (number[] | null)[] = [energy];
    const series: uPlot.Series[] = [
      { label: t('bindingEnergy', lang) },
      {
        label: t('rawSpectrum', lang),
        stroke: '#e74c3c',
        width: 1.5,
      },
    ];
    seriesData.push(intensity);

    if (result) {
      series.push({
        label: t('backgroundLabel', lang),
        stroke: '#888',
        width: 1,
        dash: [6, 4],
      });
      seriesData.push(result.background);

      series.push({
        label: t('signalLabel', lang),
        stroke: '#3498db',
        width: 1.5,
      });
      seriesData.push(result.signal);
    }

    const width = containerRef.current.clientWidth;
    const height = 360;

    const opts: uPlot.Options = {
      width,
      height,
      scales: {
        x: { time: false, dir: -1 as const }, // XPS convention: high BE on left, NOT time
      },
      axes: [
        {
          label: t('bindingEnergy', lang),
          size: 40,
          values: (_u: uPlot, vals: number[]) => vals.map(v => v.toFixed(0)),
        },
        {
          label: t('intensityLabel', lang),
          size: 60,
          values: (_u: uPlot, vals: number[]) => vals.map(v =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
          ),
        },
      ],
      series,
      cursor: { show: true, drag: { x: true, y: false } },
      legend: { show: true },
    };

    const chart = new uPlot(opts, seriesData as uPlot.AlignedData, containerRef.current);
    chartRef.current = chart;

    // Update annotations
    updateAnnotations(chart);

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrum, result, lang]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.setSize({
          width: containerRef.current.clientWidth,
          height: 360,
        });
        updateAnnotations(chartRef.current);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  function updateAnnotations(chart: uPlot) {
    if (!overlayRef.current || !result) return;
    overlayRef.current.innerHTML = '';

    const plotLeft = chart.bbox.left / devicePixelRatio;
    const plotTop = chart.bbox.top / devicePixelRatio;
    const plotHeight = chart.bbox.height / devicePixelRatio;

    for (const cand of result.candidates) {
      // Find strongest matched photo line
      const photoLines = cand.matchedLines.filter(ml => ml.lineType === 'photo');
      if (photoLines.length === 0) continue;

      const bestLine = photoLines.reduce((a, b) =>
        a.crossSection > b.crossSection ? a : b
      );

      // Convert BE to pixel position
      const px = chart.valToPos(bestLine.databaseBE, 'x', true) / devicePixelRatio;
      if (px < plotLeft || px > plotLeft + chart.bbox.width / devicePixelRatio) continue;

      // Create label element
      const label = document.createElement('div');
      label.className = 'peak-label';
      label.style.left = `${px}px`;
      label.style.top = `${plotTop + 4}px`;
      label.style.color = getColor(cand.element);
      label.style.borderColor = getColor(cand.element);
      label.textContent = `${cand.element} ${bestLine.lineName}`;
      label.title = `${cand.element} (${(cand.confidence * 100).toFixed(0)}%) ${cand.detail}`;
      overlayRef.current.appendChild(label);

      // Vertical marker line
      const line = document.createElement('div');
      line.className = 'peak-marker-line';
      line.style.left = `${px}px`;
      line.style.top = `${plotTop}px`;
      line.style.height = `${plotHeight}px`;
      line.style.borderColor = getColor(cand.element);
      overlayRef.current.appendChild(line);
    }
  }

  return (
    <div className="spectrum-chart-wrapper">
      <div ref={containerRef} className="spectrum-chart" />
      <div ref={overlayRef} className="peak-overlay" />
    </div>
  );
};

export default SpectrumChart;
