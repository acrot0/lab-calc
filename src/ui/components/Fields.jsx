import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { evaluate, looksLikeExpression } from '../../calc/expression.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';

/** Shared form primitives. Kept separate so every tab renders inputs the same way. */

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
export function NumField({ label, value, onChange, hint, error, step = 'any', min, id: idProp }) {
  const id = idProp ?? `f-${label}`;
  const { t } = useI18n();
  const [draft, setDraft] = useState(null);

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

  /** The expression's value if the draft is one, else null. */
  const preview = draft !== null && looksLikeExpression(draft) ? safeEvaluate(draft) : null;

  function handle(e) {
    const next = e.target.value;
    setDraft(next);
    // A plain number goes straight through; an expression is evaluated and its
    // value passed up, so the tab always sees a number.
    const parsed = looksLikeExpression(next) ? safeEvaluate(next) : Number.parseFloat(next);
    if (parsed !== null && Number.isFinite(parsed)) onChange(String(parsed));
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        step={step}
        min={min}
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

/** The value of an expression, or null if it does not evaluate. */
function safeEvaluate(src) {
  try {
    const r = evaluate(src);
    // A dimensioned result has no place in a scalar field: `5 g / 2 mL` is a
    // concentration, and putting 2500 into a "volume in mL" box would be
    // putting a number where a different kind of quantity belongs.
    return r.dimensionless ? r.value : null;
  } catch {
    return null;
  }
}

export function TextField({ label, value, onChange, hint, error, placeholder, id: idProp }) {
  const id = idProp ?? `f-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
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
export function Result({ value, unit, note, rows, worked, workedLabel }) {
  if (value === null || value === undefined) return null;
  const stamp = `${value}|${rows?.map(([k, v]) => `${k}${v}`).join(',') ?? ''}`;
  return (
    <div className="result" role="status" aria-live="polite">
      <div className="result-body" key={stamp}>
        <div className="result-main">
          {value}
          {unit && <span className="unit">{unit}</span>}
        </div>
        {note && <div className="result-note">{note}</div>}
        {rows && rows.length > 0 && (
          <div className="result-grid">
            {rows.map(([k, v]) => (
              <div key={k}><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
        )}
      </div>
      {worked && <Worked steps={worked} label={workedLabel} />}
    </div>
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

