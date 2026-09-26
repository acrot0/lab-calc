import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android wrapper around the same web build.
 *
 * ## What this is, and what it is not
 *
 * The app is already a PWA: installable, offline, no server. This adds nothing
 * to it. It exists so the app can be handed to someone as a `.apk` — a file
 * that installs from a download link, works on a phone whose browser has no
 * "add to home screen", and does not need the site to be up. The web app
 * remains the source of truth; the APK is a copy of it in a WebView.
 *
 * ## The settings that matter
 *
 * `webDir: 'dist'` is the same build output the PWA serves, so there is one
 * artefact and no second code path to keep in step. It must be built with
 * `--mode desktop` (single file, IIFE, no `import.meta`) for the same reason
 * the Electron build does: a WebView loading `capacitor://localhost` or
 * `file://` refuses module scripts, and a split bundle that fails on its first
 * dynamic `import()` renders a blank screen. The same packager guard applies.
 *
 * `androidScheme: 'https'` rather than the older `http`. Capacitor serves the
 * app from a local origin; `https` keeps the page a secure context, which
 * `localStorage` needs — and the app's whole history feature is `localStorage`.
 * On `http` the origin is treated as insecure and storage is refused.
 *
 * `allowMixedContent: false` and `webContentsDebuggingEnabled: false` are the
 * defaults and are stated rather than left implicit: this app makes no network
 * requests at all, so there is nothing to permit and no debugging surface worth
 * leaving open in a build handed to other people.
 */
const config: CapacitorConfig = {
  appId: 'com.labcalc.app',
  appName: 'Lab Calc',
  webDir: 'dist',
  android: {
    // A local https origin, so `localStorage` works. See above.
    androidScheme: 'https',
    allowMixedContent: false,
    // The app has no network calls; nothing to allow and no reason to open it.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
