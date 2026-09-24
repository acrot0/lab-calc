import React, { useState, useEffect } from 'react';
import { weakAcidPh, weakBasePh } from '../../calc/titration.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

/** Common lab acids and bases, so the pKa/pKb field is not a blank guess. */
const PRESETS = [
  { label: '乙酸', kind: 'acid', value: 4.76 },
  { label: '碳酸', kind: 'acid', value: 6.35 },
  { label: '磷酸（一级）', kind: 'acid', value: 2.15 },
  { label: 'Tris-HCl', kind: 'acid', value: 8.06 },
  { label: '氨水', kind: 'base', value: 4.75 },
  { label: '吡啶', kind: 'base', value: 8.77 },
];

export default function PhTab({ onRecord, restored }) {
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
        summary: `${kind === 'acid' ? '弱酸' : '弱碱'} pK${kind === 'acid' ? 'a' : 'b'} ${inputs.pk}、${inputs.conc} mol/L → pH ${fmt(ph, 2)}`,
      });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ph-kind">类型</label>
        <select id="ph-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="acid">弱酸（已知 pKa）</option>
          <option value="base">弱碱（已知 pKb）</option>
        </select>
      </div>

      <NumField
        label={kind === 'acid' ? 'pKa' : 'pKb'}
        value={pk}
        onChange={setPk}
        hint={PRESETS.filter((p) => p.kind === kind).map((p) => `${p.label} ${p.value}`).join(' · ')}
      />
      <NumField label="浓度 (mol/L)" value={conc} onChange={setConc} min="0" />

      <button className="primary" onClick={run}>计算</button>
      {err && <Err>{err}</Err>}

      <Warn>
        采用近似式 [H⁺] ≈ √(Ka·C)，适用于弱酸/弱碱且解离度较小的情况。
        强酸强碱、极稀溶液或等当点附近不适用。
      </Warn>

      <Result
        value={out ? fmt(out.ph, 2) : null}
        unit="pH"
        note={out ? `${out.kind === 'acid' ? '弱酸' : '弱碱'}，pK${out.kind === 'acid' ? 'a' : 'b'} = ${out.pk}` : null}
        rows={out ? [
          ['pH', fmt(out.ph, 3)],
          ['pOH', fmt(out.pOH, 3)],
          ['浓度', `${out.conc} mol/L`],
        ] : null}
      />
    </div>
  );
}
