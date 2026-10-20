import type { AnalysisSettings, IdentificationResult, Language } from '../types';

export const REPO_URL = 'https://github.com/stoyoda0012-cyber/xps-peak-assign';

/**
 * Google Form for people without a GitHub account. No sign-in is required
 * (the form collects no e-mail and does not limit responses per account).
 * `entries` are the form's question IDs, used to pre-fill the environment
 * block; find them with "フォームに事前入力する" / "Get pre-filled link" in the
 * form editor if the questions are ever recreated. Set `url` to '' to hide
 * the form option.
 */
export const FEEDBACK_FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSetw20Q9RGrW6vZA2d8uuG7zfYXDj-puH8JyiVTp-ofdv2PuA/viewform',
  entries: {
    /** 内容 (required; left for the person to write) */
    content: 'entry.298926878',
    /** お名前・連絡先（任意） */
    contact: 'entry.1075615977',
    /** 環境情報: pre-filled with the environment block */
    environment: 'entry.859694258',
  },
} as const;

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

/** The auto-filled environment block alone (no template), for the form's environment field. */
export function buildEnvironmentBlock(ctx: FeedbackContext): string {
  const ja = ctx.lang === 'ja';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const href = typeof location !== 'undefined' ? location.href : '';
  return [
    ja ? '## 環境（自動入力）' : '## Environment (auto-filled)',
    `- App: xps-peak-assign ${APP_VERSION} (${href})`,
    `- Browser: ${ua}`,
    `- UI: ${ctx.lang} / ${ctx.theme}`,
    ...settingsLines(ctx.settings),
    `- File: ${ctx.fileName ?? '(none)'}`,
    ...resultLines(ctx.result),
  ].join('\n');
}

/**
 * Body of the feedback message: a template for the person to fill in, followed
 * by the environment and the current analysis state so a bug can be reproduced.
 * Only the file name and the element list are included, never the data points.
 */
export function buildFeedbackBody(ctx: FeedbackContext): string {
  const ja = ctx.lang === 'ja';
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
  return [...template, buildEnvironmentBlock(ctx)].join('\n');
}

/**
 * The Google Form with the environment field pre-filled (usp=pp_url is what
 * the form editor's "Get pre-filled link" produces). Empty when no form is
 * configured.
 */
export function buildFormUrl(ctx: FeedbackContext): string {
  if (!FEEDBACK_FORM.url) return '';
  const params = new URLSearchParams();
  params.set('usp', 'pp_url');
  params.set(FEEDBACK_FORM.entries.environment, buildEnvironmentBlock(ctx));
  return `${FEEDBACK_FORM.url}?${params.toString()}`;
}

/** Pre-filled "New issue" page on GitHub. Needs a GitHub account to submit. */
export function buildIssueUrl(ctx: FeedbackContext): string {
  const title = ctx.lang === 'ja' ? '[フィードバック] ' : '[feedback] ';
  const body = buildFeedbackBody(ctx);
  return `${REPO_URL}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
