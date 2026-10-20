import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileLoadedEvent, trackEvent } from '../lib/analytics';

describe('analytics', () => {
  afterEach(() => {
    // vitest runs in Node: emulate a browser window per test
    delete (globalThis as { window?: unknown }).window;
  });

  it('does nothing without the GoatCounter script', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => trackEvent('feedback-opened')).not.toThrow();
  });

  it('counts an event through goatcounter.count', () => {
    const count = vi.fn();
    (globalThis as { window?: unknown }).window = { goatcounter: { count } };
    trackEvent('method-opened');
    expect(count).toHaveBeenCalledWith({ path: 'method-opened', event: true });
  });

  it('swallows errors thrown by the counter', () => {
    (globalThis as { window?: unknown }).window = { goatcounter: { count: () => { throw new Error('boom'); } } };
    expect(() => trackEvent('feedback-opened')).not.toThrow();
  });

  it('reduces a file name to its extension only', () => {
    expect(fileLoadedEvent('20260807_HfO24nm_2deg_0001.pxt')).toBe('file-loaded/pxt');
    expect(fileLoadedEvent('sample.CSV')).toBe('file-loaded/csv');
    expect(fileLoadedEvent('noextension')).toBe('file-loaded/other');
  });
});
