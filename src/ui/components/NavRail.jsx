import React from 'react';
import { ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';

/**
 * The desktop navigation rail.
 *
 * Collapsed it is a strip of icons; on hover or keyboard focus it widens to
 * show the labels. The point is not decoration: fifteen tabs do not fit on one
 * row at the width this app is designed for, so the old horizontal bar wrapped
 * onto two or three lines and pushed the actual content below the fold. A rail
 * spends 56px of width to give the content the rest of the height.
 *
 * The width is animated in CSS rather than by React state. Tracking hover in
 * state would re-render the whole app on every pointer crossing, and a
 * re-render mid-transition is what makes a menu like this stutter. The browser
 * can expand a `:hover` rule on the compositor without React's involvement, so
 * the interaction stays smooth and the app stays out of the way.
 *
 * Focus, not just hover, drives the expansion: a keyboard user tabbing into the
 * rail must be able to read the labels too, and `:focus-within` is the CSS that
 * says so. That is also why the labels are always in the DOM and merely hidden
 * by `overflow` — a screen reader announces them either way, and nothing has to
 * be mounted to satisfy a hover.
 *
 * Below the breakpoint the rail is hidden entirely and the horizontal tab bar
 * takes over, which is the layout a thumb expects on a phone.
 */
export default function NavRail({ tabs, current, onSelect }) {
  const { t } = useI18n();

  return (
    <nav className="rail" aria-label={t('app.navLabel')}>
      <div className="rail-inner">
        {tabs.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="rail-item"
            aria-current={current === id ? 'page' : undefined}
            onClick={() => onSelect(id)}
            title={t(`tabs.${id}`)}
          >
            <span className="rail-icon" aria-hidden="true">
              <Icon size={ICON_SIZE.display} />
            </span>
            <span className="rail-label">{t(`tabs.${id}`)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
