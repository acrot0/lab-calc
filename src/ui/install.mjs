/**
 * Install guidance.
 *
 * A PWA is installable but says nothing about it. Chrome buries the entry in a
 * menu; iOS Safari has no menu item at all and requires Share → Add to Home
 * Screen, which is not discoverable and is the single most common reason a
 * perfectly good web app never gets installed on an iPhone. So the app has to
 * ask, and it has to ask differently per platform.
 *
 * Three states, and the difference between them is the whole point:
 *
 *   - `prompt`  Chromium fired `beforeinstallprompt`. We hold the event and can
 *               show the real, native install dialog on a click.
 *   - `manual`  iOS/iPadOS, which never fires that event. The only path is a
 *               written instruction, so the UI has to show the steps.
 *   - `none`    Already installed, or a desktop browser that offers no install.
 *
 * All of this is pure and takes its environment, so it can be tested without a
 * browser — and so the platform sniffing, which is the part that rots as
 * browsers change, is in one readable place.
 */

/** iPadOS 13+ reports itself as a Mac; the touch points are what give it away. */
export function isIos(ua = '', maxTouchPoints = 0) {
  return /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** Already running as an installed app — no point offering to install it. */
export function isStandalone(win) {
  if (!win) return false;
  // `navigator.standalone` is the iOS-only legacy flag; the media query is the
  // standard one and is what Chromium and modern Safari answer.
  if (win.navigator?.standalone === true) return true;
  try {
    return win.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Which guidance to show.
 *
 * @param {object} opts
 * @param {boolean} opts.canPrompt   A held `beforeinstallprompt` is available
 * @param {boolean} opts.standalone  Already installed
 * @param {boolean} opts.ios         iOS or iPadOS
 * @param {boolean} opts.dismissed   The user said no before
 * @returns {'prompt'|'manual'|'none'}
 */
export function installMode({ canPrompt, standalone, ios, dismissed }) {
  // Never nag: a dismissal is remembered, and the offer does not come back.
  if (dismissed || standalone) return 'none';
  if (canPrompt) return 'prompt';
  if (ios) return 'manual';
  return 'none';
}

/**
 * Wire the browser's install events.
 *
 * `beforeinstallprompt` must be captured and its default prevented, or Chromium
 * shows its own mini-infobar and the event is gone — the deferred prompt can
 * only be used once, and only if it was held.
 *
 * @returns {{ stop: () => void }}
 */
export function watchInstall({ win, onAvailable, onInstalled }) {
  const target = win ?? globalThis;
  let held = null;

  const onPrompt = (e) => {
    e.preventDefault();
    held = e;
    onAvailable?.(e);
  };
  const onDone = () => { held = null; onInstalled?.(); };

  target.addEventListener?.('beforeinstallprompt', onPrompt);
  target.addEventListener?.('appinstalled', onDone);

  return {
    /** Show the native dialog. Returns whether the user accepted. */
    async prompt() {
      if (!held) return false;
      held.prompt();
      const { outcome } = await held.userChoice;
      // The event is single-use whichever way it went; Chromium will fire a
      // fresh one if the user later becomes eligible again.
      held = null;
      return outcome === 'accepted';
    },
    stop: () => {
      target.removeEventListener?.('beforeinstallprompt', onPrompt);
      target.removeEventListener?.('appinstalled', onDone);
    },
  };
}
