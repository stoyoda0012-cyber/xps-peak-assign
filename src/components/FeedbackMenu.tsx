import { useEffect, useRef, useState } from 'react';
import type { Language } from '../types';
import { t } from '../i18n/translations';
import { buildFeedbackBody, buildFormUrl, buildIssueUrl } from '../lib/feedback';
import type { FeedbackContext } from '../lib/feedback';

interface FeedbackMenuProps {
  lang: Language;
  context: FeedbackContext;
}

/**
 * Header button that opens a small popover with the ways to send feedback:
 * a pre-filled Google Form (no account needed; primary), a pre-filled GitHub
 * issue (needs an account), and "copy the message" for e-mail or chat.
 * No backend involved.
 */
export const FeedbackMenu: React.FC<FeedbackMenuProps> = ({ lang, context }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const formUrl = buildFormUrl(context);

  const copyBody = async () => {
    const text = buildFeedbackBody(context);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context): fall back to a prompt the user can copy from
      window.prompt(t('feedbackCopyFallback', lang), text);
    }
  };

  return (
    <div className="feedback-menu" ref={rootRef}>
      <button
        className={'feedback-button' + (open ? ' open' : '')}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {t('feedback', lang)}
      </button>
      {open && (
        <div className="feedback-popover" role="dialog" aria-label={t('feedbackTitle', lang)}>
          <div className="feedback-title">{t('feedbackTitle', lang)}</div>
          <p className="feedback-intro">{t('feedbackIntro', lang)}</p>
          {formUrl && (
            <a
              className="feedback-action primary"
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              {t('feedbackForm', lang)}
              <span className="feedback-sub">{t('feedbackFormSub', lang)}</span>
            </a>
          )}
          <a
            className={'feedback-action' + (formUrl ? '' : ' primary')}
            href={buildIssueUrl(context)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            {t('feedbackGitHub', lang)}
            <span className="feedback-sub">{t('feedbackGitHubSub', lang)}</span>
          </a>
          <button className="feedback-action" onClick={copyBody}>
            {copied ? t('feedbackCopied', lang) : t('feedbackCopy', lang)}
            <span className="feedback-sub">{t('feedbackCopySub', lang)}</span>
          </button>
          <p className="feedback-privacy">{t('feedbackPrivacy', lang)}</p>
        </div>
      )}
    </div>
  );
};

export default FeedbackMenu;
