import React, { useState, useMemo, useEffect } from 'react';
import { dilution, summarizeRecord } from '../../calc/solution.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

export default function DiluteTab({ onRecord, restored }) {
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1');
  const [target, setTarget] = useState(restored?.targetConc != null ? String(restored.targetConc) : '0.1');
  const [volume, setVolume] = useState(restored?.targetVolumeMl != null ? String(restored.targetVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [stock, target, volume]);

  function run() {
    try {
      const inputs = { stockConc: n(stock), targetConc: n(target), targetVolumeMl: n(volume) };
      const r = dilution(inputs);
      setOut(r);
      setErr(null);
      onRecord({ kind: 'dilution', inputs, outputs: r, summary: summarizeRecord({ kind: 'dilution', inputs, outputs: r }) });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <NumField label="母液浓度" value={stock} onChange={setStock} min="0" />
        <NumField label="目标浓度" value={target} onChange={setTarget} min="0" />
      </div>
      <NumField label="目标体积 (mL)" value={volume} onChange={setVolume} min="0" />
      <button className="primary" onClick={run}>计算</button>
      {err && <Err>{err}</Err>}
      <Result
        value={out ? fmt(out.stockVolumeMl, 2) : null}
        unit="mL 母液"
        note={out ? `再加入 ${fmt(out.diluentVolumeMl, 2)} mL 溶剂至 ${fmt(n(volume), 1)} mL` : null}
        rows={out ? [
          ['母液用量', `${fmt(out.stockVolumeMl, 3)} mL`],
          ['溶剂用量', `${fmt(out.diluentVolumeMl, 3)} mL`],
          ['稀释倍数', out.foldDilution ? `${fmt(out.foldDilution, 2)}×` : '—'],
        ] : null}
      />
    </div>
  );
}

