import { useCallback, useRef } from 'react';
import type { Language, SpectrumData } from '../types';
import { parseCSV } from '../lib/parsers';
import { t } from '../i18n/translations';

interface FileUploadProps {
  onLoad: (data: SpectrumData) => void;
  lang: Language;
  currentFile: string | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLoad, lang, currentFile }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = parseCSV(text, file.name);
        onLoad(data);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  }, [onLoad]);

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
      const data = parseCSV(text, name);
      onLoad(data);
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
          accept=".csv,.txt,.tsv"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        <div className="drop-icon">📂</div>
        <div className="drop-text">{t('dropZone', lang)}</div>
        {currentFile && (
          <div className="file-info">✓ {t('fileLoaded', lang)}: {currentFile}</div>
        )}
      </div>
      <div className="sample-buttons">
        <span className="sample-label">{t('loadSample', lang)}:</span>
        <button onClick={() => loadSample('tio2-wide.csv')}>{t('sampleTiO2', lang)}</button>
        <button onClick={() => loadSample('alf3-wide.csv')}>{t('sampleAlF3', lang)}</button>
      </div>
    </div>
  );
};

export default FileUpload;
