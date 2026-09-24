import React, { useEffect, useRef } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { DISCLAIMER_POINTS } from '../disclaimer.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * The educational-use notice.
 *
 * Rendered as a modal on first visit so it cannot be scrolled past, and
 * reopenable from the footer afterwards. Focus is moved into the dialog on open
 * and Escape closes it — a dialog that traps a keyboard user is worse than no
 * dialog, and a dialog that closes on a stray backdrop click loses the
 * acknowledgement the user was trying to give.
 */
export default function NoticeModal({ open, onAcknowledge, onClose, mustAcknowledge }) {
  const { t, locale } = useI18n();
  const primaryRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e) => {
      // First-run has no close affordance, so Escape must not dismiss it —
      // otherwise the notice is trivially skippable and means nothing.
      if (e.key === 'Escape' && !mustAcknowledge) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, mustAcknowledge]);

  if (!open) return null;

  const isZh = locale === 'zh';

  return (
    <div className="scrim" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
      >
        <div className="modal-head">
          <ShieldAlert size={20} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <div>
            <h2 id="notice-title">{t('disclaimer.title')}</h2>
            <p>{t('disclaimer.subtitle')}</p>
          </div>
        </div>

        <div className="modal-body">
          {DISCLAIMER_POINTS.map((p, i) => (
            <div className="notice-point" key={i}>
              <span className="mark" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{isZh ? p.titleZh : p.titleEn}</h3>
                <p>{isZh ? p.zh : p.en}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <span className="note">{t('disclaimer.ackNote')}</span>
          <div style={{ display: 'flex', gap: 'var(--s2)' }}>
            {!mustAcknowledge && (
              <button className="control" onClick={onClose}>
                <X size={14} aria-hidden="true" />
                {t('disclaimer.close')}
              </button>
            )}
            <button className="primary" ref={primaryRef} onClick={onAcknowledge}>
              <Check size={15} aria-hidden="true" />
              {t('disclaimer.ack')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
