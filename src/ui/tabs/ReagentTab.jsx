import React, { useState, useEffect, useMemo } from 'react';
import {
  molarityFromPercent, volumeForMolarity, normality, equivalentWeight,
  molality, moleFraction, ionicStrength, activityCoefficient,
} from '../../calc/reagent.mjs';
import { molarMass } from '../../calc/solution.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
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

  /*
   * The arithmetic, spelled out.
   *
   * Every mode here reduces to one substituted formula, and each is a place
   * where a user can see that the tool used the number they typed — the
   * density and percentage in particular are the two values people most often
   * leave at the default and then wonder about the answer.
   */
  const worked = useMemo(() => {
    if (!shown) return null;
    if (mode === 'stock') {
      return [
        { term: t('common.worked_StockMolarity'), value: '' },
        {
          term: 'C',
          value: t('common.worked_StockStep', {
            density: fmt(n(density), 4),
            percent: fmt(n(percent), 4),
            molarMass: fmt(shown.molarMass ?? 0, 4),
            conc: fmtSci(shown.molarity ?? 0, 4),
          }),
        },
        {
          term: t('reagent.gramsPerL'),
          value: t('common.worked_GramsPerL', {
            density: fmt(n(density), 4),
            percent: fmt(n(percent), 4),
            grams: fmt(shown.gramsPerL ?? 0, 4),
          }),
        },
      ];
    }
    if (mode === 'volume') {
      return [
        { term: t('common.worked_StockVolume'), value: '' },
        {
          term: 'V₁',
          value: t('common.worked_StockVolumeStep', {
            target: fmtSci(n(targetM), 4),
            targetVol: fmt(n(targetV), 4),
            stock: fmt(shown.stockMolarity ?? 0, 4),
            vol: fmt(shown.volumeMl ?? 0, 4),
          }),
        },
      ];
    }
    if (mode === 'normality') {
      const M = (() => { try { return molarMass(formula); } catch { return 0; } })();
      return [
        {
          term: 'N',
          value: t('common.worked_Normality', {
            conc: fmtSci(n(molarity), 4),
            n: fmt(n(nEq), 4),
            normality: fmt(shown.normality ?? 0, 4),
          }),
        },
        {
          term: t('reagent.equivalentWeight'),
          value: t('common.worked_EquivalentWeight', {
            molarMass: fmt(M, 4),
            n: fmt(n(nEq), 4),
            eq: fmt(shown.equivalentWeight ?? 0, 4),
          }),
        },
      ];
    }
    if (mode === 'molality') {
      const solventMoles = n(solventKg) * 55.51;
      return [
        {
          term: 'm',
          value: t('common.worked_Molality', {
            moles: fmtSci(n(moles), 4),
            solvent: fmtSci(n(solventKg), 4),
            molality: fmtSci(shown.molality ?? 0, 4),
          }),
        },
        {
          term: 'x',
          value: t('common.worked_MoleFraction', {
            moles: fmtSci(n(moles), 4),
            solventMoles: fmtSci(solventMoles, 4),
            x: fmtSci(shown.moleFraction ?? 0, 4),
          }),
        },
      ];
    }
    // Ionic strength: the sum inside the ½ is 2I by construction.
    return [
      { term: t('common.worked_Ionic'), value: '' },
      {
        term: 'I',
        value: t('common.worked_IonicStep', {
          sum: fmtSci((shown.ionicStrength ?? 0) * 2, 4),
          I: fmtSci(shown.ionicStrength ?? 0, 4),
        }),
      },
    ];
  }, [shown, mode, density, percent, targetM, targetV, molarity, nEq, moles, solventKg, formula, t]);

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
        /* Bounded: this is the molarity of a concentrated stock, so the
           percentage input floors it around 1 M. fmt is correct here. */
        <Result value={fmt(shown.molarity, 2)} unit="mol/L"
          note={t('reagent.stockNote', { percent, density })}
          worked={worked} workedLabel={t('common.worked')}
          rows={[
            [t('reagent.gramsPerL'), `${fmt(shown.gramsPerL, 1)} g/L`],
            [t('common.molarMass'), `${fmt(shown.molarMass, 2)} g/mol`],
          ]} />
      )}

      {shown?.mode === 'volume' && (
        <Result value={fmt(shown.volumeMl, 2)} unit="mL"
          note={t('reagent.volumeNote', { molarity: targetM, volume: targetV })}
          worked={worked} workedLabel={t('common.worked')}
          rows={[
            [t('reagent.stockMolarity'), `${fmt(shown.stockMolarity, 2)} mol/L`],
            [t('reagent.volume'), `${fmt(shown.volumeMl, 3)} mL`],
          ]} />
      )}

      {shown?.mode === 'normality' && (
        <Result value={fmt(shown.normality, 3)} unit="N"
          note={t('reagent.normalityNote', { n: nEq })}
          worked={worked} workedLabel={t('common.worked')}
          rows={[
            [t('reagent.normality'), `${fmt(shown.normality, 4)} N`],
            [t('reagent.equivalentWeight'), `${fmt(shown.equivalentWeight, 3)} g/eq`],
          ]} />
      )}

      {shown?.mode === 'molality' && (
        <Result value={fmtSci(shown.molality, 4)} unit="mol/kg"
          note={t('reagent.molalityNote')}
          worked={worked} workedLabel={t('common.worked')}
          rows={[
            [t('reagent.molality'), `${fmtSci(shown.molality, 4)} mol/kg`],
            [t('reagent.moleFraction'), fmtSci(shown.moleFraction, 5)],
            [t('reagent.solventMoles'), `${fmtSci(n(solventKg) * 55.51, 3)} mol`],
          ]} />
      )}

      {shown?.mode === 'ionic' && (
        <Result value={fmtSci(shown.ionicStrength, 4)} unit="mol/L"
          note={t('reagent.ionicNote')}
          worked={worked} workedLabel={t('common.worked')}
          rows={[
            [t('reagent.ionicStrength'), `${fmtSci(shown.ionicStrength, 4)} mol/L`],
            [t('reagent.gammaMono'), fmt(shown.gammaMono, 4)],
            [t('reagent.gammaDi'), fmt(shown.gammaDi, 4)],
          ]} />
      )}

      {mode === 'ionic' && <Warn>{t('reagent.ionicWarning')}</Warn>}
    </div>
  );
}
