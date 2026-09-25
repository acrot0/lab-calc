import React, { useEffect, useRef, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { installMode, isIos, isStandalone, watchInstall } from '../install.mjs';

/**
 * Offers to install the app.
 *
 * Rendered in the footer rather than as a modal, and dismissed permanently on
 * request. An install prompt that reappears after being declined is a nag, and
 * the value here — offline access on a bench with bad wifi — is real but not
 * urgent enough to interrupt anyone over.
 *
 * The dismissal is stored under its own key rather than reusing the disclaimer
 * store, so clearing one does not resurrect the other.
 */
const DISMISS_KEY = 'lab-calc.installDismissed.v1';

function readDismissed() {
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private mode, or storage disabled. Treat as dismissed: the prompt is a
    // convenience, and a user whose storage does not work should not be shown
    // something they cannot permanently dismiss.
    return true;
  }
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const apiRef = useRef(null);

  const ios = isIos(globalThis.navigator?.userAgent ?? '', globalThis.navigator?.maxTouchPoints ?? 0);
  const standalone = isStandalone(globalThis);

  useEffect(() => {
    const api = watchInstall({
      win: globalThis,
      onAvailable: () => setAvailable(true),
      onInstalled: () => setAvailable(false),
    });
    apiRef.current = api;
    return api.stop;
  }, []);

  const mode = installMode({ canPrompt: available, standalone, ios, dismissed });
  if (mode === 'none') return null;

  const onInstall = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const accepted = await apiRef.current.prompt();
      setNotice(accepted ? t('install.accepted') : t('install.dismissed'));
      if (accepted) setAvailable(false);
    } catch {
      // The held event can go stale (a browser update, a spent event). Telling
      // the user it failed is better than a button that appears to do nothing.
      setNotice(t('install.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = () => {
    setDismissed(true);
    try {
      globalThis.localStorage?.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage unavailable: the prompt is hidden for this session only, which
      // is the best that can be done and is not worth an error.
    }
  };

  return (
    <div className="install-prompt" role="complementary" aria-label={t('install.title')}>
      <Icons.download size={ICON_SIZE.control} aria-hidden="true" />
      <div className="install-text">
        <strong>{t('install.title')}</strong>
        <span>
          {mode === 'manual'
            ? (ios ? t('install.iosSteps') : t('install.iosStepsChrome'))
            : t('install.lead')}
        </span>
        {notice && <span className="install-notice">{notice}</span>}
      </div>
      <div className="install-actions">
        {mode === 'prompt' && (
          <button className="primary" type="button" onClick={onInstall} disabled={busy}>
            <Icons.download size={ICON_SIZE.control} aria-hidden="true" />
            {busy ? t('install.installing') : t('install.prompt')}
          </button>
        )}
        <button className="control" type="button" onClick={onDismiss}>
          {t('install.later')}
        </button>
      </div>
    </div>
  );
}
