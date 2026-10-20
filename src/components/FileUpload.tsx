import { useCallback, useRef, useState } from 'react';
import type { AnalysisSettings, Language, SpectrumData } from '../types';
import { parseFile, regionToSpectrum } from '../lib/parsers';
import { SAMPLES, fetchSample } from '../lib/samples';
import type { SampleDef } from '../lib/samples';
import { parsePXT } from '../lib/pxt-parser';
import type { ParsedFile } from '../lib/parsers';
import { resolveSource } from '../lib/energy';
import { t } from '../i18n/translations';

const BINARY_EXTENSIONS = new Set(['pxt', 'ibw']);

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
  // Shown under the drop zone instead of a blocking alert(); cleared on the next successful load
  const [error, setError] = useState<string | null>(null);

  const applyRegion = useCallback((parsed: ParsedFile, regionIdx: number, filename: string) => {
    const region = parsed.regions[regionIdx];
    const spectrum = regionToSpectrum(region, filename);
    onLoad(spectrum);
    setError(null);

    // Auto-set source from file metadata
    if (region.excitationEnergy) {
      const src = resolveSource(region.excitationEnergy);
      if (src) {
        onSettingsChange?.({ source: src });
      }
    }
  }, [onLoad, onSettingsChange]);

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isBinary = BINARY_EXTENSIONS.has(ext);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let parsed: ParsedFile;
        if (isBinary) {
          const buf = e.target?.result as ArrayBuffer;
          parsed = parsePXT(buf, file.name);
        } else {
          const text = e.target?.result as string;
          parsed = parseFile(text, file.name);
        }
        setParsedFile(parsed);
        setSelectedRegion(0);
        applyRegion(parsed, 0, file.name);
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.onerror = () => setError(`${file.name}: ${t('readFailed', lang)}`);
    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, [applyRegion, lang]);

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

  const loadSample = useCallback(async (sample: SampleDef) => {
    try {
      const parsed = await fetchSample(sample);
      setParsedFile(parsed);
      setSelectedRegion(0);
      onLoad(regionToSpectrum(parsed.regions[0], sample.file));
      onSettingsChange?.({ source: sample.source });
      setError(null);
    } catch (err) {
      setError(`${t('loadFailed', lang)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [onLoad, onSettingsChange, lang]);

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
          accept=".csv,.txt,.tsv,.npl,.vms,.pxt,.ibw"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        <div className="drop-icon">{'\uD83D\uDCC2'}</div>
        <div className="drop-text">{t('dropZone', lang)}</div>
        {currentFile && (
          <div className="file-info">{'\u2713'} {t('fileLoaded', lang)}: {currentFile}</div>
        )}
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {'\u26A0'} {error}
          <button className="inline-error-close" onClick={() => setError(null)} aria-label="dismiss">{'\u00D7'}</button>
        </div>
      )}
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
        {SAMPLES.map(s => (
          <button key={s.file} onClick={() => loadSample(s)}>{t(s.labelKey, lang)}</button>
        ))}
      </div>
    </div>
  );
};

export default FileUpload;
