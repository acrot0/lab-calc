import React from 'react';
import { AlertTriangle } from 'lucide-react';

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

export function Result({ value, unit, note, rows }) {
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
    </div>
  );
}

export function Warn({ children }) {
  return (
    <div className="msg warn">
      <AlertTriangle size={15} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Err({ children }) {
  return (
    <div className="msg err" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

