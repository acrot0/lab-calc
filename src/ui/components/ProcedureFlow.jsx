import React, { useMemo, useState } from 'react';
import ProcedureDiagram from './diagrams/ProcedureDiagram.jsx';
import { procedureFor } from '../procedure.mjs';
import { useI18n } from '../LocaleContext.jsx';

/*
 * The bench steps for a calculation, behind a toggle.
 *
 * ## Why the toggle is its own component
 *
 * Four tabs are procedural — weighing, diluting, buffers, serial dilution — and
 * each wants the same thing: a link beside Calculate that reveals the steps for
 * whatever is currently on screen. Written per tab that is the same button, the
 * same state and the same record shape four times over, and the four copies
 * drift: the buffer tab shipped with the figure and the other three did not,
 * which is what this component exists to prevent.
 *
 * ## Why it takes a record rather than steps
 *
 * The steps are derived here, from the record shape the history stores, through
 * the same `procedureFor` the Markdown export uses. A tab that built its own
 * step list could say something different from the file it exports. Passing the
 * record means the figure on screen and the recipe in the export are one
 * derivation.
 *
 * ## Why nothing renders before the first calculation
 *
 * `outputs` is empty until Calculate runs, and every step names a number from
 * it — "weigh out 14.61 g" has no meaning without the mass. A figure derived
 * from half-filled inputs would be a procedure with blanks in it, which is the
 * failure `procedureFor` returns null to avoid.
 */

export default function ProcedureFlow({ kind, inputs, outputs, theme }) {
  const { t, locale } = useI18n();
  const [show, setShow] = useState(false);
  const steps = useMemo(
    () => (outputs ? procedureFor({ kind, inputs, outputs }, locale) : null),
    [kind, inputs, outputs, locale],
  );
  if (!steps) return null;

  return (
    <>
      <button className="link-btn" onClick={() => setShow((v) => !v)}>
        {show ? t('procedure.hide') : t('procedure.show')}
      </button>
      {show && <ProcedureDiagram title={steps.title} steps={steps.steps} theme={theme} />}
    </>
  );
}
