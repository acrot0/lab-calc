import React, { useState, useMemo } from 'react';
import {
  molarMassUncertainty, productUncertainty, quantity, relativeUncertainty,
  roundPair, significantFigures, sumUncertainty,
} from '../../calc/uncertainty.mjs';
import { NumField, TextField, Result, Err, Warn } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

const MODES = ['molarMass', 'propagate', 'weigh'];

/** Parse "value, uncertainty" pairs, one per line, with an optional label. */
export function parseTerms(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const terms = [];
  const bad = [];
  for (const line of lines) {
    // A label is optional and comes first: "mass, 5.844, 0.001".
    const parts = line.split(/[\s,;]+/).filter(Boolean);
    const numeric = parts.filter((p) => Number.isFinite(Number(p)));
    if (numeric.length < 1) { bad.push(line); continue; }
    const hasLabel = numeric.length < parts.length;
    const label = hasLabel ? parts[0] : null;
    const nums = parts.slice(hasLabel ? 1 : 0).map(Number);
    if (nums.length === 1) terms.push({ label, value: nums[0], unc: 0, power: 1, factor: 1 });
    else if (nums.length === 2) terms.push({ label, value: nums[0], unc: nums[1], power: 1, factor: 1 });
    else terms.push({ label, value: nums[0], unc: nums[1], power: nums[2], factor: 1 });
  }
  return { terms, bad };
}

export default function UncertaintyTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'molarMass');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  // Molar mass
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');

  // Propagation
  const [op, setOp] = useState(restored?.op ?? 'product');
  const [termText, setTermText] = useState(
    restored?.termText ?? 'mass, 5.844, 0.001\nvolume, 250, 0.15',
  );
  const [scaleFactor, setScaleFactor] = useState(restored?.scaleFactor ?? '1');

  // Weighing
  const [targetMass, setTargetMass] = useState(restored?.targetMass ?? '5.844');
  const [balanceUnc, setBalanceUnc] = useState(restored?.balanceUnc ?? '0.001');
  const [volumeMl, setVolumeMl] = useState(restored?.volumeMl ?? '250');
  const [volumeUnc, setVolumeUnc] = useState(restored?.volumeUnc ?? '0.15');

  const parsed = useMemo(() => parseTerms(termText), [termText]);

  /*
   * The molar mass breakdown updates live.
   *
   * This is a lookup rather than a calculation the user has to ask for: typing
   * a formula and seeing what its molar mass is worth is the same interaction
   * as the weigh tab's live molar mass hint, and putting a button in front of
   * it would be friction for no gain. The propagation modes do wait for a
   * press, because their inputs are a list the user is still assembling.
   */
  const mmLive = useMemo(() => {
    if (!formula.trim()) return null;
    try { return molarMassUncertainty(formula.trim()); } catch { return null; }
  }, [formula]);

  function run() {
    try {
      const result = compute();
      setOut(result);
      setErr(null);
      onRecord({
        kind: 'uncertainty',
        inputs: { mode },
        outputs: result.record ?? {},
        summary: recordSummary({ kind: 'uncertainty', inputs: { mode }, outputs: result.record ?? {} }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  function compute() {
    if (mode === 'molarMass') {
      const r = molarMassUncertainty(formula.trim());
      return { mode, mm: r, record: { molarMass: r.molarMass, unc: r.unc } };
    }
    if (mode === 'propagate') {
      const terms = parsed.terms.map((x) => ({
        value: x.value, unc: x.unc, power: x.power,
      }));
      const factor = n(scaleFactor);
      const combined = op === 'sum'
        ? sumUncertainty(terms)
        : productUncertainty(terms, { factor });
      return {
        mode,
        op,
        combined,
        relative: relativeUncertainty(combined),
        quoted: roundPair(combined),
        record: { value: combined.value, unc: combined.unc },
      };
    }
    if (mode === 'weigh') {
      /*
       * The concentration uncertainty from a weighing and a volumetric flask.
       *
       *   C = m / (M · V)
       *
       * The molar mass uncertainty comes from the formula, so the whole chain
       * is covered: balance, formula table, and flask. The molar mass term is
       * usually two orders of magnitude smaller than the balance — which is the
       * useful thing this shows, because it says where to spend effort.
       */
      const mm = molarMassUncertainty(formula.trim() || 'NaCl');
      const mass = quantity(n(targetMass), n(balanceUnc));
      const volL = quantity(n(volumeMl) / 1000, n(volumeUnc) / 1000);
      const conc = productUncertainty([
        { value: mass.value, unc: mass.unc },
        { value: volL.value, unc: volL.unc, power: -1 },
        { value: mm.molarMass, unc: mm.unc, power: -1 },
      ]);
      return {
        mode,
        mm,
        mass,
        volL,
        conc,
        quoted: roundPair(conc),
        contributions: [
          { key: 'mass', rel: mass.unc / mass.value },
          { key: 'volume', rel: volL.unc / volL.value },
          { key: 'molarMass', rel: mm.molarMass ? mm.unc / mm.molarMass : 0 },
        ],
        record: { conc: conc.value, unc: conc.unc },
      };
    }
    return { mode };
  }

  return (
    <Card>
      <div className="field">
        <label htmlFor="unc-mode">{t('uncertainty.mode')}</label>
        <select id="unc-mode" value={mode} onChange={(e) => { setMode(e.target.value); setOut(null); setErr(null); }}>
          {MODES.map((m) => <option key={m} value={m}>{t(`uncertainty.mode_${m}`)}</option>)}
        </select>
      </div>

      {(mode === 'molarMass' || mode === 'weigh') && (
        <TextField
          label={t('common.formula')} value={formula} onChange={setFormula}
          placeholder={t('common.formulaPlaceholder')}
        />
      )}

      {mode === 'propagate' && (
        <>
          <div className="field">
            <label htmlFor="unc-op">{t('uncertainty.operation')}</label>
            <select id="unc-op" value={op} onChange={(e) => setOp(e.target.value)}>
              <option value="product">{t('uncertainty.op_product')}</option>
              <option value="sum">{t('uncertainty.op_sum')}</option>
            </select>
          </div>
          <TextField
            label={t('uncertainty.terms')} value={termText} onChange={setTermText}
            hint={t('uncertainty.termsHint')}
            error={parsed.bad.length
              ? t('uncertainty.badLines', { lines: parsed.bad.join(' / ') }) : null}
          />
          {op === 'product' && (
            <NumField label={t('uncertainty.scaleFactor')} value={scaleFactor} onChange={setScaleFactor}
              hint={t('uncertainty.scaleHint')} />
          )}
        </>
      )}

      {mode === 'weigh' && (
        <>
          <NumField label={t('uncertainty.targetMass')} value={targetMass} onChange={setTargetMass} min="0" />
          <NumField label={t('uncertainty.balanceUnc')} value={balanceUnc} onChange={setBalanceUnc} min="0"
            hint={t('uncertainty.balanceHint')} />
          <NumField label={t('uncertainty.volume')} value={volumeMl} onChange={setVolumeMl} min="0" />
          <NumField label={t('uncertainty.volumeUnc')} value={volumeUnc} onChange={setVolumeUnc} min="0"
            hint={t('uncertainty.volumeHint')} />
        </>
      )}

      {mode === 'molarMass' && mmLive && (
        <Result
          value={`${fmt(mmLive.molarMass, 6)} ± ${fmt(mmLive.unc, 3)}`}
          unit="g/mol"
          note={t('uncertainty.mmNote', {
            rel: mmLive.molarMass ? fmt((mmLive.unc / mmLive.molarMass) * 100, 4) : '0',
          })}
          rows={mmLive.contributions.map((c) => [
            c.element,
            `×${c.count} · ±${fmtSci(c.count * c.atomicUncertainty, 3)}`,
          ])}
        />
      )}
      {mode === 'molarMass' && mmLive && mmLive.unknownElements.length > 0 && (
        <Warn>{t('uncertainty.unknownElements', { elements: mmLive.unknownElements.join(', ') })}</Warn>
      )}

      {mode !== 'molarMass' && (
        <button className="primary" onClick={run} disabled={mode === 'propagate' && parsed.terms.length === 0}>
          {t('common.calc')}
        </button>
      )}
      {err && <Err>{err}</Err>}

      {out?.mode === 'propagate' && (
        <Result
          value={`${fmt(out.quoted.value, 6)} ± ${fmt(out.quoted.unc, 4)}`}
          note={t('uncertainty.propagateNote', {
            rel: fmt(out.relative * 100, 4),
            rule: out.op === 'sum' ? t('uncertainty.ruleSum') : t('uncertainty.ruleProduct'),
          })}
          rows={[
            [t('uncertainty.rawValue'), fmt(out.combined.value, 8)],
            [t('uncertainty.rawUnc'), fmt(out.combined.unc, 8)],
            [t('uncertainty.figures'), String(significantFigures(out.combined) ?? '—')],
          ]}
        />
      )}

      {out?.mode === 'weigh' && (
        <>
          <Result
            value={`${fmtSci(out.quoted.value, 4)} ± ${fmtSci(out.quoted.unc, 3)}`}
            unit="mol/L"
            note={t('uncertainty.weighNote')}
            rows={[
              [t('uncertainty.massTerm'), `±${fmt(out.mass.unc, 5)} g`],
              [t('uncertainty.volumeTerm'), `±${fmt(n(volumeUnc), 4)} mL`],
              [t('uncertainty.mmTerm'), `±${fmt(out.mm.unc, 4)} g/mol`],
            ]}
          />
          {/* Which input dominates is the actionable part: it says whether to
              buy a better balance or a better flask. */}
          <div className="result">
            <div className="result-body">
              <div className="result-note">{t('uncertainty.dominantNote')}</div>
              <div className="result-grid">
                {out.contributions.map((c) => (
                  <div key={c.key}>
                    <span>{t(`uncertainty.contrib_${c.key}`)}</span>
                    <strong>{fmt(c.rel * 100, 4)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
