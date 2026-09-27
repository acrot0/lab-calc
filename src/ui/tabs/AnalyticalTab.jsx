import React, { useState, useMemo } from 'react';
import {
  EDTA_FORMATION, conditionalLogK, edtaTitration, gravimetricFactor,
  gravimetricPercent, recoveryBias, redoxEquivalence, spikeRecovery,
} from '../../calc/analytical.mjs';
import { detectionLimit, resolution, theoreticalPlates } from '../../calc/instrumental.mjs';
import { NumField, TextField, Result, Err, Warn } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

const MODES = ['edta', 'redox', 'gravimetric', 'recovery', 'lod', 'chromatography'];

/** The metals the conditional-constant table covers, in the order shown. */
const METALS = Object.keys(EDTA_FORMATION);

/**
 * Parse a comma-separated list of numbers, reporting anything unreadable.
 *
 * Separate from the stats tab's version because the two differ in what they do
 * with a bad entry: there it is a whole column, here it is a short list of
 * replicates, and the error names the offending value either way.
 */
function parseNumbers(text) {
  const parts = String(text ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const values = [];
  const bad = [];
  for (const p of parts) {
    const v = Number(p);
    if (Number.isFinite(v)) values.push(v); else bad.push(p);
  }
  return { values, bad };
}

export default function AnalyticalTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'edta');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  // EDTA
  const [metal, setMetal] = useState(restored?.metal ?? 'Ca');
  const [edtaPh, setEdtaPh] = useState(restored?.edtaPh ?? '10');
  const [edtaConc, setEdtaConc] = useState(restored?.edtaConc ?? '0.01');
  const [edtaVol, setEdtaVol] = useState(restored?.edtaVol ?? '25');
  const [sampleVol, setSampleVol] = useState(restored?.sampleVol ?? '50');

  // Redox
  const [e1, setE1] = useState(restored?.e1 ?? '1.51');
  const [n1, setN1] = useState(restored?.n1 ?? '5');
  const [e2, setE2] = useState(restored?.e2 ?? '0.771');
  const [n2, setN2] = useState(restored?.n2 ?? '1');

  // Gravimetric
  const [sought, setSought] = useState(restored?.sought ?? 'Fe');
  const [weighed, setWeighed] = useState(restored?.weighed ?? 'Fe2O3');
  const [soughtCount, setSoughtCount] = useState(restored?.soughtCount ?? '2');
  const [sampleMass, setSampleMass] = useState(restored?.sampleMass ?? '0.5');
  const [pptMass, setPptMass] = useState(restored?.pptMass ?? '0.25');

  // Recovery
  const [recoveries, setRecoveries] = useState(
    restored?.recoveries ?? '98.2, 97.5, 99.1, 98.8, 98.4',
  );
  const [unspiked, setUnspiked] = useState(restored?.unspiked ?? '10.0');
  const [spiked, setSpiked] = useState(restored?.spiked ?? '14.9');
  const [added, setAdded] = useState(restored?.added ?? '5.0');

  // Detection limit
  const [blanks, setBlanks] = useState(
    restored?.blanks ?? '0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001',
  );
  const [slope, setSlope] = useState(restored?.slope ?? '0.05');
  const [slopeSe, setSlopeSe] = useState(restored?.slopeSe ?? '0.001');

  // Chromatography
  const [t1, setT1] = useState(restored?.t1 ?? '5.0');
  const [t2, setT2] = useState(restored?.t2 ?? '6.2');
  const [w1, setW1] = useState(restored?.w1 ?? '0.5');
  const [w2, setW2] = useState(restored?.w2 ?? '0.6');

  const parsedRecoveries = useMemo(() => parseNumbers(recoveries), [recoveries]);
  const parsedBlanks = useMemo(() => parseNumbers(blanks), [blanks]);

  function run() {
    try {
      const result = compute();
      setOut(result);
      setErr(null);
      onRecord({
        kind: 'analytical',
        inputs: { mode },
        outputs: result.record ?? {},
        summary: recordSummary({ kind: 'analytical', inputs: { mode }, outputs: result.record ?? {} }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  function compute() {
    if (mode === 'edta') {
      const cond = conditionalLogK({ metal, pH: n(edtaPh) });
      const tit = edtaTitration({
        titrantConc: n(edtaConc),
        titrantVolumeMl: n(edtaVol),
        sampleVolumeMl: n(sampleVol),
        metal,
      });
      return { mode, cond, tit, record: { conditionalLogK: cond.conditionalLogK, sampleConc: tit.sampleConc } };
    }
    if (mode === 'redox') {
      const eq = redoxEquivalence({
        halfCell1: { potential: n(e1), electrons: Number(n1), label: t('analytical.oxidant') },
        halfCell2: { potential: n(e2), electrons: Number(n2), label: t('analytical.reductant') },
      });
      return { mode, eq, record: { potential: eq.potential } };
    }
    if (mode === 'gravimetric') {
      const f = gravimetricFactor({
        sought, weighed, soughtCount: Number(soughtCount),
      });
      const pct = gravimetricPercent({
        sampleMassG: n(sampleMass), precipitateMassG: n(pptMass), factor: f.factor,
      });
      return { mode, f, pct, record: { factor: f.factor, percent: pct.percent } };
    }
    if (mode === 'recovery') {
      const bias = recoveryBias({ recoveries: parsedRecoveries.values });
      const spike = spikeRecovery({
        unspiked: n(unspiked), spiked: n(spiked), added: n(added),
      });
      return { mode, bias, spike, record: { mean: bias.mean, recovery: spike.recovery } };
    }
    if (mode === 'lod') {
      const lod = detectionLimit({
        blankReadings: parsedBlanks.values,
        slope: n(slope),
        slopeStdError: slopeSe.trim() ? n(slopeSe) : null,
      });
      return { mode, lod, record: { lod: lod.lod, loq: lod.loq } };
    }
    if (mode === 'chromatography') {
      const res = resolution({ t1: n(t1), t2: n(t2), w1: n(w1), w2: n(w2) });
      const plates = theoreticalPlates({ retentionTime: n(t1), width: n(w1), widthBasis: 'baseline' });
      return { mode, res, plates, record: { resolution: res.resolution, plates: plates.plates } };
    }
    return { mode };
  }

  /*
   * The working, one derivation per mode.
   *
   * Six modes share one result panel, so this is the longest of the four tabs
   * that were missing it — and the one where the gap was widest, because the
   * modes disagree about what the number even means. A resolution of 1.5 and a
   * recovery of 98% are both unitless percentages of a sort, and neither is
   * interpretable without the formula that produced it.
   *
   * Each derivation opens with the symbolic form, which is what the user would
   * write on paper, and then substitutes. That order matters: a substitution
   * with no formula above it is a calculation nobody can check.
   */
  const worked = useMemo(() => {
    if (!out) return null;
    if (out.mode === 'edta') {
      /* Bounded: v/vs are bench-scale mL, never trace. */
      return [
        { term: t('common.formula'), value: t('common.worked_EdtaConc', {
          c: fmtSci(n(edtaConc), 5), v: fmt(n(edtaVol), 5), vs: fmt(n(sampleVol), 5),
        }) },
        { term: t('analytical.alphaY'), value: t('common.worked_EdtaAlpha', {
          ph: fmt(n(edtaPh), 4), alpha: fmtSci(out.cond.alpha, 4),
        }) },
        { term: t('analytical.conditionalLogK'), value: t('common.worked_EdtaConditional', {
          logK: fmt(out.cond.logK, 3), alpha: fmtSci(out.cond.alpha, 4),
          cond: fmt(out.cond.conditionalLogK, 3),
        }) },
        /* Bounded: bench-scale volume, as above. */
        { term: t('analytical.moles'), value: t('common.worked_EdtaMoles', {
          conc: fmtSci(n(edtaConc), 5), vol: fmt(n(edtaVol), 5),
          moles: fmtSci(out.tit.molesMetal, 4),
        }) },
      ];
    }
    if (out.mode === 'redox') {
      const sum = Number(n1) + Number(n2);
      return [
        { term: t('common.formula'), value: t('common.worked_RedoxPotential', {
          n1: fmt(Number(n1), 0), e1: fmt(n(e1), 4),
          n2: fmt(Number(n2), 0), e2: fmt(n(e2), 4),
          sum: fmt(sum, 0),
        }) },
        { term: t('analytical.naiveMean'), value: t('common.worked_RedoxNaive', {
          naive: fmt(out.eq.naiveMean, 4),
        }) },
      ];
    }
    if (out.mode === 'gravimetric') {
      return [
        { term: t('common.formula'), value: t('common.worked_GravFactor', {
          mSought: fmt(out.f.molarMassSought, 4),
          mWeighed: fmt(out.f.molarMassWeighed, 4),
          factor: fmt(out.f.factor, 6),
        }) },
        { term: t('analytical.analyteMass'), value: t('common.worked_GravAnalyte', {
          mppt: fmt(n(pptMass), 5), factor: fmt(out.f.factor, 6),
          mass: fmtSci(out.pct.analyteMassG, 6),
        }) },
        { term: t('analytical.analyteMass'), value: t('common.worked_GravPercent', {
          mass: fmtSci(out.pct.analyteMassG, 6), sample: fmtSci(n(sampleMass), 5),
          pct: fmt(out.pct.percent, 5),
        }) },
      ];
    }
    if (out.mode === 'recovery') {
      return [
        { term: t('common.formula'), value: t('common.worked_Recovery', {
          spiked: fmt(n(spiked), 5), unspiked: fmt(n(unspiked), 5), added: fmt(n(added), 5),
        }) },
        { term: t('analytical.recoveryMean'), value: t('common.worked_RecoveryMean', {
          mean: fmt(out.bias.mean, 5), sd: fmt(out.bias.sd, 5),
        }) },
      ];
    }
    if (out.mode === 'lod') {
      const steps = [
        { term: t('common.formula'), value: t('common.worked_LodBlank', {
          mean: fmtSci(out.lod.blankMean, 4), sd: fmtSci(out.lod.blankSd, 4), n: out.lod.n,
        }) },
        { term: 'LOD', value: t('common.worked_LodSd', {
          sd: fmtSci(out.lod.blankSd, 4), slope: fmt(n(slope), 5), lod: fmtSci(out.lod.lod, 4),
        }) },
        { term: 'LOQ', value: t('common.worked_LoqSd', {
          sd: fmtSci(out.lod.blankSd, 4), slope: fmt(n(slope), 5), loq: fmtSci(out.lod.loq, 4),
        }) },
      ];
      return steps;
    }
    if (out.mode === 'chromatography') {
      return [
        { term: t('common.formula'), value: t('common.worked_Resolution', {
          t1: fmt(n(t1), 4), t2: fmt(n(t2), 4),
          w1: fmt(n(w1), 4), w2: fmt(n(w2), 4), r: fmt(out.res.resolution, 4),
        }) },
        { term: t('analytical.plates'), value: t('common.worked_Plates', {
          tr: fmt(n(t1), 4), w: fmt(n(w1), 4), n: fmt(out.plates.plates, 0),
        }) },
      ];
    }
    return null;
  }, [out, t, edtaConc, edtaVol, sampleVol, edtaPh, e1, e2, n1, n2, pptMass, sampleMass, spiked, unspiked, added, slope, t1, t2, w1, w2]);

  return (
    <Card>
      <div className="field">
        <label htmlFor="analytical-mode">{t('analytical.mode')}</label>
        <select id="analytical-mode" value={mode} onChange={(e) => { setMode(e.target.value); setOut(null); setErr(null); }}>
          {MODES.map((m) => <option key={m} value={m}>{t(`analytical.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode === 'edta' && (
        <>
          <div className="field">
            <label htmlFor="edta-metal">{t('analytical.metal')}</label>
            <select id="edta-metal" value={metal} onChange={(e) => setMetal(e.target.value)}>
              {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <NumField label={t('analytical.ph')} value={edtaPh} onChange={setEdtaPh}
            hint={t('analytical.phHint')} />
          <NumField label={t('analytical.titrantConc')} value={edtaConc} onChange={setEdtaConc} min="0" />
          <NumField label={t('analytical.titrantVol')} value={edtaVol} onChange={setEdtaVol} min="0" />
          <NumField label={t('analytical.sampleVol')} value={sampleVol} onChange={setSampleVol} min="0" />
        </>
      )}

      {mode === 'redox' && (
        <>
          <NumField label={t('analytical.oxidantE')} value={e1} onChange={setE1}
            hint={t('analytical.potentialHint')} />
          <NumField label={t('analytical.oxidantN')} value={n1} onChange={setN1} min="1" />
          <NumField label={t('analytical.reductantE')} value={e2} onChange={setE2} />
          <NumField label={t('analytical.reductantN')} value={n2} onChange={setN2} min="1" />
        </>
      )}

      {mode === 'gravimetric' && (
        <>
          <TextField label={t('analytical.sought')} value={sought} onChange={setSought}
            hint={t('analytical.formulaHint')} />
          <NumField label={t('analytical.soughtCount')} value={soughtCount} onChange={setSoughtCount} min="1" />
          <TextField label={t('analytical.weighed')} value={weighed} onChange={setWeighed}
            hint={t('analytical.formulaHint')} />
          <NumField label={t('analytical.sampleMass')} value={sampleMass} onChange={setSampleMass} min="0" />
          <NumField label={t('analytical.pptMass')} value={pptMass} onChange={setPptMass} min="0" />
        </>
      )}

      {mode === 'recovery' && (
        <>
          <TextField
            label={t('analytical.recoveries')} value={recoveries} onChange={setRecoveries} rows={3}
            hint={t('analytical.recoveriesHint')}
            error={parsedRecoveries.bad.length
              ? t('stats.badNumbers', { values: parsedRecoveries.bad.join(', ') }) : null}
          />
          <NumField label={t('analytical.unspiked')} value={unspiked} onChange={setUnspiked} />
          <NumField label={t('analytical.spiked')} value={spiked} onChange={setSpiked} />
          <NumField label={t('analytical.added')} value={added} onChange={setAdded} min="0" />
        </>
      )}

      {mode === 'lod' && (
        <>
          <TextField
            label={t('analytical.blanks')} value={blanks} onChange={setBlanks} rows={3}
            hint={t('analytical.blanksHint')}
            error={parsedBlanks.bad.length
              ? t('stats.badNumbers', { values: parsedBlanks.bad.join(', ') }) : null}
          />
          <NumField label={t('analytical.slope')} value={slope} onChange={setSlope} min="0"
            hint={t('analytical.slopeHint')} />
          <NumField label={t('analytical.slopeSe')} value={slopeSe} onChange={setSlopeSe} min="0"
            hint={t('analytical.slopeSeHint')} />
        </>
      )}

      {mode === 'chromatography' && (
        <>
          <NumField label={t('analytical.t1')} value={t1} onChange={setT1} min="0" />
          <NumField label={t('analytical.t2')} value={t2} onChange={setT2} min="0" />
          <NumField label={t('analytical.w1')} value={w1} onChange={setW1} min="0" />
          <NumField label={t('analytical.w2')} value={w2} onChange={setW2} min="0" />
        </>
      )}

      <button className="primary" onClick={run}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {out?.mode === 'edta' && (
        <>
          <Result
            value={fmt(out.tit.sampleMm, 5)}
            unit="mmol/L"
            note={t('analytical.edtaNote', { logK: fmt(out.cond.conditionalLogK, 3) })}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.logK'), fmt(out.cond.logK, 3)],
              [t('analytical.alphaY'), fmtSci(out.cond.alpha, 4)],
              [t('analytical.conditionalLogK'), fmt(out.cond.conditionalLogK, 3)],
              [t('analytical.moles'), `${fmtSci(out.tit.molesMetal, 4)} mol`],
              ...(out.tit.massConcGPerL !== undefined
                ? [[t('analytical.massConc'), `${fmtSci(out.tit.massConcGPerL, 5)} g/L`]]
                : []),
            ]}
          />
          {!out.cond.sharp && <Warn>{t('analytical.notSharp', { logK: fmt(out.cond.conditionalLogK, 3) })}</Warn>}
          {!out.cond.valid && <Warn>{t('analytical.phTooHigh')}</Warn>}
        </>
      )}

      {out?.mode === 'redox' && (
        <>
          <Result
            value={fmt(out.eq.potential, 4)}
            unit="V"
            note={t('analytical.redoxNote', {
              n1: out.eq.electrons1, n2: out.eq.electrons2,
            })}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.naiveMean'), `${fmt(out.eq.naiveMean, 4)} V`],
              [t('analytical.difference'), `${fmt((out.eq.potential - out.eq.naiveMean) * 1000, 4)} mV`],
            ]}
          />
          {!out.eq.symmetric && <Warn>{t('analytical.asymmetric')}</Warn>}
        </>
      )}

      {out?.mode === 'gravimetric' && (
        <>
          <Result
            value={fmt(out.pct.percent, 5)}
            unit="%"
            note={t('analytical.gravimetricNote', { ratio: out.f.ratio })}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.factor'), fmt(out.f.factor, 6)],
              [t('analytical.analyteMass'), `${fmtSci(out.pct.analyteMassG, 6)} g`],
              [t('analytical.mSought'), `${fmt(out.f.molarMassSought, 4)} g/mol`],
              [t('analytical.mWeighed'), `${fmt(out.f.molarMassWeighed, 4)} g/mol`],
            ]}
          />
        </>
      )}

      {out?.mode === 'recovery' && (
        <>
          <Result
            value={fmt(out.spike.recovery, 4)}
            unit="%"
            note={out.spike.acceptable ? t('analytical.recoveryOk') : t('analytical.recoveryBad')}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.found'), fmt(out.spike.found, 5)],
              [t('analytical.added'), fmt(out.spike.added, 5)],
              [t('analytical.recoveryMean'), `${fmt(out.bias.mean, 5)}%`],
              [t('analytical.recoverySd'), `${fmt(out.bias.sd, 5)}%`],
            ]}
          />
          {out.bias.biased
            ? (
              <Warn>
                {t('analytical.biasFound', {
                  bias: fmt(out.bias.percentBias, 3),
                  t: fmt(out.bias.t, 4),
                  crit: fmt(out.bias.critical, 4),
                })}
              </Warn>
            )
            : <div className="hint">{t('analytical.noBias', { t: fmt(out.bias.t, 4) })}</div>}
        </>
      )}

      {out?.mode === 'lod' && (
        <>
          <Result
            value={fmtSci(out.lod.lod, 4)}
            unit={t('analytical.concUnit')}
            note={t('analytical.lodNote', { loq: fmtSci(out.lod.loq, 4) })}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.blankMean'), fmtSci(out.lod.blankMean, 4)],
              [t('analytical.blankSd'), fmtSci(out.lod.blankSd, 4)],
              [t('analytical.nBlanks'), String(out.lod.n)],
            ]}
          />
          {!out.lod.replicatesAdequate && <Warn>{t('analytical.fewBlanks', { n: out.lod.n })}</Warn>}
          {!out.lod.slopeSupported && <Warn>{t('analytical.slopeUnsupported')}</Warn>}
          {out.lod.note === 'zeroBlankSpread' && <Warn>{t('analytical.zeroSpread')}</Warn>}
        </>
      )}

      {out?.mode === 'chromatography' && (
        <>
          <Result
            value={fmt(out.res.resolution, 4)}
            note={out.res.baselineResolved
              ? t('analytical.resolved')
              : out.res.marginal ? t('analytical.marginal') : t('analytical.merged')}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('analytical.plates'), fmt(out.plates.plates, 0)],
              [t('analytical.t1'), fmt(n(t1), 4)],
              [t('analytical.t2'), fmt(n(t2), 4)],
            ]}
          />
          {!out.res.baselineResolved && <Warn>{t('analytical.notResolved')}</Warn>}
        </>
      )}
    </Card>
  );
}
