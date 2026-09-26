import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';

/**
 * The desktop navigation rail.
 *
 * Collapsed it is a strip of icons; expanded it shows the labels beside them.
 *
 * ## Why it expands on click rather than on hover
 *
 * Hover-to-expand was the previous behaviour and it was wrong for two reasons.
 * A rail that widens when the pointer crosses it moves the thing the user is
 * aiming at — the icons shift right by 152px at the moment of the click, which
 * is how a hover-expanded menu turns a correct click into a wrong one. And it
 * is unreachable on a touch laptop, where there is no hover at all: the rail
 * would stay a column of unlabelled glyphs with no way to ask what they mean.
 *
 * A click is deliberate. It is also discoverable, which hover is not: nothing
 * on screen says the rail can expand, and a control the user does not know
 * about is not a control. The toggle below carries the affordance.
 *
 * ## Why the labels are always in the DOM
 *
 * A screen reader announces them either way, and nothing has to be mounted to
 * satisfy a hover. The CSS hides them by width, not by `display: none`.
 *
 * Below the breakpoint the rail is hidden entirely and the bottom bar takes
 * over, which is the layout a thumb expects on a phone.
 */
export default function NavRail({ tabs, current, onSelect }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <nav className={`rail${open ? ' is-open' : ''}`} aria-label={t('app.navRailLabel')}>
      {/*
        The expand toggle.

        It is the first item in the rail so it sits where the icons are and
        moves with them, and it is the only control in the rail that is not a
        destination — which is why it is separated by a rule rather than
        blending into the list.
      */}
      <button
        type="button"
        className="rail-item rail-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={open ? t('app.collapseNav') : t('app.expandNav')}
      >
        <span className="rail-icon" aria-hidden="true">
          {open
            ? <Icons.collapseNav size={ICON_SIZE.display} />
            : <Icons.expandNav size={ICON_SIZE.display} />}
        </span>
        <span className="rail-label">
          {open ? t('app.collapseNav') : t('app.expandNav')}
        </span>
      </button>

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
