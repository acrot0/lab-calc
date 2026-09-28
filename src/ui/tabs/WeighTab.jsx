import React, { useState, useMemo, useEffect } from 'react';
import { stockFromSolid, molarMass, molarMassBreakdown } from '../../calc/solution.mjs';
import { TextField, NumField, Result, Err } from '../components/Fields.jsx';
import { UncertaintyPanel, Contribution } from '../components/UncertaintyPanel.jsx';
import { fmt, fmtSci, fmtMeasured, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import { molarMassUncertainty, productUncertainty } from '../../calc/uncertainty.mjs';
import { glasswareUncertainty, weighingUncertainty } from '../../calc/instruments.mjs';
import Card from '../components/Card.jsx';
import ProcedureFlow from '../components/ProcedureFlow.jsx';

/**
 * The uncertainty budget for a "weigh out a solid" calculation.
 *
 *   C = m / (M × V)   ⟹   m = C × M × V
 *
 * The mass to weigh is a product of three measured quantities, so the relative
 * uncertainties add in quadrature — which is why a 0.2% flask and a 0.01% molar
 * mass produce a result whose error is dominated by the balance.
 *
 * The balance term is on the *reading*, not on the target mass. A user weighing
 * 14.61 g does not know in advance that they will land on 14.61 g; what they do
 * is tare, add until the display reads the target, and the display's own
 * uncertainty applies to that reading. So the term is the balance's uncertainty
 * evaluated at the target mass, which is what `weighingUncertainty` is given.
 */
function weighBudget({ formula, molarity, volumeMl, flaskMl, flaskGrade, tempC, readabilityG, linearityG }) {
  const mm = molarMassUncertainty(formula);
  const flask = glasswareUncertainty({
    kind: 'flask', nominalMl: flaskMl, grade: flaskGrade, temperatureC: tempC,
  });
  // The balance's uncertainty is essentially constant in absolute terms, so it
  // is evaluated at the mass being weighed rather than at a nominal 1 g.
  const targetMass = molarity * (volumeMl / 1000) * mm.molarMass;
  const balance = weighingUncertainty({
    massG: targetMass, readabilityG, linearityG, tared: true,
  });

  /*
   * The concentration the user actually achieves depends on the mass they
   * actually weighed, so the balance belongs in this product.
   *
   * Leaving it out is tempting — the mass is the *result*, not an input — and
   * it is wrong: at 14.61 g the balance contributes 0.0012%, which hides
   * inside the flask's 0.029%, but at 58 µg it is the largest term by orders of
   * magnitude. Omitting it would report a small sample as well-determined when
   * the balance is exactly what makes it not.
   *
   * The molarity term carries no uncertainty of its own: it is the target the
   * user chose, and the question is how well the preparation hits it.
   */
  const combined = productUncertainty([
    { value: targetMass, unc: balance.unc, power: 1 },
    { value: mm.molarMass, unc: mm.unc, power: 1 },
    { value: volumeMl, unc: flask.unc, power: 1 },
  ]);

  return {
    molarMass: mm,
    flask,
    balance,
    // The balance contributes to the mass, and the mass is what the result
    // names — so it is reported as its own line rather than folded into the
    // concentration, where the user would not see the number they can act on.
    mass: { value: targetMass, unc: balance.unc },
    concentration: combined,
    relative: combined.value === 0 ? 0 : combined.unc / combined.value,
  };
}

export default function WeighTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '0.5');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '500');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  /*
   * The instrument panel is collapsed by default and its values are the ones
   * an ordinary teaching lab has: a class A flask, a four-place balance. They
   * are defaults rather than blanks because a budget with missing inputs is
   * worse than useless — it reports an uncertainty smaller than the real one,
   * and the user has no way to tell it was incomplete.
   */
  const [uncOpen, setUncOpen] = useState(false);
  const [flaskMl, setFlaskMl] = useState('500');
  const [flaskGrade, setFlaskGrade] = useState('A');
  const [tempC, setTempC] = useState('20');
  const [readabilityG, setReadabilityG] = useState('0.0001');
  const [linearityG, setLinearityG] = useState('0.0002');

  // The specific reason is kept, not just "it failed": "subscript cannot be
  // zero" tells the user what to fix, and a bare "unparseable" does not. The
  // error carries a code, so it is translated rather than shown raw.
  const parsed = useMemo(() => {
    try { return { mass: molarMass(formula), error: null }; } catch (e) {
      return { mass: null, error: formula.trim() ? errorMessage(e, t) : null };
    }
  }, [formula, t]);
  const M = parsed.mass;

  // The derivation, rebuilt whenever the formula or the inputs change. Kept
  // next to the result rather than in the calc layer, because what counts as
  // a step worth showing is a presentation decision.
  const worked = useMemo(() => {
    if (!M || !out) return null;
    const { terms, total } = molarMassBreakdown(formula);
    const volumeL = out.finalVolumeMl / 1000;
    return [
      {
        term: t('common.formula'),
        value: formula,
        detail: t('common.molarMass'),
      },
      {
        term: t('common.worked_MolarMass'),
        detail: t('common.worked_FormulaMass', { formula }),
      },
      ...terms.map((tm) => ({
        term: '',
        value: tm.count === 1
          ? t('common.worked_TermSingle', {
            element: tm.element, atomic: fmt(tm.atomic, 4),
          })
          : t('common.worked_Term', {
            element: tm.element,
            atomic: fmt(tm.atomic, 4),
            count: tm.count,
            contribution: fmt(tm.contribution, 4),
          }),
      })),
      { term: '', value: t('common.worked_Total', { total: fmt(total, 4) }) },
      {
        term: t('weigh.amount'),
        value: t('common.worked_Moles', {
          conc: fmtSci(n(molarity), 4),
          volume: fmt(volumeL, 4),
          moles: fmtSci(out.moles, 4),
        }),
      },
      {
        term: t('weigh.unit'),
        value: t('common.worked_Mass', {
          moles: fmtSci(out.moles, 4),
          molarMass: fmt(out.molarMass, 4),
          mass: fmtSci(out.massG, 4),
        }),
      },
    ];
  }, [formula, M, out, molarity, t]);

  /*
   * The budget is recomputed from the inputs on every render rather than
   * stored, so it cannot go stale against the result above it. It is cheap —
   * a handful of multiplications — and the alternative is a result and an
   * uncertainty that disagree because one was updated and the other was not.
   *
   * Returns null when any input is unusable, which is the honest answer: a
   * budget missing a term reports less uncertainty than there is.
   */
  const budget = useMemo(() => {
    const spec = {
      formula,
      molarity: n(molarity),
      volumeMl: n(volume),
      flaskMl: n(flaskMl),
      flaskGrade,
      tempC: n(tempC),
      readabilityG: n(readabilityG),
      linearityG: n(linearityG),
    };
    if (!Object.values(spec).every((v) => typeof v === 'string' || Number.isFinite(v))) return null;
    if (!(spec.molarity > 0) || !(spec.volumeMl > 0) || !(spec.flaskMl > 0)) return null;
    if (!(spec.readabilityG > 0)) return null;
    try {
      return weighBudget(spec);
    } catch {
      // An out-of-table flask size, or a formula with an element the weight
      // table does not cover. The main result still stands; the budget simply
      // is not available, and the panel says so rather than showing a zero.
      return null;
    }
  }, [formula, molarity, volume, flaskMl, flaskGrade, tempC, readabilityG, linearityG]);

  useEffect(() => { setOut(null); setErr(null); }, [formula, molarity, volume]);

  function run() {
    try {
      const inputs = { formula, molarity: n(molarity), volumeMl: n(volume) };
      const r = stockFromSolid(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'stockFromSolid',
        inputs,
        outputs: r,
        summary: recordSummary({ kind: 'stockFromSolid', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <Card>
      <TextField
        label={t('common.formula')} value={formula} onChange={setFormula}
        placeholder={t('common.formulaPlaceholder')}
        hint={M
          ? `${t('common.molarMass')} ${M.toFixed(3)} g/mol`
          : t('common.formulaPlaceholder')}
        error={parsed.error}
      />
      <div className="row">
        <NumField label={t('weigh.targetMolarity')} value={molarity} onChange={setMolarity} min="0" />
        <NumField label={t('weigh.finalVolume')} value={volume} onChange={setVolume} min="0" />
      </div>
      <div className="row row-actions">
        <button className="primary" onClick={run} disabled={!M}>{t('common.calc')}</button>
        {/* The bench steps, drawn. Beside Calculate rather than in the results
            because it answers "what do I do with this", which is the question
            after reading the number, not part of it. */}
        <ProcedureFlow
          kind="stockFromSolid"
          inputs={{ formula, molarity: n(molarity), volumeMl: n(volume) }}
          outputs={out}
          theme={theme}
        />
      </div>
      {err && <Err>{err}</Err>}
      <Result
        value={out ? fmtSci(out.massG, 3) : null}
        unit={t('weigh.unit')}
        note={out ? t('weigh.note', { volume: out.finalVolumeMl }) : null}
        rows={out ? [
          [t('common.molarMass'), `${fmt(out.molarMass, 3)} g/mol`],
          [t('weigh.amount'), `${fmtSci(out.moles, 4)} mol`],
          [t('weigh.finalVolume'), `${out.finalVolumeMl} mL`],
        ] : null}
        unc={out && uncOpen && budget ? {
          ...fmtMeasured(out.massG, budget.balance.unc, { unit: ` ${t('weigh.unit')}` }),
          detail: `${t('unc.uncRelative')} ${fmtSci(budget.relative * 100, 3)}%`,
        } : null}
        worked={worked}
        workedLabel={t('common.worked')}
      />

      <UncertaintyPanel
        open={uncOpen}
        onToggle={() => setUncOpen((v) => !v)}
        budget={budget}
        state={{ flaskMl, setFlaskMl, flaskGrade, setFlaskGrade, tempC, setTempC,
          readabilityG, setReadabilityG, linearityG, setLinearityG }}
      >
        <Contribution
          label={t('unc.uncBalance')} value={budget?.mass.value}
          unc={budget?.balance.unc} unit={t('weigh.unit')}
        />
        <Contribution
          label={t('common.molarMass')} value={budget?.molarMass.molarMass}
          unc={budget?.molarMass.unc} unit="g/mol"
        />
      </UncertaintyPanel>
    </Card>
  );
}
