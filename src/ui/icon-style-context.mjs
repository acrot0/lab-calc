import React, { createContext, useContext } from 'react';
import { DEFAULT_ICON_STYLE, STYLE_WEIGHT } from './icon-style.mjs';

/**
 * The icon-style context, in a module of its own.
 *
 * It lives here rather than beside the provider because of an import cycle:
 * `icons.jsx` needs to *read* this context so every glyph follows the chosen
 * style, and the toggle needs to *render* an icon from `icons.jsx`. Put both in
 * one file and the two import each other, which the bundler resolves to
 * `undefined` at module-evaluation time — the failure looks like a missing
 * component, not like a cycle.
 *
 * So this module imports nothing but React and the pure style table, and both
 * sides depend on it instead of on each other.
 *
 * ## The default is not a throw
 *
 * `useIconStyle` in the provider file throws outside a provider, which is right
 * for a component that cannot function without one. This hook is read by every
 * icon in the app, including in tests that render a glyph on its own and in the
 * print report, which renders outside the app's provider tree. A throw there
 * would be a crash for a preference that simply has not been set.
 */
export const IconStyleCtx = createContext(null);

/** The weight the current style draws at, or the default outside a provider. */
export function useIconWeight() {
  const v = useContext(IconStyleCtx);
  return v?.weight ?? STYLE_WEIGHT[DEFAULT_ICON_STYLE];
}

/** The current style id, for a component that needs to name it. */
export function useIconStyleName() {
  const v = useContext(IconStyleCtx);
  return v?.style ?? DEFAULT_ICON_STYLE;
}
