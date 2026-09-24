import React, { useState, useMemo, useEffect } from 'react';
import { bufferRecipe } from '../../calc/buffer.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

export default function BufferTab({ onRecord, restored }) {
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [ph, setPh] = useState(restored?.targetPh != null ? String(restored.targetPh) : '5.0');
  const [total, setTotal] = useState(restored?.totalConc != null ? String(restored.totalConc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [pka, ph, total]);

  function run() {
    try {
      const inputs = { pKa: n(pka), targetPh: n(ph), totalConc: n(total) };
      const r = bufferRecipe(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'bufferRecipe', inputs, outputs: r,
        summary: `缓冲液 pH ${inputs.targetPh}（pKa ${inputs.pKa}）：酸 ${fmt(r.acidConc, 4)} M + 碱 ${fmt(r.baseConc, 4)} M`,
      });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <NumField label="酸的 pKa" value={pka} onChange={setPka} hint="乙酸 4.76 · 磷酸 7.20 · Tris 8.06" />
        <NumField label="目标 pH" value={ph} onChange={setPh} />
      </div>
      <NumField label="总浓度 (mol/L)" value={total} onChange={setTotal} min="0" hint="两种形态浓度之和" />
      <button className="primary" onClick={run}>计算</button>
      {err && <Err>{err}</Err>}
      {out && !out.inRange && (
        <Warn>
          目标 pH 距 pKa 超过 1 个单位，缓冲容量会明显下降。实际配液建议选 pKa 更接近目标 pH 的缓冲体系。
        </Warn>
      )}
      <Result
        value={out ? fmt(out.ratio, 3) : null}
        unit="碱 / 酸"
        note={out ? `pH = pKa + log(碱/酸) = ${fmt(out.pKa, 2)} + ${fmt(Math.log10(out.ratio), 3)}` : null}
        rows={out ? [
          ['酸（HA）', `${fmt(out.acidConc, 4)} mol/L`],
          ['共轭碱（A⁻）', `${fmt(out.baseConc, 4)} mol/L`],
          ['缓冲范围', out.inRange ? '在 pKa ± 1 内 ✓' : '超出 pKa ± 1 ⚠'],
        ] : null}
      />
    </div>
  );
}

