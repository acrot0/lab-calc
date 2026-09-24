import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';
import App from './App.jsx';
import { LocaleProvider } from './LocaleContext.jsx';
import { resolveStore } from './history.mjs';

// The locale store and the history store are the same localStorage; resolving
// it once keeps the "storage unavailable" fallback consistent between them.
const store = resolveStore();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleProvider store={store}>
      <App />
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
