import React, { useState, useEffect } from 'react';
import { weakAcidPh, weakBasePh } from '../../calc/titration.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/** Common lab acids and bases, so the pKa field is not a blank guess. */
const PRESETS = [
  { name: 'preset_acetate', kind: 'acid', value: 4.76 },
  { name: 'preset_carbonate', kind: 'acid', value: 6.35 },
  { name: 'preset_phosphate', kind: 'acid', value: 2.15 },
  { name: null, kind: 'acid', value: 8.06, literal: 'Tris-HCl' },
  { name: 'preset_ammonia', kind: 'base', value: 4.75 },
  { name: 'preset_pyridine', kind: 'base', value: 8.77 },
];

export default function PhTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [kind, setKind] = useState(restored?.kind ?? 'acid');
  const [pk, setPk] = useState(restored?.pk != null ? String(restored.pk) : '4.76');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [kind, pk, conc]);

  function run() {
    try {
      const inputs = { kind, pk: n(pk), conc: n(conc) };
      const ph = kind === 'acid'
        ? weakAcidPh({ pKa: inputs.pk, conc: inputs.conc })
        : weakBasePh({ pKb: inputs.pk, conc: inputs.conc });
      const r = { ph, pOH: 14 - ph, ...inputs };
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'phCalc', inputs, outputs: { ph },
        summary: recordSummary({ kind: 'phCalc', inputs, outputs: { ph } }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  // Gate the result on the acid/base kind that produced it — the reset effect
  // runs after render, so a kind switch would otherwise show the previous
  // direction's number under the new direction's label for one frame.
  const shown = shownFor(out, 'kind', kind);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ph-kind">{t('ph.kind')}</label>
        <select id="ph-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="acid">{t('ph.acidOption')}</option>
          <option value="base">{t('ph.baseOption')}</option>
        </select>
      </div>

      <NumField
        label={kind === 'acid' ? t('ph.pka') : t('ph.pkb')}
        value={pk}
        onChange={setPk}
        hint={PRESETS.filter((p) => p.kind === kind)
          .map((p) => `${p.name ? t(`ph.${p.name}`) : p.literal} ${p.value}`)
          .join(' · ')}
      />
      <NumField label={t('ph.conc')} value={conc} onChange={setConc} min="0" />

      <button className="primary" onClick={run}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      <Warn>{t('ph.warning')}</Warn>

      <Result
        value={shown ? fmt(shown.ph, 2) : null}
        unit="pH"
        note={shown ? t('ph.note', {
          kind: shown.kind === 'acid' ? t('ph.weakAcid') : t('ph.weakBase'),
          pk: shown.pk,
        }) : null}
        rows={shown ? [
          ['pH', fmt(shown.ph, 3)],
          ['pOH', fmt(shown.pOH, 3)],
          [t('common.concentration'), `${shown.conc} mol/L`],
        ] : null}
      />
    </div>
  );
}
