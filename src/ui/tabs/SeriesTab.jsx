import React, { useState, useMemo, useEffect } from 'react';
import { dilutionSeries } from '../../calc/buffer.mjs';
import { NumField, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

export default function SeriesTab({ onRecord, restored }) {
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1000');
  const [factor, setFactor] = useState(restored?.factor != null ? String(restored.factor) : '10');
  const [steps, setSteps] = useState(restored?.steps != null ? String(restored.steps) : '5');
  const [vol, setVol] = useState(restored?.stepVolumeMl != null ? String(restored.stepVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [stock, factor, steps, vol]);

  function run() {
    try {
      const inputs = { stockConc: n(stock), factor: n(factor), steps: n(steps), stepVolumeMl: n(vol) };
      const r = dilutionSeries(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'dilutionSeries', inputs, outputs: { series: r },
        summary: `${inputs.steps} 级 ${inputs.factor}× 梯度稀释（母液 ${inputs.stockConc}）`,
      });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <NumField label="母液浓度" value={stock} onChange={setStock} min="0" />
        <NumField label="稀释倍数" value={factor} onChange={setFactor} min="1" hint="须大于 1" />
      </div>
      <div className="row">
        <NumField label="级数" value={steps} onChange={setSteps} min="1" step="1" />
        <NumField label="每管终体积 (mL)" value={vol} onChange={setVol} min="0" />
      </div>
      <button className="primary" onClick={run}>计算</button>
      {err && <Err>{err}</Err>}
      {out && (
        <div className="result">
          <div className="result-note">
            每管取 <em>上一管溶液</em>（第 1 管取母液），加溶剂至终体积：
          </div>
          <table className="series-table">
            <thead>
              <tr>
                <th scope="col">管号</th>
                <th scope="col">终浓度</th>
                <th scope="col">取液来源</th>
                <th scope="col">取液量</th>
                <th scope="col">加溶剂</th>
              </tr>
            </thead>
            <tbody>
              {out.map((s) => (
                <tr key={s.step}>
                  <th scope="row">{s.step}</th>
                  <td>{fmt(s.conc, 4)}</td>
                  <td>{s.step === 1 ? '母液' : `第 ${s.step - 1} 管`}</td>
                  <td>{fmt(s.stockVolumeMl, 2)} mL</td>
                  <td>{fmt(s.diluentVolumeMl, 2)} mL</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

