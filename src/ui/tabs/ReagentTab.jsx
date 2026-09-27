import React, { useState, useEffect, useMemo } from 'react';
import {
  molarityFromPercent, volumeForMolarity, normality, equivalentWeight,
  molality, moleFraction, ionicStrength, activityCoefficient, withinDaviesRange,
} from '../../calc/reagent.mjs';
import { molarMass } from '../../calc/solution.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { UncertaintyPanel } from '../components/UncertaintyPanel.jsx';
import { fmt, fmtSci, fmtMeasured, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';
import { glasswareUncertainty } from '../../calc/instruments.mjs';
import { productUncertainty } from '../../calc/uncertainty.mjs';

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

  /*
   * The glassware, collapsed by default.
   *
   * Only the `volume` mode has a budget: it is the one that answers "pipette
   * this much stock into a flask", and it is the same calculation as the
   * dilution tab's — a volume delivered by a pipette into a made-up volume.
   * The other modes return a concentration, a normality or an ionic strength
   * from values the user supplied as *premises*, and a budget there would have
   * to invent an instrument.
   */
  const [uncOpen, setUncOpen] = useState(false);
  /*
   * Which instrument delivers the stock, and how big it is.
   *
   * Not fixed to a pipette: a stock volume here routinely runs past 25 mL —
   * the default inputs ask for 82.8 mL — and a pipette cannot deliver that.
   * Charging a 25 mL pipette's tolerance to an 82.8 mL transfer reports 0.069%
   * for a measurement that would actually take four pipettings, which is both
   * wrong and wrong in the direction that flatters the result.
   *
   * The tab does not pretend to know how the user would split it, so it offers
   * the instrument that can do it in one go and warns when the chosen one
   * cannot.
   */
  const [deliver, setDeliver] = useState('pipette');
  const [pipetteMl, setPipetteMl] = useState('25');
  const [flaskMl, setFlaskMl] = useState('100');
  const [flaskGrade, setFlaskGrade] = useState('A');
  const [tempC, setTempC] = useState('20');
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
          // Past I ≈ 0.5 the Davies fit is extrapolating and γ climbs above 1,
          // which is physically impossible for a correction factor. The number
          // is still shown, but the user is told not to trust it.
          activityOutOfRange: !withinDaviesRange(I),
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
   * The budget on the stock volume.
   *
   *   V_stock = (C_target × V_target) / C_stock
   *
   * The pipette delivers the stock and the flask makes up the final volume, so
   * both belong — the same two terms as the dilution tab, which is the same
   * operation reached from a different direction.
   *
   * The stock's own concentration carries nothing here, and that is a choice
   * worth naming: it comes from a published density and weight percentage,
   * which are *catalogue values* rather than measurements this user made. A
   * real budget would have to include them — a 37% HCl bottle is 36-38% — but
   * the figure would be a guess about the bottle, and the caveat says so
   * instead of putting a made-up number on screen.
   */
  const budget = useMemo(() => {
    if (!shown || shown.mode !== 'volume') return null;
    try {
      const pipette = glasswareUncertainty({
        kind: deliver, nominalMl: n(pipetteMl), grade: flaskGrade, temperatureC: n(tempC),
      });
      const flask = glasswareUncertainty({
        kind: 'flask', nominalMl: n(flaskMl), grade: flaskGrade, temperatureC: n(tempC),
      });
      const combined = productUncertainty([
        { value: shown.volumeMl, unc: pipette.unc, power: 1 },
        { value: n(targetV), unc: flask.unc, power: 1 },
      ]);
      /*
       * Whether the chosen instrument can deliver the volume at all.
       *
       * Reported rather than folded in. A tolerance table describes an
       * instrument of a given size; applying it to a transfer the instrument
       * cannot make in one go is not a bigger uncertainty, it is a different
       * procedure — and the honest thing is to say which.
       */
      const overCapacity = shown.volumeMl > n(pipetteMl);
      const kindName = t(deliver === 'burette' ? 'unc.uncDeliverBurette' : 'unc.uncDeliverPipette');
      return {
        pipette,
        flask,
        combined,
        overCapacity,
        // The panel names its own row; this tab's instrument is not always the
        // pipette that label assumes.
        pipetteLabel: `${kindName} · ${fmt(n(pipetteMl), 0)} mL`,
        delivered: { value: shown.volumeMl, unc: pipette.unc },
        relative: combined.value === 0 ? 0 : combined.unc / combined.value,
      };
    } catch {
      return null;
    }
  }, [shown, deliver, pipetteMl, flaskMl, flaskGrade, tempC, targetV]);

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
    <Card>
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
        <>
          <Result value={fmt(shown.volumeMl, 2)} unit="mL"
            note={t('reagent.volumeNote', { molarity: targetM, volume: targetV })}
            unc={uncOpen && budget ? {
              ...fmtMeasured(budget.delivered.value, budget.delivered.unc, { unit: ' mL' }),
              detail: `${t('unc.uncRelative')} ${fmtSci(budget.relative * 100, 3)}%`,
            } : null}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('reagent.stockMolarity'), `${fmt(shown.stockMolarity, 2)} mol/L`],
              [t('reagent.volume'), `${fmt(shown.volumeMl, 3)} mL`],
            ]} />
          <UncertaintyPanel
            open={uncOpen}
            onToggle={() => setUncOpen((v) => !v)}
            budget={budget}
            balance={false}
            state={{ flaskMl, setFlaskMl, flaskGrade, setFlaskGrade, tempC, setTempC,
              pipetteMl, setPipetteMl }}
            pipetteSizeLabel={t(deliver === 'burette' ? 'unc.uncBuretteSize' : 'unc.uncPipetteSize')}
            fields={(
              <label className="field">
                <span className="field-label">{t('unc.uncDeliverInstrument')}</span>
                <select value={deliver} onChange={(e) => setDeliver(e.target.value)}>
                  <option value="pipette">{t('unc.uncDeliverPipette')}</option>
                  <option value="burette">{t('unc.uncDeliverBurette')}</option>
                </select>
              </label>
            )}
          />

          {/* Outside the panel: it is a statement about the procedure, not a
              contribution to the budget, and the panel's list is a <dl> whose
              only legal children are <dt>/<dd> pairs. */}
          {uncOpen && budget?.overCapacity && (
            <Warn>
              {t('unc.uncDeliverCapacity', {
                size: fmt(n(pipetteMl), 0),
                kind: t(deliver === 'burette' ? 'unc.uncDeliverBurette' : 'unc.uncDeliverPipette'),
                volume: fmt(budget.delivered.value, 1),
              })}
            </Warn>
          )}
        </>
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
      {/* Only when the numbers above are actually shown, and only when the
          fit has left its range — a warning on every ionic calculation would
          be read once and then ignored. */}
      {mode === 'ionic' && shown?.activityOutOfRange && (
        <Warn>{t('reagent.activityOutOfRange', { max: '0.5' })}</Warn>
      )}
    </Card>
  );
}
