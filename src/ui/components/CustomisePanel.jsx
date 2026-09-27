import React, { useRef, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import {
  RADIUS_STEPS, DENSITY_STEPS, MOTION_STEPS,
  overridesToJson, overridesFromJson, describeOverrides,
} from '../custom-theme.mjs';
import { PALETTES } from '../palettes.mjs';

/*
 * The customisation panel.
 *
 * ## Why behind a disclosure
 *
 * Four controls that most sessions never touch, in a panel that already has
 * five. The current state is on the toggle ("已改 2 项"), so the closed state
 * still says whether anything is customised — the same arrangement the theme
 * list uses.
 *
 * ## Why steps and not sliders
 *
 * A corner radius of 7px is a mistake rather than a preference. The three
 * scales are named steps for the same reason the palettes are named palettes:
 * a choice from a list of good options beats a number the user has to guess at.
 *
 * ## Why the accent is a colour input
 *
 * It is the one value where any choice is legitimate — a brand colour, a
 * favourite hue — and the palette guard already checks an accent against the
 * surfaces it is drawn on. The reset button beside it returns to the palette's
 * own, which is what "跟随配色" means.
 */

/**
 * One row of step buttons.
 *
 * ## Why the label is looked up rather than read off the step
 *
 * The step lists in `custom-theme.mjs` carry a `{zh, en}` label, and this
 * component used to render `s.label.zh` directly. Measured in the browser with
 * the interface set to English: the accent, corners, density and motion rows
 * all read 直角 标准 圆角 / 紧凑 标准 宽松 / 弱 标准 强 — nine Chinese labels
 * inside an otherwise English panel.
 *
 * The cause is a second translation table. `custom-theme.mjs` is a pure model
 * with no access to the active locale, so its labels are data, not
 * translations; only a component can resolve them. Reading `label[locale]`
 * would fix this case and leave the next one, because the dictionary in
 * `custom-theme.mjs` and the one in the locale files would still be two copies
 * of the same nine strings. The keys are in the locale files now, and the
 * `label` field is gone from the model — one table, resolved by the mechanism
 * every other string in the app uses.
 */
function StepRow({ label, labelKey, steps, value, fallback, onChange, onClear }) {
  const { t } = useI18n();
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {steps.map((s) => {
          // The palette's own value is the default, so "not customised" shows
          // as that step being selected rather than as nothing being selected.
          const on = (value ?? fallback) === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`seg-btn${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => (s.id === fallback ? onClear() : onChange(s.id))}
            >
              {t(`${labelKey}_${s.id}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomisePanel() {
  const { t, locale } = useI18n();
  const { overrides, setOverride, resetOverrides, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);

  const desc = describeOverrides(overrides, locale);

  function doExport() {
    const json = overridesToJson(overrides, { palette: resolved });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-calc-theme-${resolved}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file) {
    if (!file) return;
    const result = overridesFromJson(await file.text());
    if (!result.ok) {
      setNotice({ kind: 'err', text: t(`app.customImportErr_${result.code}`) });
    } else {
      // Replace rather than merge: an imported theme is a complete set, and
      // merging would leave the user's previous accent behind a new one.
      resetOverrides();
      for (const [key, value] of Object.entries(result.overrides)) setOverride(key, value);
      // The file records which palette it was tuned against, and an accent
      // chosen for a dark palette can be unreadable on a light one. Said rather
      // than enforced: the user may know exactly what they are doing.
      const extra = result.palette && result.palette !== resolved
        ? t('app.customImportOtherPalette', { palette: PALETTES[result.palette]?.label?.[locale] ?? result.palette })
        : '';
      setNotice({ kind: 'ok', text: t('app.customImportOk', { n: Object.keys(result.overrides).length }) + extra });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="settings-block">
      <button
        type="button"
        className="settings-block-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings-label">{t('app.customTitle')}</span>
        <span className="settings-current">
          {desc.count > 0 ? t('app.customCount', { n: desc.count }) : t('app.customNone')}
        </span>
        <Icons.caret size={ICON_SIZE.inline} className="caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="custom-body">
          <p className="settings-note">{t('app.customHint')}</p>

          <div className="settings-row">
            <span className="settings-label">{t('app.customAccent')}</span>
            <span className="custom-accent">
              <input
                type="color"
                value={overrides['--accent'] ?? '#888888'}
                aria-label={t('app.customAccent')}
                onChange={(e) => setOverride('--accent', e.target.value)}
              />
              {/* Shown only when overridden: a reset button for something that
                  is not set is a control that does nothing. */}
              {overrides['--accent'] && (
                <button type="button" className="link-btn" onClick={() => setOverride('--accent', null)}>
                  {t('app.customAccentReset')}
                </button>
              )}
            </span>
          </div>

          <StepRow
            label={t('app.customRadius')} labelKey="app.radius" steps={RADIUS_STEPS}
            value={overrides['--radius']} fallback="default"
            onChange={(v) => setOverride('--radius', v)} onClear={() => setOverride('--radius', null)}
          />
          <StepRow
            label={t('app.customDensity')} labelKey="app.density" steps={DENSITY_STEPS}
            value={overrides['--density']} fallback="default"
            onChange={(v) => setOverride('--density', v)} onClear={() => setOverride('--density', null)}
          />
          <StepRow
            label={t('app.customMotion')} labelKey="app.motion" steps={MOTION_STEPS}
            value={overrides['--motion']} fallback="default"
            onChange={(v) => setOverride('--motion', v)} onClear={() => setOverride('--motion', null)}
          />

          {notice && (
            <div className={`notice notice-${notice.kind}`} role="status">
              {notice.text}
              <button className="link-btn" onClick={() => setNotice(null)} aria-label={t('history.dismiss')}>×</button>
            </div>
          )}

          <div className="custom-actions">
            <button type="button" className="link-btn" onClick={doExport} disabled={desc.count === 0}>
              <Icons.download size={ICON_SIZE.inline} aria-hidden="true" />
              {t('app.customExport')}
            </button>
            <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
              <Icons.upload size={ICON_SIZE.inline} aria-hidden="true" />
              {t('app.customImport')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={t('app.customImport')}
              onChange={(e) => doImport(e.target.files?.[0])}
            />
            {desc.count > 0 && (
              <button
                type="button"
                className="link-btn custom-reset"
                onClick={() => { resetOverrides(); setNotice({ kind: 'ok', text: t('app.customResetDone') }); }}
              >
                {t('app.customReset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
