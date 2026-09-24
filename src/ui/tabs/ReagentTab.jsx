import React, { useState, useEffect } from 'react';
import {
  molarityFromPercent, volumeForMolarity, normality, equivalentWeight,
  molality, moleFraction, ionicStrength, activityCoefficient,
} from '../../calc/reagent.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/**
 * Concentrated reagents with their published density and weight percentage.
 * The density is the value people leave out, and leaving it out turns 37% HCl
 * into a 10 M guess instead of 12 M.
 */
// The formula and the percentage are language-independent; only the name is
// translated, so the chip is composed from both rather than stored whole.
const STOCKS = [
  { name: 'stock_hcl', display: 'HCl', formula: 'HCl', percent: 37, density: 1.19 },
  { name: 'stock_h2so4', display: 'H₂SO₄', formula: 'H2SO4', percent: 98, density: 1.84 },
  { name: 'stock_hno3', display: 'HNO₃', formula: 'HNO3', percent: 70, density: 1.42 },
  { name: 'stock_nh3', display: 'NH₃', formula: 'NH3', percent: 28, density: 0.90 },
  { name: 'stock_h3po4', display: 'H₃PO₄', formula: 'H3PO4', percent: 85, density: 1.69 },
  { name: 'stock_acetate', display: 'CH₃COOH', formula: 'C2H4O2', percent: 99.7, density: 1.05 },
];

const MODES = ['stock', 'volume', 'normality', 'molality', 'ionic'];

export default function ReagentTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'stock');
  const [formula, setFormula] = useState(restored?.formula ?? 'HCl');
  const [percent, setPercent] = useState(restored?.percent != null ? String(restored.percent) : '37');
  const [density, setDensity] = useState(restored?.density != null ? String(restored.density) : '1.19');
  const [targetM, setTargetM] = useState(restored?.targetMolarity != null ? String(restored.targetMolarity) : '1');
  const [targetV, setTargetV] = useState(restored?.targetVolumeMl != null ? String(restored.targetVolumeMl) : '1000');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '1');
  const [nEq, setNEq] = useState(restored?.n != null ? String(restored.n) : '1');
  const [moles, setMoles] = useState(restored?.moles != null ? String(restored.moles) : '1');
  const [solventKg, setSolventKg] = useState(restored?.solventKg != null ? String(restored.solventKg) : '1');
  const [ions, setIons] = useState(restored?.ions ?? [{ conc: '0.1', charge: '1' }, { conc: '0.1', charge: '-1' }]);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [mode, formula, percent, density, targetM, targetV, molarity, nEq, moles, solventKg, ions]);

  function applyStock(s) {
    setFormula(s.formula);
    setPercent(String(s.percent));
    setDensity(String(s.density));
  }

  function run() {
    try {
      let r;
      let inputs;
      if (mode === 'stock') {
        inputs = { mode, percent: n(percent), density: n(density), formula };
        r = molarityFromPercent(inputs);
      } else if (mode === 'volume') {
        inputs = { mode, percent: n(percent), density: n(density), formula, targetMolarity: n(targetM), targetVolumeMl: n(targetV) };
        r = volumeForMolarity(inputs);
      } else if (mode === 'normality') {
        inputs = { mode, formula, molarity: n(molarity), n: n(nEq) };
        r = {
          normality: normality({ molarity: inputs.molarity, n: inputs.n }),
          equivalentWeight: equivalentWeight({ formula, n: inputs.n }),
        };
      } else if (mode === 'molality') {
        // Moles of solute, not molarity: molality is defined against the mass
        // of solvent, and there is no volume to convert from without a density.
        inputs = { mode, moles: n(moles), solventKg: n(solventKg) };
        const m = molality({ molesSolute: inputs.moles, solventKg: inputs.solventKg });
        r = {
          molality: m,
          // 1 kg of water is 55.51 mol; the mole fraction needs the solvent in
          // moles, and water is the solvent in every recipe this tool targets.
          moleFraction: moleFraction({ molesSolute: inputs.moles, molesSolvent: inputs.solventKg * 55.51 }),
        };
      } else {
        const parsed = ions.map((x) => ({ conc: n(x.conc), charge: n(x.charge) }));
        inputs = { mode, ions: parsed };
        const I = ionicStrength(parsed);
        r = {
          ionicStrength: I,
          gammaMono: activityCoefficient({ ionicStrength: I, charge: 1 }),
          gammaDi: activityCoefficient({ ionicStrength: I, charge: 2 }),
        };
      }
      setOut({ mode, ...r });
      setErr(null);
      onRecord({ kind: 'reagent', inputs, outputs: r, summary: recordSummary({ kind: 'reagent', inputs, outputs: r }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  // Tagging the result with the mode it was computed in, and gating the render
  // on that tag, is what stops a mode switch from painting the previous mode's
  // numbers under the new mode's labels for one frame.
  const shown = shownFor(out, 'mode', mode);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="reagent-mode">{t('reagent.mode')}</label>
        <select id="reagent-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`reagent.mode_${m}`)}</option>)}
        </select>
      </div>

      {(mode === 'stock' || mode === 'volume') && (
        <>
          <div className="stock-chips">
            {STOCKS.map((s) => (
              <button key={s.name} className="chip" onClick={() => applyStock(s)}>
                {`${t(`reagent.${s.name}`)} ${s.display} ${s.percent}%`}
              </button>
            ))}
          </div>
          <TextField label={t('common.formula')} value={formula} onChange={setFormula}
            hint={t('reagent.formulaHint')} />
          <div className="row">
            <NumField label={t('reagent.percent')} value={percent} onChange={setPercent} min="0" />
            <NumField label={t('reagent.density')} value={density} onChange={setDensity} min="0" hint={t('reagent.densityHint')} />
          </div>
        </>
      )}

      {mode === 'normality' && (
        // The formula has to be visible here: the equivalent weight is molar
        // mass ÷ n, and a number in g/eq with no compound attached to it is
        // unreadable — worse, it silently carries over whatever formula the
        // previous mode left behind.
        <TextField label={t('common.formula')} value={formula} onChange={setFormula}
          hint={t('reagent.formulaHint')} />
      )}

      {mode === 'volume' && (
        <div className="row">
          <NumField label={t('reagent.targetMolarity')} value={targetM} onChange={setTargetM} min="0" />
          <NumField label={t('reagent.targetVolume')} value={targetV} onChange={setTargetV} min="0" />
        </div>
      )}

      {mode === 'normality' && (
        <>
          <NumField label={t('reagent.molarity')} value={molarity} onChange={setMolarity} min="0" />
          <NumField label={t('reagent.equivalents')} value={nEq} onChange={setNEq} min="1" step="1"
            hint={t('reagent.equivalentsHint')} />
        </>
      )}

      {mode === 'molality' && (
        <>
          <NumField label={t('reagent.molesSolute')} value={moles} onChange={setMoles} min="0"
            hint={t('reagent.molesSoluteHint')} />
          <NumField label={t('reagent.solventMass')} value={solventKg} onChange={setSolventKg} min="0"
            hint={t('reagent.solventMassHint')} />
        </>
      )}

      {mode === 'ionic' && (
        <>
          <div className="ion-list">
            {ions.map((ion, i) => (
              // Ids are explicit: every row's concentration and charge field
              // carries the same label, so the derived id would collide and
              // leave all but the first row's label pointing at row 1.
              <div className="ion-row" key={i}>
                <NumField id={`ion-conc-${i}`} label={`${t('reagent.ionConc')} ${i + 1}`} value={ion.conc} min="0"
                  onChange={(v) => setIons(ions.map((x, j) => (j === i ? { ...x, conc: v } : x)))} />
                <NumField id={`ion-charge-${i}`} label={t('reagent.ionCharge')} value={ion.charge} step="1"
                  onChange={(v) => setIons(ions.map((x, j) => (j === i ? { ...x, charge: v } : x)))} />
                {ions.length > 1 && (
                  <button className="icon-btn ion-del" onClick={() => setIons(ions.filter((_, j) => j !== i))}
                    aria-label={t('reagent.removeIon')}>×</button>
                )}
              </div>
            ))}
          </div>
          <button className="control" onClick={() => setIons([...ions, { conc: '0.1', charge: '1' }])}>
            + {t('reagent.addIon')}
          </button>
        </>
      )}

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'stock' && (
        <Result value={fmt(shown.molarity, 2)} unit="mol/L"
          note={t('reagent.stockNote', { percent, density })}
          rows={[
            [t('reagent.gramsPerL'), `${fmt(shown.gramsPerL, 1)} g/L`],
            [t('common.molarMass'), `${fmt(shown.molarMass, 2)} g/mol`],
          ]} />
      )}

      {shown?.mode === 'volume' && (
        <Result value={fmt(shown.volumeMl, 2)} unit="mL"
          note={t('reagent.volumeNote', { molarity: targetM, volume: targetV })}
          rows={[
            [t('reagent.stockMolarity'), `${fmt(shown.stockMolarity, 2)} mol/L`],
            [t('reagent.volume'), `${fmt(shown.volumeMl, 3)} mL`],
          ]} />
      )}

      {shown?.mode === 'normality' && (
        <Result value={fmt(shown.normality, 3)} unit="N"
          note={t('reagent.normalityNote', { n: nEq })}
          rows={[
            [t('reagent.normality'), `${fmt(shown.normality, 4)} N`],
            [t('reagent.equivalentWeight'), `${fmt(shown.equivalentWeight, 3)} g/eq`],
          ]} />
      )}

      {shown?.mode === 'molality' && (
        <Result value={fmt(shown.molality, 4)} unit="mol/kg"
          note={t('reagent.molalityNote')}
          rows={[
            [t('reagent.molality'), `${fmt(shown.molality, 4)} mol/kg`],
            [t('reagent.moleFraction'), fmt(shown.moleFraction, 5)],
            [t('reagent.solventMoles'), `${fmt(n(solventKg) * 55.51, 2)} mol`],
          ]} />
      )}

      {shown?.mode === 'ionic' && (
        <Result value={fmt(shown.ionicStrength, 4)} unit="mol/L"
          note={t('reagent.ionicNote')}
          rows={[
            [t('reagent.ionicStrength'), `${fmt(shown.ionicStrength, 4)} mol/L`],
            [t('reagent.gammaMono'), fmt(shown.gammaMono, 4)],
            [t('reagent.gammaDi'), fmt(shown.gammaDi, 4)],
          ]} />
      )}

      {mode === 'ionic' && <Warn>{t('reagent.ionicWarning')}</Warn>}
    </div>
  );
}
