import type { Language } from '../types';

const translations = {
  appTitle: { en: 'XPS Peak Assign', ja: 'XPS ピークアサイン' },
  appSubtitle: { en: 'Automatic Element Identification from Survey Spectra', ja: 'サーベイスペクトルからの自動元素同定' },
  // File Upload
  dropZone: { en: 'Drop file here or click to browse (CSV/NPL/VMS/TXT/PXT/IBW)', ja: 'ファイルをドロップまたはクリック (CSV/NPL/VMS/TXT/PXT/IBW)' },
  loadSample: { en: 'Load Sample', ja: 'サンプル読込' },
  sampleTiO2: { en: 'TiO2 Wide', ja: 'TiO2 Wide' },
  sampleAuSiHAXPES: { en: 'Au/Si (Ga Ka)', ja: 'Au/Si (Ga Ka)' },
  fileLoaded: { en: 'Loaded', ja: '読込済' },
  loadFailed: { en: 'Could not load', ja: '読み込めませんでした' },
  readFailed: { en: 'could not read the file', ja: 'ファイルを読めませんでした' },
  trySample: { en: 'Try a sample:', ja: 'サンプルで試す:' },
  emptyTitle: { en: 'Drop a survey spectrum to identify its elements', ja: 'サーベイスペクトルを読み込むと元素を同定します' },
  emptyBody: {
    en: 'Use the drop zone on the left (CSV, NPL, VAMAS, SES TXT, PXT, IBW), or start with a built-in sample. Everything runs in your browser; nothing is uploaded.',
    ja: '左のドロップ欄にファイル (CSV, NPL, VAMAS, SES TXT, PXT, IBW) を入れるか、内蔵サンプルから始められます。処理はすべてブラウザ内で行われ、データは送信されません。',
  },
  // Settings
  settings: { en: 'Settings', ja: '設定' },
  xraySource: { en: 'X-ray Source', ja: 'X線源' },
  tolerance: { en: 'Tolerance', ja: 'トレランス' },
  minConfidence: { en: 'Min Confidence', ja: '最低信頼度' },
  includeAuger: { en: 'Include Auger', ja: 'Auger含む' },
  chargingCorrection: { en: 'Charging Correction', ja: '帯電補正' },
  synchrotron: { en: 'Synchrotron', ja: 'シンクロトロン' },
  photonEnergy: { en: 'Photon Energy (eV)', ja: '光子エネルギー (eV)' },
  enterPhotonEnergy: { en: 'Enter photon energy', ja: '光子エネルギーを入力' },
  inputEnergy: { en: 'Input Data Unit', ja: '入力データの単位' },
  inputEnergyHint: {
    en: 'What the energy column of the loaded file represents. Changes the analysis.',
    ja: '読み込んだファイルのエネルギー列が何を表すか。解析結果が変わります。',
  },
  displayAxis: { en: 'Display Axis', ja: '表示軸' },
  displayAxisHint: {
    en: 'Which axis the chart shows. Does not change the analysis.',
    ja: 'グラフに表示する軸。解析結果は変わりません。',
  },
  energyAuto: { en: 'Auto', ja: '自動' },
  detectedAs: { en: 'detected:', ja: '検出:' },
  regionSelect: { en: 'Region', ja: 'リージョン' },
  // Chart
  spectrum: { en: 'Spectrum', ja: 'スペクトル' },
  rawSpectrum: { en: 'Raw', ja: '生データ' },
  backgroundLabel: { en: 'Background', ja: 'バックグラウンド' },
  signalLabel: { en: 'Signal', ja: '信号' },
  bindingEnergy: { en: 'Binding Energy (eV)', ja: '結合エネルギー (eV)' },
  kineticEnergy: { en: 'Kinetic Energy (eV)', ja: '運動エネルギー (eV)' },
  intensityLabel: { en: 'Intensity (arb.)', ja: '強度 (任意)' },
  // Results
  results: { en: 'Identification Results', ja: '同定結果' },
  element: { en: 'Element', ja: '元素' },
  confidence: { en: 'Confidence', ja: '信頼度' },
  confidenceLegend: {
    en: 'Green ≥ 80%, orange ≥ 50%, red below. Gray = single-line element: only one photoelectron line is available, so it cannot be cross-checked and its confidence is structurally low.',
    ja: '緑 ≥ 80%、橙 ≥ 50%、赤はそれ未満。灰色 = 単線元素: 光電子ラインが 1 本しかなく相互確認できないため、信頼度は構造的に低くなります。',
  },
  singleLine: { en: 'single line', ja: '単線' },
  singleLineHint: {
    en: 'Only one photoelectron line (e.g. C 1s, O 1s). A single line cannot be cross-checked against spin-orbit partners or other shells, so the confidence stays low even when the peak is clearly present.',
    ja: '光電子ラインが 1 本だけ (C 1s, O 1s など)。スピン軌道対や他の殻と照合できないため、ピークが明確でも信頼度は低いままです。',
  },
  promFloorHint: {
    en: 'Kept at the minimum confidence because one of its lines is among the strongest peaks in the spectrum.',
    ja: 'スペクトル中で最も強いピークの 1 つに一致しているため、最低信頼度に据え置かれています。',
  },
  matchedLines: { en: 'Matched Lines', ja: 'マッチしたライン' },
  scoring: { en: 'Scoring Detail', ja: 'スコア詳細' },
  why: { en: 'Why', ja: '根拠' },
  whyHint: { en: 'Show why this element got its confidence', ja: 'この信頼度になった理由を表示' },
  lineCol: { en: 'Line', ja: 'ライン' },
  dbBE: { en: 'Database BE (eV)', ja: 'DB 結合エネルギー (eV)' },
  detectedBE: { en: 'Detected BE (eV)', ja: '検出 BE (eV)' },
  rawScoring: { en: 'Raw scoring string', ja: '生のスコア文字列' },
  noResults: { en: 'No elements identified. Upload a spectrum to begin.', ja: '元素が同定されていません。スペクトルをアップロードしてください。' },
  noCandidates: {
    en: 'No element passed the confidence threshold. Try lowering Min Confidence or raising Tolerance, or check the input data unit.',
    ja: '信頼度のしきい値を超えた元素がありません。最低信頼度を下げる、トレランスを上げる、または入力データの単位を確認してください。',
  },
  chartHint: {
    en: 'Drag to zoom \u00B7 double-click to reset \u00B7 click a peak (or anywhere on the trace) to list candidate lines',
    ja: 'ドラッグでズーム \u00B7 ダブルクリックで戻す \u00B7 ピークや任意の位置をクリックすると候補ラインを表示',
  },
  charging: { en: 'Charging', ja: '帯電' },
  rejected: { en: 'Rejected', ja: '棄却' },
  // Footer
  poweredBy: { en: 'Powered by NIST binding energies & Yeh-Lindau cross-sections', ja: 'NIST 結合エネルギー & Yeh-Lindau 断面積データ使用' },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Language): string {
  return translations[key][lang];
}

export default translations;
