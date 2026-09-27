import React, { useState, useCallback } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import {
  initialUpdateState, reduceUpdate, updateMessageKey,
  canCheck, canInstall, canRelaunch, downloadFraction,
  runUpdateCheck, runUpdateInstall,
} from '../update.mjs';

/*
 * The update control in the settings panel.
 *
 * ## Why it is manual
 *
 * The user asked for an app that does not interrupt. A background poll that
 * announces a new version mid-titration is exactly that interruption, and it
 * is also a network request nobody asked for. So: one row in settings, and
 * nothing happens until it is pressed.
 *
 * ## Why the plugin is imported dynamically
 *
 * `@tauri-apps/plugin-updater` talks to an IPC bridge that does not exist on
 * the web. A static import would be evaluated when the web bundle loads this
 * module, and it would throw before the settings panel ever rendered — taking
 * the whole app down on a build that has no updater and never will.
 *
 * The import happens on the first press, inside the same `try` as the call, so
 * a failure to load is reported as an update failure rather than as an
 * unhandled rejection. `__TAURI_UPDATER__` is the build constant that says
 * whether to offer the control at all; see `vite.config.js` for why the mode
 * alone cannot answer that.
 */

/** Load the real updater bridge, or throw a code the panel can translate. */
async function loadUpdater() {
  const [updater, process] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/plugin-process'),
  ]);
  return { check: updater.check, relaunch: process.relaunch };
}

export default function UpdatePanel() {
  const { t } = useI18n();
  const [state, setState] = useState(() => initialUpdateState({
    // The build constant, not a runtime probe: on the web and in the Android
    // app there is no updater to call, and a button that cannot work is worse
    // than no button.
    supported: typeof __TAURI_UPDATER__ !== 'undefined' && __TAURI_UPDATER__,
  }));
  const [busy, setBusy] = useState(false);

  const onEvent = useCallback((next) => setState(next), []);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const updater = await loadUpdater();
      await runUpdateCheck({ updater, state, onEvent });
    } catch (e) {
      onEvent(reduceUpdate(state, { type: 'failed', code: 'unknown' }));
    } finally {
      setBusy(false);
    }
  }, [state, onEvent]);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const { check: checkFn } = await loadUpdater();
      const update = await checkFn();
      if (!update) {
        onEvent(reduceUpdate(state, { type: 'checkNone' }));
        return;
      }
      await runUpdateInstall({ update, state, onEvent });
    } catch (e) {
      onEvent(reduceUpdate(state, { type: 'failed', code: 'unknown' }));
    } finally {
      setBusy(false);
    }
  }, [state, onEvent]);

  const relaunch = useCallback(async () => {
    try {
      const { relaunch: relaunchFn } = await loadUpdater();
      await relaunchFn();
    } catch {
      // A failed relaunch leaves the new version installed and the old process
      // running. Saying so is more useful than a second error message, and the
      // user can close the window themselves.
      onEvent(reduceUpdate(state, { type: 'failed', code: 'permission' }));
    }
  }, [state, onEvent]);

  // Nothing to render on a build that cannot update itself.
  if (!state.supported) return null;

  const key = updateMessageKey(state);
  const fraction = downloadFraction(state);

  return (
    <div className="settings-block update-panel">
      <div className="update-row">
        <span className="settings-label">{t('update.title')}</span>
        <span className="settings-current">{t('update.version', { version: __APP_VERSION__ })}</span>
      </div>

      {key && (
        <p className={`update-msg${state.status === 'error' ? ' is-err' : ''}`} role="status">
          {state.status === 'available'
            ? t(key, { version: state.version })
            : t(key)}
        </p>
      )}

      {/*
        An indeterminate bar when the server sent no content length.
        A percentage invented from nothing is worse than a bar that says
        "working" — the user cannot tell a stuck download from a slow one
        either way, but at least this does not lie about how far along it is.
      */}
      {state.status === 'downloading' && (
        <div
          className={`update-bar${fraction === null ? ' is-indeterminate' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
        >
          <div className="update-bar-fill" style={fraction === null ? undefined : { width: `${fraction * 100}%` }} />
        </div>
      )}

      <div className="update-actions">
        {canCheck(state) && (
          <button type="button" className="link-btn" onClick={check} disabled={busy}>
            {state.status === 'error' ? t('update.retry') : t('update.check')}
          </button>
        )}
        {canInstall(state) && (
          <button type="button" className="link-btn update-install" onClick={install} disabled={busy}>
            <Icons.download size={ICON_SIZE.inline} aria-hidden="true" />
            {t('update.install')}
          </button>
        )}
        {canRelaunch(state) && (
          <button type="button" className="link-btn update-install" onClick={relaunch}>
            {t('update.relaunch')}
          </button>
        )}
      </div>
    </div>
  );
}
