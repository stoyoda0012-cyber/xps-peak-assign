import { useCallback, useRef, useState } from 'react';
import type { AnalysisSettings, Language, SpectrumData } from '../types';
import { parseFile, parseCSV, regionToSpectrum } from '../lib/parsers';
import type { ParsedFile } from '../lib/parsers';
import { resolveSource } from '../lib/energy';
import { t } from '../i18n/translations';

interface FileUploadProps {
  onLoad: (data: SpectrumData) => void;
  lang: Language;
  currentFile: string | null;
  onSettingsChange?: (patch: Partial<AnalysisSettings>) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLoad, lang, currentFile, onSettingsChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [selectedRegion, setSelectedRegion] = useState(0);

  const applyRegion = useCallback((parsed: ParsedFile, regionIdx: number, filename: string) => {
    const region = parsed.regions[regionIdx];
    const spectrum = regionToSpectrum(region, filename);
    onLoad(spectrum);

    // Auto-set source from file metadata
    if (region.excitationEnergy) {
      const src = resolveSource(region.excitationEnergy);
      if (src) {
        onSettingsChange?.({ source: src });
      }
    }
  }, [onLoad, onSettingsChange]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseFile(text, file.name);
        setParsedFile(parsed);
        setSelectedRegion(0);
        applyRegion(parsed, 0, file.name);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  }, [applyRegion]);

  const handleRegionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedRegion(idx);
    if (parsedFile) {
      const filename = currentFile?.split(' [')[0] || 'uploaded';
      applyRegion(parsedFile, idx, filename);
    }
  }, [parsedFile, currentFile, applyRegion]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const loadSample = useCallback(async (name: string) => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const resp = await fetch(`${base}samples/${name}`);
      const text = await resp.text();
      const parsed = parseCSV(text, name);
      setParsedFile(parsed);
      setSelectedRegion(0);
      const spectrum = regionToSpectrum(parsed.regions[0], name);
      onLoad(spectrum);
    } catch (err) {
      alert(`Failed to load sample: ${err}`);
    }
  }, [onLoad]);

  return (
    <div className="file-upload">
      <div
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv,.npl,.vms"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        <div className="drop-icon">{'\uD83D\uDCC2'}</div>
        <div className="drop-text">{t('dropZone', lang)}</div>
        {currentFile && (
          <div className="file-info">{'\u2713'} {t('fileLoaded', lang)}: {currentFile}</div>
        )}
      </div>
      {parsedFile && parsedFile.regions.length > 1 && (
        <div className="region-selector">
          <label className="slider-label">{t('regionSelect', lang)}</label>
          <select
            value={selectedRegion}
            onChange={handleRegionChange}
            className="source-select"
          >
            {parsedFile.regions.map((region, idx) => (
              <option key={idx} value={idx}>{region.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="sample-buttons">
        <span className="sample-label">{t('loadSample', lang)}:</span>
        <button onClick={() => {
          loadSample('tio2-wide.csv');
          onSettingsChange?.({ source: 'Al' });
        }}>{t('sampleTiO2', lang)}</button>
        <button onClick={() => {
          loadSample('au-si-haxpes.csv');
          onSettingsChange?.({ source: 'Ga' });
        }}>{t('sampleAuSiHAXPES', lang)}</button>
      </div>
    </div>
  );
};

export default FileUpload;
