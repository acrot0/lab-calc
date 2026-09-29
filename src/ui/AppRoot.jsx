import React from 'react';
import App from './App.jsx';
import { LocaleProvider } from './LocaleContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { MaterialProvider } from './MaterialContext.jsx';
import { IconStyleProvider } from './IconStyleContext.jsx';
import { DensityProvider } from './DensityContext.jsx';
import { FieldsProvider } from './FieldsContext.jsx';

/*
 * The provider tree `App` needs, in the order it needs it.
 *
 * Extracted from `main.jsx` so a test can mount the real thing rather than a
 * hand-built approximation of it. The nesting is load-bearing — `FieldsProvider`
 * must sit inside the others and outside `App`, because the record-field
 * template has to be installed before `App`'s mount effect reads the history,
 * as `migrateHistory` drops the metadata keys a template does not retain.
 *
 * A test that rebuilt this tree by hand would encode that ordering a second
 * time, and the second copy is the one that goes stale when a provider is
 * added. That is the failure this file exists to prevent: the tree would be
 * right in the app and wrong in the tests, or the reverse.
 *
 * The store is a prop rather than resolved here, because `main.jsx` resolves
 * it once and hands the same one to the service-worker registration path —
 * resolving twice would give two fallbacks that could disagree.
 */
export default function AppRoot({ store }) {
  return (
    <LocaleProvider store={store}>
      <ThemeProvider store={store}>
        <MaterialProvider store={store}>
          <IconStyleProvider store={store}>
            <DensityProvider store={store}>
              <FieldsProvider store={store}>
                <App />
              </FieldsProvider>
            </DensityProvider>
          </IconStyleProvider>
        </MaterialProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
