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
  energyAxis: { en: 'Energy Axis', ja: 'エネルギー軸' },
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
  matchedLines: { en: 'Matched Lines', ja: 'マッチしたライン' },
  scoring: { en: 'Scoring Detail', ja: 'スコア詳細' },
  noResults: { en: 'No elements identified. Upload a spectrum to begin.', ja: '元素が同定されていません。スペクトルをアップロードしてください。' },
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
