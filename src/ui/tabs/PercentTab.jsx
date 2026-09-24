import React, { useState, useEffect } from 'react';
import { percentToMolarity, molarityToPercent, preparePercentSolution } from '../../calc/titration.mjs';
import { molarMass } from '../../calc/solution.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

export default function PercentTab({ onRecord, restored }) {
  const [mode, setMode] = useState(restored?.mode ?? 'prepare');
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [percent, setPercent] = useState(restored?.percent != null ? String(restored.percent) : '10');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '100');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [mode, formula, percent, volume, molarity]);

  const M = (() => { try { return molarMass(formula); } catch { return null; } })();

  function run() {
    try {
      if (mode === 'prepare') {
        const inputs = { percent: n(percent), volumeMl: n(volume), formula };
        const r = preparePercentSolution(inputs);
        const conv = percentToMolarity({ percent: inputs.percent, formula });
        setOut({ ...r, molarity: conv, molarMass: M });
        setErr(null);
        onRecord({
          kind: 'percentSolution', inputs,
          outputs: { massG: r.massG, molarity: conv },
          summary: `配制 ${inputs.percent}% (w/v) ${formula} ${inputs.volumeMl} mL：称 ${fmt(r.massG, 3)} g`,
        });
      } else {
        const inputs = { molarity: n(molarity), formula };
        const pct = molarityToPercent(inputs);
        setOut({ percent: pct, molarity: inputs.molarity, molarMass: M });
        setErr(null);
        onRecord({
          kind: 'percentSolution', inputs,
          outputs: { percent: pct },
          summary: `${inputs.molarity} mol/L ${formula} = ${fmt(pct, 3)}% (w/v)`,
        });
      }
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="pct-mode">计算方向</label>
        <select id="pct-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="prepare">按百分比配制（称多少克）</option>
          <option value="toPercent">摩尔浓度 → 百分比</option>
        </select>
      </div>

      <TextField
        label="化学式" value={formula} onChange={setFormula}
        placeholder="如 NaCl、KCl"
        hint={M ? `摩尔质量 ${M.toFixed(3)} g/mol` : '用于换算摩尔浓度与溶解度判断'}
        error={formula && !M ? '无法解析该化学式' : null}
      />

      {mode === 'prepare' ? (
        <>
          <NumField label="百分比浓度 (% w/v)" value={percent} onChange={setPercent} min="0" hint="100 mL 溶液中含多少克溶质" />
          <NumField label="配制体积 (mL)" value={volume} onChange={setVolume} min="0" />
        </>
      ) : (
        <NumField label="摩尔浓度 (mol/L)" value={molarity} onChange={setMolarity} min="0" />
      )}

      <button className="primary" onClick={run} disabled={!M}>计算</button>
      {err && <Err>{err}</Err>}
      {out?.solubilityWarning && <Warn>{out.solubilityWarning}</Warn>}

      {mode === 'prepare' ? (
        <Result
          value={out ? fmt(out.massG, 3) : null}
          unit="g"
          note={out ? `称取后溶于适量水，定容至 ${out.volumeMl} mL（相当于 ${fmt(out.molarity, 4)} mol/L）` : null}
          rows={out ? [
            ['称取质量', `${fmt(out.massG, 4)} g`],
            ['等效浓度', `${fmt(out.molarity, 4)} mol/L`],
            ['摩尔质量', `${fmt(out.molarMass, 3)} g/mol`],
          ] : null}
        />
      ) : (
        <Result
          value={out ? fmt(out.percent, 3) : null}
          unit="% (w/v)"
          note={out ? `即每 100 mL 溶液含 ${fmt(out.percent, 3)} g ${formula}` : null}
          rows={out ? [
            ['百分比', `${fmt(out.percent, 4)} %`],
            ['浓度', `${out.molarity} mol/L`],
            ['摩尔质量', `${fmt(out.molarMass, 3)} g/mol`],
          ] : null}
        />
      )}
    </div>
  );
}
