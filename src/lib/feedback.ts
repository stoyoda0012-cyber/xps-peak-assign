import type { AnalysisSettings, IdentificationResult, Language } from '../types';

export const REPO_URL = 'https://github.com/stoyoda0012-cyber/xps-peak-assign';

/**
 * Optional form for people without a GitHub account (e.g. a Google Form).
 * Leave empty to hide the "send via form" link.
 */
export const FEEDBACK_FORM_URL = '';

/** Everything the feedback body is built from. No spectrum data is included. */
export interface FeedbackContext {
  lang: Language;
  theme: string;
  settings: AnalysisSettings;
  /** Name of the loaded file (not its contents) */
  fileName: string | null;
  result: IdentificationResult | null;
}

/** App version, injected by vite.config.ts from package.json (declared in vite-env.d.ts). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function settingsLines(s: AnalysisSettings): string[] {
  const src = s.source === 'Synchrotron' && s.customEnergy ? `Synchrotron ${s.customEnergy} eV` : s.source;
  return [
    `- X-ray source: ${src}`,
    `- Tolerance: ${s.toleranceEV} eV, Min confidence: ${s.minConfidence}`,
    `- Auger: ${s.includeAuger ? 'on' : 'off'}, Charging correction: ${s.chargingCorrection ? 'on' : 'off'}`,
    `- Input data unit: ${s.inputEnergyType}, Display axis: ${s.displayEnergy}`,
  ];
}

function resultLines(r: IdentificationResult | null): string[] {
  if (!r) return ['- (no spectrum loaded)'];
  const top = r.candidates.slice(0, 8).map(c => `${c.element} ${(c.confidence * 100).toFixed(0)}%`).join(', ');
  return [
    `- Accepted: ${top || '(none)'}${r.candidates.length > 8 ? ', …' : ''}`,
    `- Rejected: ${r.rejected.length}, Charging: ${r.chargingEV.toFixed(1)} eV, Peaks: ${r.detectedPeaks.length}`,
  ];
}

/**
 * Body of the feedback message: a template for the person to fill in, followed
 * by the environment and the current analysis state so a bug can be reproduced.
 * Only the file name and the element list are included, never the data points.
 */
export function buildFeedbackBody(ctx: FeedbackContext): string {
  const ja = ctx.lang === 'ja';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const href = typeof location !== 'undefined' ? location.href : '';
  const template = ja
    ? [
        '## 内容',
        '（要望・不具合・質問など、自由にお書きください）',
        '',
        '## 期待した動作 / 実際の動作',
        '',
        '',
      ]
    : [
        '## What',
        '(request, bug, question — anything)',
        '',
        '## Expected / actual behaviour',
        '',
        '',
      ];
  const env = [
    ja ? '## 環境（自動入力）' : '## Environment (auto-filled)',
    `- App: xps-peak-assign ${APP_VERSION} (${href})`,
    `- Browser: ${ua}`,
    `- UI: ${ctx.lang} / ${ctx.theme}`,
    ...settingsLines(ctx.settings),
    `- File: ${ctx.fileName ?? '(none)'}`,
    ...resultLines(ctx.result),
  ];
  return [...template, ...env].join('\n');
}

/** Pre-filled "New issue" page on GitHub. Needs a GitHub account to submit. */
export function buildIssueUrl(ctx: FeedbackContext): string {
  const title = ctx.lang === 'ja' ? '[フィードバック] ' : '[feedback] ';
  const body = buildFeedbackBody(ctx);
  return `${REPO_URL}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
