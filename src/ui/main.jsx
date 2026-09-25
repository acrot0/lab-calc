import React from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Three typefaces, each with a job.
 *
 * `wght.css` rather than `index.css`: the variable build ships one file per
 * axis and `index.css` pulls in every axis the family has. Only weight is used
 * here, so the axes nobody asked for would be bytes on every load.
 *
 * Space Grotesk for the brand and headings, Geist for the interface, JetBrains
 * Mono for anything numeric. The split is not decoration — it is the same
 * division a technical document makes: a display face for the few words that
 * carry identity, a neutral face for the many that carry information, and a
 * monospaced face wherever digits must line up in a column.
 *
 * All four are OFL-1.1, so the licence check passes unchanged. Chinese is
 * deliberately NOT loaded: a CJK webfont is several megabytes, and the system
 * fallbacks (PingFang SC, Microsoft YaHei) are already on every machine that
 * would read it.
 *
 * `instrument-serif` is Latin-only by design, and that is not a gap. Measured
 * before choosing: the same heading in Noto Serif SC pulls 500 KB of subset
 * files for the fourteen characters in the drawer title, because a CJK face
 * cannot be subset per-glyph the way a Latin one can. Latin headings take the
 * serif; Chinese ones fall through to the system serif (`Songti SC`, `SimSun`),
 * which is the correct face for the script and costs nothing.
 */
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/space-grotesk/wght.css';
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
