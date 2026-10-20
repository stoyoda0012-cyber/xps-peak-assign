import { describe, expect, it } from 'vitest';
import { buildFeedbackBody, buildFormUrl, buildIssueUrl, FEEDBACK_FORM, REPO_URL } from '../lib/feedback';
import type { FeedbackContext } from '../lib/feedback';
import type { IdentificationResult } from '../types';

const result: IdentificationResult = {
  elements: ['Ti', 'O'],
  confidences: { Ti: 1, O: 0.3 },
  candidates: [
    { element: 'Ti', confidence: 1, rawScore: 35, matchedLines: [], detail: '' },
    { element: 'O', confidence: 0.3, rawScore: 4, matchedLines: [], detail: 'prom_floor' },
  ],
  detectedPeaks: [{ position: 458.5, height: 1, prominence: 1, fwhmEstimate: 1, index: 0 }],
  signal: [1, 2, 3, 4, 5],
  background: [0, 0, 0, 0, 0],
  rejected: [{ element: 'Na', confidence: 0.1, rawScore: 1, matchedLines: [], detail: '' }],
  chargingEV: 5.6,
};

const ctx: FeedbackContext = {
  lang: 'en',
  theme: 'light',
  settings: {
    source: 'Al', toleranceEV: 3, minConfidence: 0.3, bgMethod: 'shirley',
    includeAuger: true, chargingCorrection: true, inputEnergyType: 'auto', displayEnergy: 'BE',
  },
  fileName: 'tio2-wide.csv',
  result,
};

describe('buildFeedbackBody', () => {
  it('includes the settings, file name and element summary', () => {
    const body = buildFeedbackBody(ctx);
    expect(body).toContain('X-ray source: Al');
    expect(body).toContain('Tolerance: 3 eV, Min confidence: 0.3');
    expect(body).toContain('File: tio2-wide.csv');
    expect(body).toContain('Accepted: Ti 100%, O 30%');
    expect(body).toContain('Rejected: 1, Charging: 5.6 eV, Peaks: 1');
  });

  it('never includes spectrum data points', () => {
    const body = buildFeedbackBody(ctx);
    expect(body).not.toContain('458.5');
    expect(body).not.toMatch(/\[1, ?2, ?3/);
  });

  it('names the synchrotron photon energy when that source is selected', () => {
    const body = buildFeedbackBody({
      ...ctx,
      settings: { ...ctx.settings, source: 'Synchrotron', customEnergy: 7940 },
    });
    expect(body).toContain('X-ray source: Synchrotron 7940 eV');
  });

  it('uses the Japanese template for ja', () => {
    expect(buildFeedbackBody({ ...ctx, lang: 'ja' })).toContain('## 環境（自動入力）');
  });

  it('copes with no spectrum loaded', () => {
    expect(buildFeedbackBody({ ...ctx, fileName: null, result: null })).toContain('(no spectrum loaded)');
  });
});

describe('buildIssueUrl', () => {
  it('points at the repository with a feedback label and stays short enough for a URL', () => {
    const url = buildIssueUrl(ctx);
    expect(url.startsWith(`${REPO_URL}/issues/new?labels=feedback&title=`)).toBe(true);
    expect(decodeURIComponent(url)).toContain('[feedback] ');
    expect(url.length).toBeLessThan(6000);
  });
});

describe('buildFormUrl', () => {
  it('opens the Google Form with only the environment field pre-filled', () => {
    const url = new URL(buildFormUrl(ctx));
    expect(url.origin + url.pathname).toBe(FEEDBACK_FORM.url);
    expect(url.searchParams.get('usp')).toBe('pp_url');
    const env = url.searchParams.get(FEEDBACK_FORM.entries.environment)!;
    expect(env).toContain('## Environment (auto-filled)');
    expect(env).toContain('File: tio2-wide.csv');
    expect(env).toContain('Accepted: Ti 100%, O 30%');
    expect(env).not.toContain('## What');                      // template stays out of the form
    expect(url.searchParams.has(FEEDBACK_FORM.entries.content)).toBe(false);
    expect(url.searchParams.has(FEEDBACK_FORM.entries.contact)).toBe(false);
    expect(url.href.length).toBeLessThan(4000);
  });
});
