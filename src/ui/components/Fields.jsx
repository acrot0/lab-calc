import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';

/** Shared form primitives. Kept separate so every tab renders inputs the same way. */

/**
 * `id` is overridable because the default is derived from the label, and a
 * repeated label (a dynamic list of ions, say) then emits the same id twice.
 * Two inputs sharing an id means the label points at whichever the browser
 * found first — the second field loses its name and its click target.
 */
export function NumField({ label, value, onChange, hint, error, step = 'any', min, id: idProp }) {
  const id = idProp ?? `f-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
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

export function Result({ value, unit, note, rows, worked, workedLabel }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="result" role="status" aria-live="polite">
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

