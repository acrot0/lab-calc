import React, { useState, useEffect, useMemo } from 'react';
import { percentToMolarity, molarityToPercent, preparePercentSolution } from '../../calc/titration.mjs';
import { molarMass } from '../../calc/solution.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

export default function PercentTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'prepare');
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [percent, setPercent] = useState(restored?.percent != null ? String(restored.percent) : '10');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '100');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [mode, formula, percent, volume, molarity]);

  const M = (() => { try { return molarMass(formula); } catch { return null; } })();

  function run() {
    try {
      if (mode === 'prepare') {
        const inputs = { percent: n(percent), volumeMl: n(volume), formula };
        const r = preparePercentSolution(inputs);
        const conv = percentToMolarity({ percent: inputs.percent, formula });
        setOut({ ...r, mode, molarity: conv, molarMass: M });
        setErr(null);
        onRecord({
          kind: 'percentSolution', inputs,
          outputs: { massG: r.massG, molarity: conv },
          summary: recordSummary({ kind: 'percentSolution', inputs, outputs: { massG: r.massG } }, t),
        });
      } else {
        const inputs = { molarity: n(molarity), formula };
        const pct = molarityToPercent(inputs);
        setOut({ percent: pct, mode, molarity: inputs.molarity, molarMass: M });
        setErr(null);
        onRecord({
          kind: 'percentSolution', inputs,
          outputs: { percent: pct },
          summary: recordSummary({ kind: 'percentSolution', inputs, outputs: {} }, t),
        });
      }
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  // Gate the output on the mode that produced it: the reset effect runs after
  // render, so a mode switch would otherwise paint the previous direction's
  // result under the new direction's labels for one frame.
  const shown = shownFor(out, 'mode', mode);

  /*
   * The conversion, shown.
   *
   * Percentage by mass and molarity are two views of one solution, and the
   * bridge between them is the molar mass alone — w/v% is grams per 100 mL, so
   * multiplying mol/L by g/mol and dividing by 10 lands in the right unit.
   * Density plays no part, which is worth knowing because it is the term people
   * reach for first and the reason a hand-check against a measured density
   * disagrees.
   */
  const worked = useMemo(() => {
    if (!shown) return null;
    if (mode === 'prepare') {
      const mass = shown.massG ?? 0;
      const volMl = n(volume);
      return [
        {
          term: 'm',
          value: t('common.worked_PercentStep', {
            percent: fmt(n(percent), 4),
            volume: fmt(volMl, 4),
            grams: fmtSci(mass, 4),
            per100: fmtSci(volMl > 0 ? (mass / volMl) * 100 : 0, 4),
          }),
        },
        {
          term: 'C',
          value: t('common.worked_MolarityStep', {
            molarMass: fmt(shown.molarMass ?? 0, 4),
            conc: fmtSci(shown.molarity ?? 0, 4),
            percent: fmt(n(percent), 4),
          }),
        },
      ];
    }
    return [
      {
        term: 'C → w/v%',
        value: t('common.worked_MolarityStep', {
          molarMass: fmt(shown.molarMass ?? 0, 4),
          conc: fmtSci(shown.molarity ?? 0, 4),
          percent: fmt(shown.percent ?? 0, 4),
        }),
      },
    ];
  }, [shown, mode, percent, volume, t]);


  // The solubility check returns a code plus params, so the message follows the
  // UI language rather than being frozen in whichever language produced it.
  const solubilityMsg = shown?.solubilityWarning
    ? errorMessage({ code: shown.solubilityWarning.code, params: shown.solubilityWarning.params }, t)
    : null;

  return (
    <Card>
      <div className="field">
        <label htmlFor="pct-mode">{t('percent.mode')}</label>
        <select id="pct-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="prepare">{t('percent.modePrepare')}</option>
          <option value="toPercent">{t('percent.modeToPercent')}</option>
        </select>
      </div>

      <TextField
        label={t('common.formula')} value={formula} onChange={setFormula}
        placeholder={t('common.formulaPlaceholder')}
        hint={M ? `${t('common.molarMass')} ${M.toFixed(3)} g/mol` : t('common.formulaPlaceholder')}
        error={formula && !M ? t('common.formulaUnparseable') : null}
      />

      {mode === 'prepare' ? (
        <>
          <NumField label={t('percent.percentLabel')} value={percent} onChange={setPercent} min="0" hint={t('percent.percentHint')} />
          <NumField label={t('percent.volumeLabel')} value={volume} onChange={setVolume} min="0" />
        </>
      ) : (
        <NumField label={t('percent.molarityLabel')} value={molarity} onChange={setMolarity} min="0" />
      )}

      <button className="primary" onClick={run} disabled={!M}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}
      {solubilityMsg && <Warn>{solubilityMsg}</Warn>}

      {mode === 'prepare' ? (
        <Result
          value={shown ? fmtSci(shown.massG, 3) : null}
          unit={t('percent.unit')}
          note={shown ? t('percent.notePrepare', { volume: shown.volumeMl, molarity: fmtSci(shown.molarity, 4) }) : null}
          rows={shown ? [
            [t('percent.unit'), `${fmtSci(shown.massG, 4)} g`],
            [t('percent.equivalentConc'), `${fmtSci(shown.molarity, 4)} mol/L`],
            [t('common.molarMass'), `${fmt(shown.molarMass, 3)} g/mol`],
          ] : null}
          worked={worked}
          workedLabel={t('common.worked')}
        />
      ) : (
        <Result
          value={shown ? fmt(shown.percent, 3) : null}
          unit={t('percent.unitPercent')}
          note={shown ? t('percent.notePercent', { percent: fmt(shown.percent, 3), formula }) : null}
          rows={shown ? [
            [t('percent.unitPercent'), `${fmt(shown.percent, 4)} %`],
            [t('common.concentration'), `${shown.molarity} mol/L`],
            [t('common.molarMass'), `${fmt(shown.molarMass, 3)} g/mol`],
          ] : null}
          worked={worked}
          workedLabel={t('common.worked')}
        />
      )}
    </Card>
  );
}
