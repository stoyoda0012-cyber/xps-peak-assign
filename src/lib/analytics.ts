/**
 * Page-view and event counting via GoatCounter (https://www.goatcounter.com):
 * no cookies, no personal identifiers, nothing stored in the browser. The
 * script tag in index.html counts page views; this helper counts a handful of
 * coarse events so we know how many visitors actually reach an analysis.
 *
 * Never pass file names, spectrum data or anything typed by the person.
 */

export const GOATCOUNTER_ENDPOINT = 'https://xps-peak-assign.goatcounter.com/count';

/** The events we count. Keep this list short and free of personal data. */
export type AnalyticsEvent =
  | `sample-loaded/${string}`   // bundled sample file name
  | `file-loaded/${string}`     // file extension only (csv, pxt, ...)
  | 'feedback-opened'
  | 'method-opened';

interface GoatCounter {
  count: (vars: { path: string; title?: string; event?: boolean }) => void;
}

declare global {
  interface Window { goatcounter?: GoatCounter }
}

/** Count an event. Silently does nothing when the script is blocked or not loaded. */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const gc = window.goatcounter;
  if (!gc || typeof gc.count !== 'function') return;
  try {
    gc.count({ path: event, event: true });
  } catch {
    // never let analytics break the app
  }
}

/** "file-loaded/csv" from a file name; unknown or missing extension becomes "other". */
export function fileLoadedEvent(fileName: string): AnalyticsEvent {
  const m = /\.([a-z0-9]{1,5})$/i.exec(fileName);
  const ext = m ? m[1].toLowerCase() : 'other';
  return `file-loaded/${ext}`;
}
