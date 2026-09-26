import React, { useState, useMemo } from 'react';
import {
  arrhenius, concentrationAt, crossoverTemperature, degreeOfDissociation,
  equilibriumConstant, eutectic, fitOrder, gibbsEnergy, halfLife,
  molarConductivity, ostwaldDilutionLaw,
} from '../../calc/physical.mjs';
import { NumField, TextField, Result, Err, Warn } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';
import PhaseDiagram from '../components/PhaseDiagram.jsx';

const MODES = ['kinetics', 'arrhenius', 'conductivity', 'thermo', 'phase'];

/**
 * Parse "x, y" pairs, one per line.
 *
 * The same shape `SpectroTab` uses for standard points, so a user who has
 * entered data in one tab can paste it into the other. Blank lines are skipped
 * rather than reported: a trailing newline is how a textarea ends, not a
 * mistake worth a message.
 */
function parsePairs(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const pairs = [];
  const bad = [];
  for (const line of lines) {
    const parts = line.split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== 2) { bad.push(line); continue; }
    const [a, b] = parts.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) pairs.push([a, b]); else bad.push(line);
  }
  return { pairs, bad };
}

export default function PhysicalTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'kinetics');
  const [err, setErr] = useState(null);
  const [out, setOut] = useState(null);

  // Kinetics
  const [kinPoints, setKinPoints] = useState(restored?.kinPoints ?? '0, 1.00\n10, 0.82\n20, 0.67\n30, 0.55\n40, 0.45');
  const [kinTime, setKinTime] = useState(restored?.kinTime ?? '60');

  // Arrhenius
  const [arrPoints, setArrPoints] = useState(restored?.arrPoints ?? '20, 0.0012\n30, 0.0035\n40, 0.0094\n50, 0.0235');

  // Conductivity
  /*
   * The defaults are acetic acid at 0.001 M, whose numbers are self-consistent:
   * 0.0486 mS/cm against a limiting value of 390.7 S·cm²/mol gives α = 0.124
   * and pKa 4.75, against a literature 4.76.
   *
   * They used to be 1.25 mS/cm against a limiting value of 1250, which are not
   * independent numbers — the first computes to a molar conductivity of exactly
   * 1250, so α came out at exactly 1 and Ostwald's law divided by zero. The tab
   * failed on its own defaults before the user had typed anything.
   */
  const [condConc, setCondConc] = useState(restored?.condConc ?? '0.001');
  const [condKappa, setCondKappa] = useState(restored?.condKappa ?? '0.0486');
  const [limiting, setLimiting] = useState(restored?.limiting ?? '390.7');

  // Thermodynamics
  const [deltaH, setDeltaH] = useState(restored?.deltaH ?? '-50');
  const [deltaS, setDeltaS] = useState(restored?.deltaS ?? '-100');
  const [tempC, setTempC] = useState(restored?.tempC ?? '25');

  // Phase
  const [compA, setCompA] = useState(restored?.compA ?? '80.2, 19.0');
  const [compB, setCompB] = useState(restored?.compB ?? '5.5, 9.87');

  const parsedKin = useMemo(() => parsePairs(kinPoints), [kinPoints]);
  const parsedArr = useMemo(() => parsePairs(arrPoints), [arrPoints]);

  /*
   * The mode's inputs are parsed for errors before anything runs, so a bad line
   * is reported next to the field rather than as a failure of the whole
   * calculation. A user who mistyped one of eight points should not have to
   * work out which.
   */
  const modeError = useMemo(() => {
    if (mode === 'kinetics' && parsedKin.bad.length) {
      return t('physical.badLines', { lines: parsedKin.bad.join(' / ') });
    }
    if (mode === 'arrhenius' && parsedArr.bad.length) {
      return t('physical.badLines', { lines: parsedArr.bad.join(' / ') });
    }
    return null;
  }, [mode, parsedKin.bad, parsedArr.bad, t]);

  function run() {
    try {
      const result = compute();
      setOut(result);
      setErr(null);
      onRecord({
        kind: 'physical',
        inputs: { mode },
        outputs: result.record ?? {},
        summary: recordSummary({ kind: 'physical', inputs: { mode }, outputs: result.record ?? {} }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  /** Dispatch to the module for the active mode, returning a display shape. */
  function compute() {
    if (mode === 'kinetics') {
      const points = parsedKin.pairs.map(([tt, c]) => ({ t: tt, c }));
      const fit = fitOrder(points);
      const at = concentrationAt({
        order: fit.order, k: fit.k, initial: points[0].c, time: n(kinTime),
      });
      return {
        mode,
        fit,
        at,
        tHalf: halfLife({ order: fit.order, k: fit.k, initial: points[0].c }),
        record: { order: fit.order, k: fit.k, r2: fit.r2 },
      };
    }
    if (mode === 'arrhenius') {
      const points = parsedArr.pairs.map(([tc, k]) => ({ tempC: tc, k }));
      const fit = arrhenius(points);
      return { mode, fit, record: { EaKJ: fit.EaKJ, r2: fit.r2 } };
    }
    if (mode === 'conductivity') {
      const mc = molarConductivity({
        conductivityMsPerCm: n(condKappa), concMolPerL: n(condConc),
      });
      const dis = degreeOfDissociation({ lambda: mc.lambda, limiting: n(limiting) });
      /*
       * Ostwald's law divides by (1 − α), so it needs a strictly partial
       * dissociation. At α = 1 the electrolyte is fully dissociated and there
       * is no Ka to extract — a strong acid has none by this method. Guarding
       * on `complete` rather than letting the division throw keeps the message
       * pointing at the right thing.
       */
      const ost = dis.valid && !dis.complete
        ? ostwaldDilutionLaw({ alpha: dis.alpha, conc: n(condConc) })
        : null;
      return { mode, mc, dis, ost, record: { lambda: mc.lambda, alpha: dis.alpha } };
    }
    if (mode === 'thermo') {
      const g = gibbsEnergy({ deltaH: n(deltaH), deltaS: n(deltaS), tempC: n(tempC) });
      const cross = crossoverTemperature({ deltaH: n(deltaH), deltaS: n(deltaS) });
      const eq = equilibriumConstant({ deltaG: g.deltaG, tempC: n(tempC) });
      return { mode, g, cross, eq, record: { deltaG: g.deltaG, K: eq.K } };
    }
    if (mode === 'phase') {
      const [meltingA, fusionA] = parseComponent(compA);
      const [meltingB, fusionB] = parseComponent(compB);
      const eu = eutectic({
        a: { label: 'A', meltingC: meltingA, fusionKJ: fusionA },
        b: { label: 'B', meltingC: meltingB, fusionKJ: fusionB },
      });
      return { mode, eu, record: eu.exists ? { eutecticC: eu.eutecticTempC, xA: eu.xA } : {} };
    }
    return { mode };
  }

  function parseComponent(text) {
    const parts = String(text).split(/[\s,;]+/).filter(Boolean).map(Number);
    if (parts.length < 2 || !parts.every(Number.isFinite)) {
      throw Object.assign(new Error('bad'), { code: 'phaseComponentMissing', params: { name: 'A/B' } });
    }
    return parts;
  }

  /** The pair of text fields a two-column mode needs, with its parse error. */
  const pairFields = (labelA, labelB, valueA, onChangeA, valueB, onChangeB, hint) => (
    <>
      <TextField label={labelA} value={valueA} onChange={onChangeA} hint={hint} />
      <TextField label={labelB} value={valueB} onChange={onChangeB} hint={hint} />
    </>
  );

  return (
    <Card>
      <div className="field">
        <label htmlFor="physical-mode">{t('physical.mode')}</label>
        <select id="physical-mode" value={mode} onChange={(e) => { setMode(e.target.value); setOut(null); setErr(null); }}>
          {MODES.map((m) => <option key={m} value={m}>{t(`physical.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode === 'kinetics' && (
        <>
          <TextField
            label={t('physical.concTime')} value={kinPoints} onChange={setKinPoints}
            hint={t('physical.concTimeHint')}
            error={parsedKin.bad.length ? t('physical.badLines', { lines: parsedKin.bad.join(' / ') }) : null}
          />
          <NumField label={t('physical.predictAt')} value={kinTime} onChange={setKinTime} min="0" />
        </>
      )}

      {mode === 'arrhenius' && (
        <TextField
          label={t('physical.tempRate')} value={arrPoints} onChange={setArrPoints}
          hint={t('physical.tempRateHint')}
          error={parsedArr.bad.length ? t('physical.badLines', { lines: parsedArr.bad.join(' / ') }) : null}
        />
      )}

      {mode === 'conductivity' && (
        <>
          <NumField label={t('physical.conductivity')} value={condKappa} onChange={setCondKappa} min="0"
            hint={t('physical.conductivityHint')} />
          <NumField label={t('physical.concMol')} value={condConc} onChange={setCondConc} min="0" />
          <NumField label={t('physical.limiting')} value={limiting} onChange={setLimiting} min="0"
            hint={t('physical.limitingHint')} />
        </>
      )}

      {mode === 'thermo' && (
        <>
          <NumField label={t('physical.deltaH')} value={deltaH} onChange={setDeltaH}
            hint={t('physical.deltaHHint')} />
          <NumField label={t('physical.deltaS')} value={deltaS} onChange={setDeltaS}
            hint={t('physical.deltaSHint')} />
          <NumField label={t('physical.temp')} value={tempC} onChange={setTempC} />
        </>
      )}

      {mode === 'phase' && pairFields(
        t('physical.componentA'), t('physical.componentB'),
        compA, setCompA, compB, setCompB,
        t('physical.componentHint'),
      )}

      <button className="primary" onClick={run} disabled={Boolean(modeError)}>
        {t('common.calc')}
      </button>
      {modeError && <Err>{modeError}</Err>}
      {err && <Err>{err}</Err>}

      {out?.mode === 'kinetics' && (
        <>
          <Result
            value={fmtSci(out.at.conc, 5)}
            unit={t('physical.concUnit')}
            note={t('physical.kineticsNote', {
              order: out.fit.order, r2: fmt(out.fit.r2, 5),
            })}
            rows={[
              [t('physical.order'), String(out.fit.order)],
              [t('physical.k'), fmtSci(out.fit.k, 4)],
              [t('physical.r2'), fmt(out.fit.r2, 5)],
              [t('physical.halfLife'), `${fmt(out.tHalf, 4)} ${t('physical.timeUnit')}`],
            ]}
          />
          {!out.fit.reliable && <Warn>{t('physical.fitWeak', { r2: fmt(out.fit.r2, 4) })}</Warn>}
          {out.fit.residualPattern?.curved && <Warn>{t('physical.residualCurved')}</Warn>}
          {out.at.exhausted && <Warn>{t('physical.exhausted')}</Warn>}
        </>
      )}

      {out?.mode === 'arrhenius' && (
        <>
          <Result
            value={fmt(out.fit.EaKJ, 4)}
            unit={t('physical.eaUnit')}
            note={out.fit.EaUncertaintyKJ === null
              ? t('physical.noUncertainty')
              : t('physical.eaNote', {
                unc: fmt(out.fit.EaUncertaintyKJ, 3),
                span: fmt(out.fit.tempSpanC, 3),
              })}
            rows={[
              [t('physical.preExponential'), fmtSci(out.fit.A, 4)],
              [t('physical.r2'), fmt(out.fit.r2, 5)],
              [t('physical.tempSpan'), `${fmt(out.fit.tempSpanC, 3)} °C`],
              [t('physical.nPoints'), String(out.fit.n)],
            ]}
          />
          {!out.fit.rangeAdequate && <Warn>{t('physical.rangeNarrow', { span: fmt(out.fit.tempSpanC, 3) })}</Warn>}
        </>
      )}

      {out?.mode === 'conductivity' && (
        <>
          <Result
            value={fmt(out.mc.lambda, 5)}
            unit="S·cm²/mol"
            note={t('physical.condNote')}
            rows={[
              [t('physical.kappa'), `${fmt(out.mc.kappaSPerCm, 6)} S/cm`],
              [t('physical.alpha'), `${fmt(out.dis.percent, 4)}%`],
              ...(out.ost ? [
                [t('physical.ka'), fmtSci(out.ost.Ka, 4)],
                [t('physical.pka'), fmt(out.ost.pKa, 4)],
              ] : []),
            ]}
          />
          {!out.dis.valid && <Warn>{t('physical.alphaInvalid')}</Warn>}
        </>
      )}

      {out?.mode === 'thermo' && (
        <>
          <Result
            value={fmt(out.g.deltaG, 4)}
            unit="kJ/mol"
            note={out.g.spontaneous ? t('physical.spontaneous') : t('physical.notSpontaneous')}
            rows={[
              [t('physical.entropyTerm'), `${fmt(out.g.entropyTermKJ, 4)} kJ/mol`],
              [t('physical.driving'), t(`physical.driving_${out.g.driving}`)],
              [t('physical.k'), fmtSci(out.eq.K, 4)],
              ...(out.cross.exists
                ? [[t('physical.crossover'), `${fmt(out.cross.tempC, 4)} °C`]]
                : []),
            ]}
          />
          {out.cross.exists && (
            <div className="msg">
              <div>
                {out.cross.direction === 'spontaneousAbove'
                  ? t('physical.crossAbove', { temp: fmt(out.cross.tempC, 4) })
                  : t('physical.crossBelow', { temp: fmt(out.cross.tempC, 4) })}
              </div>
            </div>
          )}
          {!out.cross.exists && <div className="hint">{t('physical.crossNone')}</div>}
        </>
      )}

      {out?.mode === 'phase' && (
        <>
          {out.eu.exists ? (
            <>
              <Result
                value={fmt(out.eu.eutecticTempC, 4)}
                unit="°C"
                note={t('physical.eutecticNote', {
                  x: fmt(out.eu.xA * 100, 3),
                  xb: fmt(out.eu.xB * 100, 3),
                })}
                rows={[
                  [t('physical.meltingA'), `${fmt(out.eu.a.meltingC, 4)} °C`],
                  [t('physical.meltingB'), `${fmt(out.eu.b.meltingC, 4)} °C`],
                ]}
              />
              <PhaseDiagram result={out.eu} theme={theme} />
            </>
          ) : (
            <Warn>{t('physical.noEutectic')}</Warn>
          )}
        </>
      )}
    </Card>
  );
}
