import React, { useState, useEffect } from 'react';
import {
  balanceEquation, limitingReagent, empiricalFormula, percentComposition,
} from '../../calc/reaction.mjs';
import { ATOMIC_WEIGHTS } from '../../calc/solution.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/**
 * Reaction stoichiometry — balancing, limiting reagent, empirical formula.
 *
 * All three modes answer questions about the same thing (what reacts with what,
 * and how much), so they share a tab rather than fragmenting across three.
 */
const MODES = ['balance', 'limiting', 'formula'];

/** "Fe + O2 -> Fe2O3" → ['Fe', 'O2'] for the reagent rows. */
function reactantsOf(equation) {
  const [left] = String(equation).split(/\s*(?:->|→|=>|=)\s*/);
  if (!left) return [];
  return left.split('+').map((s) => s.trim().replace(/^\d+/, '')).filter((s) => s.length > 0);
}

function productsOf(equation) {
  const parts = String(equation).split(/\s*(?:->|→|=>|=)\s*/);
  if (parts.length !== 2) return [];
  return parts[1].split('+').map((s) => s.trim().replace(/^\d+/, '')).filter((s) => s.length > 0);
}

export default function ReactionTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'balance');
  const [equation, setEquation] = useState(restored?.equation ?? 'Fe + O2 -> Fe2O3');

  // One amount per reactant, keyed by formula. Keyed rather than positional so
  // editing the equation does not shuffle a number onto the wrong reagent.
  const [amounts, setAmounts] = useState(() => {
    const seed = {};
    for (const f of reactantsOf(restored?.equation ?? 'Fe + O2 -> Fe2O3')) {
      seed[f] = restored?.amounts?.find((a) => a.formula === f)?.amount ?? '10';
    }
    return seed;
  });
  const [unit, setUnit] = useState(restored?.unit ?? 'g');
  const [yieldOf, setYieldOf] = useState(restored?.yieldOf ?? '');
  const [actualG, setActualG] = useState(restored?.actualG != null ? String(restored.actualG) : '');

  const [entries, setEntries] = useState(() => (
    restored?.entries?.length
      ? restored.entries.map((e) => ({ element: e.element, amount: String(e.amount) }))
      : [{ element: 'C', amount: '40' }, { element: 'H', amount: '6.72' }, { element: 'O', amount: '53.28' }]
  ));
  const [molarMassGmol, setMolarMassGmol] = useState(
    restored?.molarMassGmol != null ? String(restored.molarMassGmol) : '',
  );

  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  const reactants = reactantsOf(equation);
  const products = productsOf(equation);

  // Drop amounts for reagents no longer in the equation, and seed new ones, so
  // editing the equation never leaves a stale number bound to nothing.
  useEffect(() => {
    setAmounts((prev) => {
      const next = {};
      for (const f of reactants) next[f] = prev[f] ?? '10';
      return next;
    });
  }, [equation]);

  useEffect(() => {
    setOut(null); setErr(null);
  }, [mode, equation, unit, yieldOf, actualG, molarMassGmol, entries]);

  function run() {
    try {
      let inputs;
      let r;
      if (mode === 'balance') {
        inputs = { mode, equation };
        r = balanceEquation(inputs);
      } else if (mode === 'limiting') {
        const list = reactants.map((f) => ({ formula: f, amount: n(amounts[f]), unit }));
        inputs = { mode, equation, amounts: list, unit };
        if (yieldOf.trim().length > 0 && actualG.trim().length > 0) {
          inputs.yieldOf = yieldOf.trim();
          inputs.actualG = n(actualG);
        }
        r = limitingReagent(inputs);
      } else {
        const list = entries
          .filter((e) => e.element.trim().length > 0)
          .map((e) => ({ element: e.element.trim(), amount: n(e.amount) }));
        inputs = { mode, entries: list };
        if (molarMassGmol.trim().length > 0) inputs.molarMassGmol = n(molarMassGmol);
        r = empiricalFormula(inputs);
      }
      setOut({ mode, ...r });
      setErr(null);
      onRecord({ kind: 'reaction', inputs, outputs: r, summary: recordSummary({ kind: 'reaction', inputs, outputs: r }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const shown = shownFor(out, 'mode', mode);
  const composition = mode === 'formula'
    ? (() => { try { return percentComposition({ formula: shown?.formula }); } catch { return null; } })()
    : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="rx-mode">{t('reaction.mode')}</label>
        <select id="rx-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`reaction.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode !== 'formula' && (
        <TextField label={t('reaction.equation')} value={equation} onChange={setEquation}
          hint={t('reaction.equationHint')} placeholder="Fe + O2 -> Fe2O3" />
      )}

      {mode === 'limiting' && (
        <>
          <div className="row">
            {reactants.map((f) => (
              <NumField key={f} id={`rx-amt-${f}`} label={f} value={amounts[f] ?? ''}
                onChange={(v) => setAmounts((p) => ({ ...p, [f]: v }))} min="0" />
            ))}
          </div>
          <div className="field">
            <label htmlFor="rx-unit">{t('reaction.unit')}</label>
            <select id="rx-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="g">{t('reaction.unit_g')}</option>
              <option value="mol">{t('reaction.unit_mol')}</option>
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="rx-yield-of">{t('reaction.yieldOf')}</label>
              <select id="rx-yield-of" value={yieldOf} onChange={(e) => setYieldOf(e.target.value)}>
                <option value="">{t('reaction.none')}</option>
                {products.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <NumField label={t('reaction.actualG')} value={actualG} onChange={setActualG} min="0"
              hint={t('reaction.actualGHint')} />
          </div>
        </>
      )}

      {mode === 'formula' && (
        <>
          <div className="field">
            <label>{t('reaction.composition')}</label>
            <div className="hint">{t('reaction.compositionHint')}</div>
          </div>
          {entries.map((e, idx) => (
            <div className="mix-row" key={idx}>
              <div className="field">
                <label htmlFor={`rx-el-${idx}`}>{t('reaction.element')}</label>
                <select id={`rx-el-${idx}`} value={e.element}
                  onChange={(ev) => setEntries((p) => p.map((x, j) => (j === idx ? { ...x, element: ev.target.value } : x)))}>
                  {Object.keys(ATOMIC_WEIGHTS).map((el) => <option key={el} value={el}>{el}</option>)}
                </select>
              </div>
              <NumField id={`rx-amt-el-${idx}`} label={t('reaction.amount')} value={e.amount} min="0"
                onChange={(v) => setEntries((p) => p.map((x, j) => (j === idx ? { ...x, amount: v } : x)))} />
              <button className="chip" type="button"
                aria-label={t('reaction.removeRow')}
                onClick={() => setEntries((p) => (p.length > 1 ? p.filter((_, j) => j !== idx) : p))}>−</button>
            </div>
          ))}
          <button className="chip" type="button"
            onClick={() => setEntries((p) => [...p, { element: 'N', amount: '10' }])}>
            + {t('reaction.addRow')}
          </button>
          <NumField label={t('reaction.molarMassGmol')} value={molarMassGmol} onChange={setMolarMassGmol}
            min="0" hint={t('reaction.molarMassHint')} />
        </>
      )}

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'balance' && (
        <Result value={shown.equation}
          note={t('reaction.balanceNote')}
          rows={[
            ...shown.reactants.map((s) => [s.formula, String(s.coefficient)]),
            ...shown.products.map((s) => [s.formula, String(s.coefficient)]),
          ]} />
      )}

      {shown?.mode === 'limiting' && (
        <>
          <Result value={shown.limiting} unit={t('reaction.limitingUnit')}
            note={t('reaction.extentNote', { extent: fmtSci(shown.extent, 5) })}
            rows={shown.products.map((p) => [
              `${p.formula} ${t('reaction.theoretical')}`,
              `${fmtSci(p.massG, 4)} g / ${fmtSci(p.moles, 5)} mol`,
            ])} />
          {shown.excess.length > 0 && (
            <div className="result-grid">
              {shown.excess.map((x) => (
                <div key={x.formula}>
                  <span>{t('reaction.excessLeft', { formula: x.formula })}</span>
                  <strong>{fmtSci(x.massG, 4)} g / {fmtSci(x.molesLeft, 5)} mol</strong>
                </div>
              ))}
            </div>
          )}
          {shown.percentYield != null && (
            <Result value={fmt(shown.percentYield, 2)} unit="%"
              note={t('reaction.percentYieldNote', { formula: shown.yieldOf ?? '' })} />
          )}
        </>
      )}

      {shown?.mode === 'formula' && (
        <>
          <Result value={shown.formula}
            note={shown.molecularFormula
              ? t('reaction.formulaNoteMolecular', { empirical: shown.empiricalFormula, n: shown.multiplier, M: fmt(shown.molecularMass, 3) })
              : t('reaction.formulaNote', { M: fmt(shown.molarMass, 3) })}
            rows={shown.ratios.map((r) => [`${r.element} :`, fmt(r.ratio, 4)])} />
          {composition && (
            <div className="result-grid">
              {composition.map((c) => (
                <div key={c.element}>
                  <span>{c.element} · {t('reaction.massPercent')}</span>
                  <strong>{fmt(c.massPercent, 2)} %</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Warn>{t('reaction.disclaimer')}</Warn>
    </div>
  );
}
