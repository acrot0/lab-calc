import React, { useState, useEffect, useRef } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { looksLikeExpression } from '../../calc/expression.mjs';
import { readNumberField, safeEvaluate } from '../field-input.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { claimField } from '../field-bridge.mjs';
import { useNumberReveal } from '../number-reveal.mjs';
import { saveFile } from '../save-file.mjs';

/** Shared form primitives. Kept separate so every tab renders inputs the same way. */

/**
 * Tell the calculator which field it may fill, and what it is called.
 *
 * On focus rather than on mount: a tab can render twenty fields, and the one
 * the user means is the one they were last typing in. The claim is released on
 * unmount so a removed field is never written to.
 *
 * ## Why this is a hook rather than code inside `NumField`
 *
 * It lived inside `NumField`, and that was the bug. `TextField` — the formula
 * box, the sequence box, the standards-points box — rendered an input with no
 * registration at all, so focusing one left the calculator with no target: its
 * 「填入字段」 button was disabled, with the tooltip "focus a field first", while
 * the user looked at a focused field. A user reported it as "the calculator's
 * value will not go into the box".
 *
 * Extracting it means a field type opts in by calling one hook, and the next
 * kind of field added has an obvious place to do so. The regression test mounts
 * both existing kinds and would fail if a third were added without one.
 *
 * The label is the same string the field renders above itself, passed in rather
 * than looked up by id, so the button and the field cannot describe the target
 * differently.
 */
function useFillTarget(label) {
  const inputRef = useRef(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    let release = null;
    const onFocus = () => {
      release?.();
      release = claimField(el, label);
    };
    el.addEventListener('focus', onFocus);
    return () => {
      el.removeEventListener('focus', onFocus);
      release?.();
    };
  }, [label]);
  return inputRef;
}

/**
 * `id` is overridable because the default is derived from the label, and a
 * repeated label (a dynamic list of ions, say) then emits the same id twice.
 * Two inputs sharing an id means the label points at whichever the browser
 * found first — the second field loses its name and its click target.
 *
 * The field is a text input, not a number input, so an expression can be typed
 * into it. That is a deliberate loss: `type="number"` gives a spinner and a
 * numeric keypad on mobile, and it refuses to hold the string `0.1*250/58.44`
 * at all — the browser discards the value and the field goes blank. Being able
 * to do the arithmetic in the field is worth more than the spinner, and
 * `inputMode="decimal"` keeps the mobile keypad.
 *
 * What the caller receives is still the number, not the expression. The
 * expression is evaluated on every keystroke and the result handed up, so no
 * tab has to know this exists — a field that has only ever been given a plain
 * number behaves exactly as it did.
 */
export function NumField({ label, value, onChange, hint, error, step = 'any', min, disabled = false, id: idProp }) {
  const id = idProp ?? `f-${typeof label === 'string' ? label : ''}`;
  const { t } = useI18n();
  const [draft, setDraft] = useState(null);
  const inputRef = useFillTarget(label);
  /*
   * `draft` holds what the user is typing; `value` is the evaluated number the
   * tab holds. Without the draft, typing `0.1*2` would re-render the field with
   * `0.2` after the first operator and the rest of the expression would be
   * erased as it was typed.
   *
   * It is cleared on blur, so the field settles on the answer once the user
   * moves on, and never on a keystroke — a field that rewrites itself mid-entry
   * is a field you cannot finish typing in.
   */
  const shown = draft ?? value;

  /*
   * The field's accessible name is the label, which may be a node.
   *
   * Every caller in the app passes a translated string, so this is a no-op for
   * all of them — but a `label` holding an element would otherwise be used
   * directly as a DOM id, and `document.getElementById` would take the
   * element's stringification. Coercing here keeps the id a string whatever the
   * caller passes.
   */
  const labelText = typeof label === 'string' ? label : String(label ?? '');

  /**
   * The expression's value, shown under the field while it is being typed.
   *
   * `looksLikeExpression` gates this so the hint appears only for something that
   * is doing arithmetic. A pasted `1,234.5` is a number, not an expression, and
   * echoing "= 1234.5" under a field that already reads 1,234.5 would be noise.
   * The value itself still goes through the evaluator either way — see
   * `readNumberField`.
   */
  const preview = draft !== null && looksLikeExpression(draft) ? safeEvaluate(draft) : null;

  function handle(e) {
    const next = e.target.value;
    setDraft(next);
    /*
     * An emptied box is a signal, not an absent one.
     *
     * `readNumberField` returns null for the empty string — correctly, since
     * "nothing" is not a number — and null means "leave the tab's value
     * alone". So clearing the box left the tab holding the number that was
     * deleted, and pressing the button calculated with it: `0.5` in
     * 目标浓度, box cleared, 计算, and 14.61 g came back with nothing in the
     * field and no error anywhere.
     *
     * Reporting `''` instead is what makes the tab stop holding it. Each tab
     * then reads its own state through `n()`, which turns `''` into NaN, and
     * the calc layer refuses NaN with a named message — "定容体积必须是有效
     * 数字" — which is the right answer to an empty required field.
     *
     * Only *empty* takes this path. Text that is neither empty nor readable
     * (`2..5` mid-typing, `abc`) still leaves the tab alone, because blanking
     * a working result on every keystroke is a worse failure than the one
     * being fixed here.
     */
    if (next.trim() === '') {
      onChange('');
      return;
    }
    // A plain number goes straight through; an expression is evaluated and its
    // value passed up, so the tab always sees a number. Anything unreadable
    // leaves the tab holding its previous value rather than a partial parse.
    const parsed = readNumberField(next);
    if (parsed !== null) onChange(String(parsed));
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        step={step}
        min={min}
        disabled={disabled}
        value={shown ?? ''}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={hint || error || preview !== null ? `${id}-hint` : undefined}
        onChange={handle}
        onBlur={() => setDraft(null)}
      />
      {preview !== null && (
        <div className="hint" id={`${id}-hint`}>
          =
          {/* Keyed on the value so React replaces the node when the answer
              changes, which is what re-runs the entrance animation. Keying on
              the field would animate once and then sit still while the number
              behind it changed. */}
          <span className="expr-value" key={fmt(preview, 6)}>{fmt(preview, 6)}</span>
        </div>
      )}
      {(error || hint) && !preview && (
        <div className={`hint${error ? ' err' : ''}`} id={`${id}-hint`}>{error || hint}</div>
      )}
      {/* Announced, not just shown: a screen reader user typing an expression
          gets no other signal that it was understood. */}
      {preview !== null && (
        <span className="sr-only" aria-live="polite">{t('common.expressionValue')} {fmt(preview, 6)}</span>
      )}
    </div>
  );
}

/**
 * What a number field holds, from what the user typed or pasted.
 *
 * The decision itself lives in `field-input.mjs`, where it can be tested
 * without a browser — see the note there for why the order of its two attempts
 * is the whole point. This file only renders.
 */

/** The value of an expression, or null if it does not evaluate. */

/**
 * A text field, or a multi-line one when `rows` is given.
 *
 * ## Why `rows` exists
 *
 * Five fields documented "one per line" — the propagation terms, the kinetics
 * and Arrhenius point pairs, the blank replicates, the recovery list — were
 * rendered as `<input type="text">`. An input cannot hold a newline: the browser
 * strips them on the way in, so the field showed `0, 1.0010, 0.8220, 0.67…`
 * for a five-point default while the parser still received the real newlines
 * and computed correctly. The display and the value had silently diverged.
 *
 * Touching the field ended the divergence the bad way: React wrote the
 * newline-free text back into state, the five points collapsed into one
 * unreadable line, and the tab reported "这几行读不出来" for data the user never
 * touched. Pasting a column out of a spreadsheet did the same thing one step
 * earlier — `98.2\n97.5` arrives as `98.2975`, one plausible number, so the mean
 * came out over five points where the user had entered seven.
 *
 * A textarea is the only element that can hold what these fields are for. The
 * hint was already telling the user to enter one per line; this makes the box
 * capable of it.
 */
export function TextField({ label, value, onChange, hint, error, placeholder, rows, id: idProp }) {
  const id = idProp ?? `f-${label}`;
  /*
   * A text field is a fill target too.
   *
   * It was not, and that was the bug: the calculator's 「填入字段」 button stayed
   * disabled whenever the user had last focused a formula box, a sequence box
   * or the standards-points box, because none of them registered. See
   * `useFillTarget` for why the registration is a hook.
   */
  const inputRef = useFillTarget(label);

  const shared = {
    ref: inputRef,
    id,
    value,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': hint || error ? `${id}-hint` : undefined,
    onChange: (e) => onChange(e.target.value),
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {rows
        ? <textarea {...shared} className="points-input" rows={rows} spellCheck={false} />
        : <input {...shared} type="text" placeholder={placeholder} />}
      {(error || hint) && (
        <div className={`hint${error ? ' err' : ''}`} id={`${id}-hint`}>{error || hint}</div>
      )}
    </div>
  );
}

/**
 * The worked calculation, folded away until asked for.
 *
 * The app answers "how much do I weigh out"; it did not answer "why", which is
 * the question a student actually has and the one an exam asks. Every tab can
 * now hand its derivation here: the formula, the substitution, and the result,
 * each step a line.
 *
 * Collapsed by default, and that is deliberate. Someone who has made this
 * solution a hundred times wants the number, not the arithmetic; someone
 * meeting it for the first time wants the opposite. A disclosure serves both
 * without making the second group's need the first group's cost.
 *
 * The steps are a description list because that is what they are — a term and
 * its value — and a screen reader announces a definition list as such rather
 * than reading a wall of text.
 */
export function Worked({ steps, label }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;
  return (
    <div className="worked">
      <button
        type="button"
        className="link-btn worked-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <dl className="worked-steps">
          {steps.map((step, i) => (
            // Steps have no stable identity — two can carry the same term — so
            // the index is the key, which is correct here because the list is
            // regenerated whole on every calculation.
            // eslint-disable-next-line react/no-array-index-key
            <div className="worked-step" key={i}>
              <dt>{step.term}</dt>
              <dd>
                {step.value !== undefined && <strong>{step.value}</strong>}
                {step.detail && <span className="worked-detail">{step.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The result panel.
 *
 * The `key` on the inner block is what makes the reveal replay. The CSS
 * animation runs when an element mounts, and without the key React reuses the
 * same node across renders — so the panel animated once, on the first result of
 * the session, and every result after it appeared with no transition at all.
 * That is the difference between an app that feels alive and one that feels
 * like a static page, and it was invisible in a screenshot because the end
 * state is identical.
 *
 * The key is the value *and* the row contents, because two different inputs can
 * produce the same headline number with different secondary rows.
 */
export function Result({ value, unit, note, rows, worked, workedLabel, unc, title }) {
  /*
   * The reveal is keyed on the value, so a second calculation replays it.
   *
   * Hooks cannot sit behind the early return below, so the reveal is driven
   * from a stable `value` that is coerced to a string here rather than after
   * the null check.
   */
  /*
   * When the tab computed an uncertainty, the headline number must be the one
   * `roundPair` produced — not the tab's own `fmtSci(value, 3)`.
   *
   * These are two different roundings and they disagree whenever the
   * uncertainty is finer than three significant figures. Weighing 14.6099 g
   * with a balance whose combined term is ±0.00017 g rendered as:
   *
   *     14.61 g          ← fmtSci(out.massG, 3)
   *     ± 0.00017 g      ← roundPair, which put the value at 14.6099
   *
   * The ± line claims four decimals of resolution while the number above it
   * shows two. A reader taking only the headline — which the panel's own
   * comment says they will — gets a figure two digits coarser than the
   * measurement supports, and the card contradicts itself.
   *
   * `fmtMeasured` returns the pair precisely so the two cannot diverge, and
   * every call site already spreads it into `unc`. The `text` half was being
   * computed and then discarded on the assumption, written into the comment
   * that used to be here, that it always equals the headline. It does not.
   *
   * The unit is not appended here: `unc.value` is the bare number, and `unit`
   * is already rendered as its own span below. Taking `unc.text` instead
   * printed it twice.
   */
  const headline = unc?.value ?? value;
  const shown = useNumberReveal(headline ?? '', [String(headline ?? '')]);

  if (value === null || value === undefined) return null;
  const stamp = `${headline}|${rows?.map(([k, v]) => `${k}${v}`).join(',') ?? ''}`;
  return (
    <div className="result" role="status" aria-live="polite">
      <div className="result-body" key={stamp}>
        <div className="result-main">
          {/*
            The masked text is `aria-hidden` and the real value is announced
            from a visually hidden twin.

            Without this a screen reader in a live region reads every frame of
            the reveal — "dot dot dot dot dot, dot dot dot dot" — and the user
            hears punctuation instead of their answer. The hidden twin carries
            the finished string from the first frame, so assistive technology
            gets the value once, immediately, while the visible text resolves.
          */}
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">{headline}</span>
          {unit && <span className="unit">{unit}</span>}
        </div>
        {/*
          The uncertainty, when the tab computed one.
          It sits directly under the value rather than in the rows: it is not
          another output, it is a qualifier on the one above it, and a reader
          who takes the headline number and stops must not miss it.
        */}
        {unc && (unc.uncText || unc.detail) && (
          <div className="result-unc" title={unc.detail ?? undefined}>
            {/*
              The ± half only. The value half is the headline directly above,
              and printing it again here would state the mass twice. Bare
              rather than `uncText` for the same reason as the headline: the
              unit is its own span below.
            */}
            {unc.uncValue && <span className="result-unc-value">{unc.uncValue}</span>}
            {unc.detail && <span className="result-unc-detail">{unc.detail}</span>}
          </div>
        )}
        {note && <div className="result-note">{note}</div>}
        {rows && rows.length > 0 && (
          <div className="result-grid">
            {rows.map(([k, v]) => (
              <div key={k}><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
        )}
        <ShareButton
          /*
           * The same pair the panel shows, so the exported image cannot state
           * a different precision from the screen it was taken from. `note`
           * is used when there is no uncertainty, which is the tab's own
           * one-line description of what it computed.
           */
          value={headline}
          unit={unit}
          note={unc?.uncText || note || ''}
          rows={rows}
          /* The note is the tab's own one-line description of what it just
             computed — "称取 14.61 g NaCl，定容至 500 mL" — which is exactly
             what the card should be headed with. No tab passes a separate
             title, and asking twenty of them to start would be twenty chances
             to forget. */
          label={title ?? note ?? ''}
        />
      </div>
      {worked && <Worked steps={worked} label={workedLabel} />}
    </div>
  );
}

/**
 * "Share as an image", under every result.
 *
 * It lives here rather than on each tab for the same reason the example button
 * lives in the topbar: twenty tabs would otherwise carry twenty copies, and the
 * card's contents are exactly what this component already holds — the value,
 * the unit, the rows and the note. Nothing needs to be threaded down.
 *
 * The PNG is produced only on click. Building it eagerly would put an `Image`
 * decode and a 2× canvas on the render path of every calculation, for a button
 * most people never press.
 */
function ShareButton({ value, unit, rows, note, label }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const { shareCardSvg, renderShareCard, shareCardFilename } = await import('../share-card.mjs');
      /*
       * `data-theme-scheme`, not `data-theme`.
       *
       * The latter holds the palette *key* — "gruvbox", "solarized-light" — so
       * testing it against "light" matched nothing and every card came out dark,
       * including on the light themes. `themeScheme` is the resolved
       * light/dark, which is what the card actually needs to choose colours.
       */
      const scheme = globalThis.document?.documentElement?.dataset?.themeScheme;
      const theme = scheme === 'light' ? 'light' : 'dark';
      const markup = shareCardSvg({
        title: label ?? '',
        value: String(value),
        unit: unit ?? '',
        rows: rows ?? [],
        note,
        software: 'Lab Calc',
        version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
        theme,
      });
      const blob = await renderShareCard(markup, {
        background: theme === 'light' ? '#fbfaf7' : '#12161f',
      });
      await saveFile(blob, shareCardFilename({ title: label ?? '' }), 'image/png');
    } catch {
      // A failed card is not a failed calculation. The number is on screen
      // either way, so this stays silent rather than reporting an error against
      // a result that is perfectly good.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="link-btn share-btn" onClick={share} disabled={busy}>
      <Icons.download size={ICON_SIZE.inline} aria-hidden="true" />
      {t('common.shareCard')}
    </button>
  );
}

export function Warn({ children }) {
  return (
    <div className="msg warn">
      <Icons.warning size={ICON_SIZE.control} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Err({ children }) {
  return (
    <div className="msg err" role="alert">
      <Icons.warning size={ICON_SIZE.control} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

