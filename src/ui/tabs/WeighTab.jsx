import React, { useState, useMemo, useEffect } from 'react';
import { stockFromSolid, molarMass, summarizeRecord } from '../../calc/solution.mjs';
import { TextField, NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

export default function WeighTab({ onRecord, restored }) {
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '0.5');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '500');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  const M = useMemo(() => {
    try { return molarMass(formula); } catch { return null; }
  }, [formula]);

  useEffect(() => { setOut(null); setErr(null); }, [formula, molarity, volume]);

  function run() {
    try {
      const inputs = { formula, molarity: n(molarity), volumeMl: n(volume) };
      const r = stockFromSolid(inputs);
      setOut(r);
      setErr(null);
      onRecord({ kind: 'stockFromSolid', inputs, outputs: r, summary: summarizeRecord({ kind: 'stockFromSolid', inputs, outputs: r }) });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <>
      <div className="card">
        <TextField
          label="化学式" value={formula} onChange={setFormula}
          placeholder="如 NaCl、Ca(OH)2、CuSO4·5H2O"
          hint={M ? `摩尔质量 ${M.toFixed(3)} g/mol` : '支持括号与水合物点号（·）'}
          error={formula && !M ? '无法解析该化学式' : null}
        />
        <div className="row">
          <NumField label="目标浓度 (mol/L)" value={molarity} onChange={setMolarity} min="0" />
          <NumField label="定容体积 (mL)" value={volume} onChange={setVolume} min="0" />
        </div>
        <button className="primary" onClick={run} disabled={!M}>计算</button>
        {err && <Err>{err}</Err>}
        <Result
          value={out ? fmt(out.massG, 3) : null}
          unit="g"
          note={out ? `称取后溶于适量水，定容至 ${out.finalVolumeMl} mL` : null}
          rows={out ? [
            ['摩尔质量', `${fmt(out.molarMass, 3)} g/mol`],
            ['物质的量', `${fmt(out.moles, 5)} mol`],
            ['定容体积', `${out.finalVolumeMl} mL`],
          ] : null}
        />
      </div>
    </>
  );
}

