import React, { useState, useEffect, useMemo } from 'react';
import { dilution } from '../../calc/solution.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { UncertaintyPanel } from '../components/UncertaintyPanel.jsx';
import { fmt, fmtSci, fmtMeasured, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import { productUncertainty } from '../../calc/uncertainty.mjs';
import { glasswareUncertainty } from '../../calc/instruments.mjs';
import Card from '../components/Card.jsx';
import ProcedureFlow from '../components/ProcedureFlow.jsx';

/**
 * The uncertainty budget for a dilution.
 *
 *   C₂ = C₁ × V₁ / V₂
 *
 * Three measured volumes and a concentration, and the answer to "how well do I
 * know this dilution" is dominated by whichever is relatively worst — which is
 * almost always the pipette, because a 25 mL pipette is ±0.03 mL (0.12%) where
 * the stock concentration is whatever the person who made it achieved.
 *
 * That last term is the one this cannot know: the stock's own uncertainty is
 * not a property of any instrument on this bench, it is a property of how the
 * stock was made. It is left out, and the panel says so rather than reporting a
 * dilution as better-determined than the solution it came from.
 */
function diluteBudget({ stockConc, targetConc, targetVolumeMl, pipetteMl, flaskMl, flaskGrade, tempC }) {
  const pipette = glasswareUncertainty({
    kind: 'pipette', nominalMl: pipetteMl, grade: flaskGrade, temperatureC: tempC,
  });
  const flask = glasswareUncertainty({
    kind: 'flask', nominalMl: flaskMl, grade: flaskGrade, temperatureC: tempC,
  });
  // The stock volume is delivered by the pipette and the final volume is made
  // up in the flask, so the two instruments enter as a quotient.
  const delivered = (targetConc * targetVolumeMl) / stockConc;
  const combined = productUncertainty([
    { value: stockConc, unc: 0, power: 1 },
    { value: delivered, unc: pipette.unc, power: 1 },
    { value: targetVolumeMl, unc: flask.unc, power: -1 },
  ]);
  return {
    pipette,
    flask,
    delivered: { value: delivered, unc: pipette.unc },
    concentration: combined,
    relative: combined.value === 0 ? 0 : combined.unc / combined.value,
  };
}

export default function DiluteTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1');
  const [target, setTarget] = useState(restored?.targetConc != null ? String(restored.targetConc) : '0.1');
  const [volume, setVolume] = useState(restored?.targetVolumeMl != null ? String(restored.targetVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [uncOpen, setUncOpen] = useState(false);
  const [flaskMl, setFlaskMl] = useState('100');
  const [pipetteMl, setPipetteMl] = useState('25');
  const [flaskGrade, setFlaskGrade] = useState('A');
  const [tempC, setTempC] = useState('20');

  // The derivation behind the result: C1V1 = C2V2, then the diluent as the
  // difference, then the factor — the order someone would do it by hand.
  const worked = useMemo(() => {
    if (!out) return null;
    const c1 = n(stock);
    const c2 = n(target);
    const v2 = n(volume);
    return [
      { term: t('dilute.fold'), value: t('common.worked_Dilution') },
      {
        term: '',
        value: t('common.worked_DilutionStep', {
          c2: fmtSci(c2, 4), v2: fmt(v2, 4), c1: fmtSci(c1, 4), v1: fmt(out.stockVolumeMl, 4),
        }),
      },
      {
        term: t('dilute.diluentVolume'),
        value: t('common.worked_DiluentStep', {
          v2: fmt(v2, 4), v1: fmt(out.stockVolumeMl, 4), diluent: fmt(out.diluentVolumeMl, 4),
        }),
      },
      ...(out.foldDilution
        ? [{
          term: t('dilute.fold'),
          value: t('common.worked_FoldStep', {
            c1: fmtSci(c1, 4), c2: fmtSci(c2, 4), fold: fmt(out.foldDilution, 4),
          }),
        }]
        : []),
    ];
  }, [out, stock, target, volume, t]);

  /*
   * Recomputed from the inputs rather than stored, so the budget cannot go
   * stale against the result above it.
   */
  const budget = useMemo(() => {
    const spec = {
      stockConc: n(stock),
      targetConc: n(target),
      targetVolumeMl: n(volume),
      pipetteMl: n(pipetteMl),
      flaskMl: n(flaskMl),
      flaskGrade,
      tempC: n(tempC),
    };
    if (!Number.isFinite(spec.stockConc) || !(spec.stockConc > 0)) return null;
    if (!(spec.targetConc >= 0) || !(spec.targetVolumeMl > 0)) return null;
    if (!(spec.pipetteMl > 0) || !(spec.flaskMl > 0)) return null;
    try {
      return diluteBudget(spec);
    } catch {
      // An instrument size the standard does not cover. The dilution itself is
      // unaffected, so the panel states what is missing rather than showing a
      // zero as if it were a measurement.
      return null;
    }
  }, [stock, target, volume, pipetteMl, flaskMl, flaskGrade, tempC]);

  useEffect(() => { setOut(null); setErr(null); }, [stock, target, volume]);

  function run() {
    try {
      const inputs = { stockConc: n(stock), targetConc: n(target), targetVolumeMl: n(volume) };
      const r = dilution(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'dilution', inputs, outputs: r,
        summary: recordSummary({ kind: 'dilution', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <Card>
      <div className="row">
        <NumField label={t('dilute.stockConc')} value={stock} onChange={setStock} min="0" />
        <NumField label={t('dilute.targetConc')} value={target} onChange={setTarget} min="0" />
      </div>
      <NumField label={t('dilute.targetVolume')} value={volume} onChange={setVolume} min="0" />
      <div className="row row-actions">
        <button className="primary" onClick={run}>{t('common.calc')}</button>
        <ProcedureFlow
          kind="dilution"
          inputs={{ stockConc: n(stock), targetConc: n(target), targetVolumeMl: n(volume) }}
          outputs={out}
          theme={theme}
        />
      </div>
      {err && <Err>{err}</Err>}
      <Result
        value={out ? fmt(out.stockVolumeMl, 3) : null}
        unit={t('dilute.unit')}
        note={out ? t('dilute.note', { diluent: fmt(out.diluentVolumeMl, 3), volume: fmt(n(volume), 1) }) : null}
        rows={out ? [
          [t('dilute.stockVolume'), `${fmt(out.stockVolumeMl, 3)} mL`],
          [t('dilute.diluentVolume'), `${fmt(out.diluentVolumeMl, 3)} mL`],
          [t('dilute.fold'), out.foldDilution ? `${fmt(out.foldDilution, 2)}×` : '—'],
        ] : null}
        unc={out && uncOpen && budget ? {
          ...fmtMeasured(out.stockVolumeMl, budget.pipette.unc, { unit: ' mL' }),
          detail: `${t('unc.uncRelative')} ${fmtSci(budget.relative * 100, 3)}%`,
        } : null}
        worked={worked}
        workedLabel={t('common.worked')}
      />

      <UncertaintyPanel
        open={uncOpen}
        onToggle={() => setUncOpen((v) => !v)}
        budget={budget}
        balance={false}
        state={{ flaskMl, setFlaskMl, flaskGrade, setFlaskGrade, tempC, setTempC,
          pipetteMl, setPipetteMl }}
      />
    </Card>
  );
}
