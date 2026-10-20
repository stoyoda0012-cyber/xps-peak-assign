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
  explainWhat: { en: 'Check', ja: '項目' },
  explainFound: { en: 'Finding', ja: '結果' },
  explainEffect: { en: 'Effect', ja: '効果' },
  scoreTotal: { en: 'Score', ja: 'スコア' },
  scoreTop: { en: 'top score', ja: '最上位' },
  scoreFloored: { en: 'raised to the minimum confidence', ja: '最低信頼度まで引き上げ' },
  methodLink: { en: 'How is this computed? \u2192', ja: '計算方法を見る \u2192' },
  methodTitle: { en: 'How it works', ja: '仕組みと計算の根拠' },
  howItWorks: { en: 'How it works', ja: '仕組み' },
  showRaw: { en: 'Developer: show raw scoring string', ja: '開発者向け: 生のスコア文字列を表示' },
  showRawHint: {
    en: 'Adds the internal scoring string (pos=..., SO(...)=...) to the Why panel. Useful when reporting a bug.',
    ja: '根拠パネルに内部のスコア文字列 (pos=..., SO(...)=...) を追加します。不具合報告のときに役立ちます。',
  },
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
  // Narrow-scan notice
  narrowTitle: {
    en: 'This is a narrow scan ({span} eV wide), not a survey',
    ja: 'これは幅 {span} eV の狭域スキャンで、サーベイではありません',
  },
  narrowBody: {
    en: 'Element identification is designed for survey spectra. In a window this narrow there are no spin-orbit partners, other shells or Auger lines to cross-check, so every candidate below is a single line and its ranking only reflects how close the peak is to the tabulated value. Treat the confidences as "which table lines are nearby", not as evidence. The table lines near each detected peak are listed here; a multi-region PXT is analysed one region at a time.',
    ja: '元素同定はサーベイスペクトル向けです。この幅ではスピン軌道対・他の殻・Auger ラインによる相互確認ができないため、下の候補はすべて 1 本一致で、順位は「表の値にどれだけ近いか」しか表していません。信頼度は「近くにある表のライン」程度の意味で、根拠ではありません。参考として、検出した各ピーク付近にある表のラインを示します。複数領域の PXT は領域ごとに別々に解析されます。',
  },
  narrowPeak: { en: 'Detected peak', ja: '検出ピーク' },
  narrowLines: { en: 'Table lines within tolerance (Δ to the table value · cross-section relative to the strongest line of the table)', ja: '許容幅内の表のライン（表の値からのずれ · 断面積は表の最強ラインに対する比）' },
  narrowNoLine: { en: 'no table line within tolerance', ja: '許容幅内に表のラインなし' },
  narrowFoot: {
    en: 'For a full identification, load a survey (several hundred eV) of the same sample; it can be compared against the narrow scan afterwards.',
    ja: '本格的な同定には、同じ試料のサーベイ（数百 eV 幅）を読み込んでください。その結果と狭域スキャンを突き合わせる使い方が確実です。',
  },
  // Feedback
  feedback: { en: 'Feedback', ja: 'フィードバック' },
  feedbackTitle: { en: 'Send feedback', ja: '要望・不具合を送る' },
  feedbackIntro: {
    en: 'Requests, bugs and questions are all welcome. The message is pre-filled with your settings and the current result so problems can be reproduced.',
    ja: '要望・不具合・質問、何でもどうぞ。再現できるよう、設定と現在の結果が本文に自動で入ります。',
  },
  feedbackGitHub: { en: 'Open a GitHub issue', ja: 'GitHub の Issue を開く' },
  feedbackGitHubSub: { en: 'needs a GitHub account; opens in a new tab', ja: 'GitHub アカウントが必要。新しいタブで開きます' },
  feedbackForm: { en: 'Send via Google Form', ja: 'Google フォームで送る' },
  feedbackFormSub: { en: 'no account needed; the environment field is pre-filled', ja: 'アカウント不要。環境情報は自動で入ります' },
  feedbackCopy: { en: 'Copy the message', ja: '本文をコピー' },
  feedbackCopied: { en: 'Copied!', ja: 'コピーしました' },
  feedbackCopySub: { en: 'paste it into an e-mail or chat', ja: 'メールやチャットに貼り付けてください' },
  feedbackCopyFallback: { en: 'Copy this text:', ja: 'この文章をコピーしてください:' },
  feedbackPrivacy: {
    en: 'Included: app version, browser, settings, file name, element list. Not included: the spectrum data itself.',
    ja: '含まれる情報: アプリの版、ブラウザ、設定、ファイル名、元素の一覧。スペクトルのデータ自体は含まれません。',
  },
  // Footer
  poweredBy: {
    en: 'Binding energies: standard core-level table \u00B7 Cross-sections: Yeh & Lindau (Al K\u03B1), Scofield (Ga K\u03B1)',
    ja: '結合エネルギー: 標準内殻準位表 \u00B7 断面積: Yeh & Lindau (Al K\u03B1), Scofield (Ga K\u03B1)',
  },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Language): string {
  return translations[key][lang];
}

export default translations;
