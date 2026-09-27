import React from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Two typefaces, each with a job.
 *
 * `wght.css` rather than `index.css`: the variable build ships one file per
 * axis and `index.css` pulls in every axis the family has. Only weight is used
 * here, so the axes nobody asked for would be bytes on every load.
 *
 * Geist for the interface and the headings, JetBrains Mono for anything
 * numeric. The split is not decoration — it is the same division a technical
 * document makes: a face for the words that carry identity and information,
 * and a monospaced face wherever digits must line up in a column.
 *
 * There were three until recently. Instrument Serif held the headings, and it
 * was a Latin-only face asked to render two Chinese ones — so those two fell
 * through to the system serif and the app had two display faces it never
 * chose. The full reasoning is on `--font-display` in `styles.css`. Both
 * remaining faces are OFL-1.1, so the licence check passes unchanged.
 *
 * Chinese is deliberately NOT loaded: a CJK webfont is several megabytes, and
 * the system fallbacks (PingFang SC, Microsoft YaHei) are already on every
 * machine that would read it. Measured before choosing: Noto Serif SC pulls
 * 500 KB of subset files for the fourteen characters in the drawer title,
 * because a CJK face cannot be subset per-glyph the way a Latin one can.
 *
 * A face whose import outlives its last rule is invisible in review and
 * permanent in the bundle — Space Grotesk did that, and then Instrument Serif
 * did it. Check that a removal also removed the import.
 */
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles.css';
import App from './App.jsx';
import { LocaleProvider } from './LocaleContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { MaterialProvider } from './MaterialContext.jsx';
import { IconStyleProvider } from './IconStyleContext.jsx';
import { DensityProvider } from './DensityContext.jsx';
import { resolveStore } from './history.mjs';

// The locale store and the history store are the same localStorage; resolving
// it once keeps the "storage unavailable" fallback consistent between them.
const store = resolveStore();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleProvider store={store}>
      <ThemeProvider store={store}>
        <MaterialProvider store={store}>
          <IconStyleProvider store={store}>
            <DensityProvider store={store}>
              <App />
            </DensityProvider>
          </IconStyleProvider>
        </MaterialProvider>
      </ThemeProvider>
    </LocaleProvider>
  </React.StrictMode>,
);

// Register the service worker so the app keeps working without a network.
// Guarded on `serviceWorker in navigator`: it is absent in older browsers and
// in any non-secure context, and registration must not break the app there.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // A failed registration only costs offline support; the app still runs.
    });
  });
}
