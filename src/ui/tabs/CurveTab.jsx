import React, { useState, useEffect, useRef } from 'react';
import { titrationCurve, findEquivalencePoint } from '../../calc/curve.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

/** Draw the curve into a canvas. SVG would need ~120 nodes; a canvas is cheaper
 *  and this chart never needs per-point interaction. */
function CurveChart({ points, eq, width = 560, height = 280 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || points.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 46, r: 16, t: 16, b: 34 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;

    const maxV = Math.max(...points.map((p) => p.volumeMl));
    const x = (v) => pad.l + (v / maxV) * plotW;
    const y = (ph) => pad.t + plotH - (Math.min(Math.max(ph, 0), 14) / 14) * plotH;

    // Grid + pH labels
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let ph = 0; ph <= 14; ph += 2) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(ph));
      ctx.lineTo(width - pad.r, y(ph));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(ph), pad.l - 8, y(ph) + 4);
    }

    // Volume ticks
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x(v), pad.t);
      ctx.lineTo(x(v), pad.t + plotH);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), x(v), height - 12);
    }

    // Equivalence marker, drawn under the curve
    ctx.strokeStyle = 'rgba(240,180,41,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x(eq.volumeMl), pad.t);
    ctx.lineTo(x(eq.volumeMl), pad.t + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // The curve itself
    ctx.strokeStyle = '#4ea1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.volumeMl), y(p.ph)) : ctx.lineTo(x(p.volumeMl), y(p.ph))));
    ctx.stroke();

    // Axis titles
    ctx.fillStyle = '#9aa3b2';
    ctx.textAlign = 'center';
    ctx.fillText('滴定液体积 (mL)', pad.l + plotW / 2, height - 1);
  }, [points, eq, width, height]);

  return <canvas ref={ref} className="curve-canvas" role="img"
    aria-label={`滴定曲线，等当点 ${fmt(eq.volumeMl, 1)} mL，pH ${fmt(eq.ph, 2)}`} />;
}

export default function CurveTab({ onRecord, restored }) {
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.1');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '25');
  const [titrant, setTitrant] = useState(restored?.titrantConc != null ? String(restored.titrantConc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [pka, conc, volume, titrant]);

  function run() {
    try {
      const inputs = { pKa: n(pka), conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) };
      const eq = findEquivalencePoint(inputs);
      const points = titrationCurve({ ...inputs, points: 160 });
      setOut({ points, eq });
      setErr(null);
      onRecord({
        kind: 'titrationCurve', inputs,
        outputs: { equivalenceMl: eq.volumeMl, equivalencePh: eq.ph },
        summary: `滴定曲线：${inputs.conc} mol/L 弱酸(pKa ${inputs.pKa}) ${inputs.volumeMl} mL，等当点 ${fmt(eq.volumeMl, 2)} mL / pH ${fmt(eq.ph, 2)}`,
      });
    } catch (e) {
      setErr(e.message);
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <NumField label="弱酸 pKa" value={pka} onChange={setPka} hint="乙酸 4.76 · 碳酸 6.35" />
        <NumField label="弱酸浓度 (mol/L)" value={conc} onChange={setConc} min="0" />
      </div>
      <div className="row">
        <NumField label="弱酸体积 (mL)" value={volume} onChange={setVolume} min="0" />
        <NumField label="滴定液浓度 (mol/L)" value={titrant} onChange={setTitrant} min="0" hint="强碱，如 NaOH" />
      </div>

      <button className="primary" onClick={run}>计算并绘制</button>
      {err && <Err>{err}</Err>}

      {out && (
        <div className="result">
          <CurveChart points={out.points} eq={out.eq} />
          <Result
            value={fmt(out.eq.volumeMl, 2)}
            unit="mL 等当点"
            note={`等当点 pH ${fmt(out.eq.ph, 2)}（弱酸被强碱滴定时大于 7）`}
            rows={[
              ['等当点体积', `${fmt(out.eq.volumeMl, 3)} mL`],
              ['等当点 pH', fmt(out.eq.ph, 3)],
              ['半等当点 pH', `≈ pKa = ${fmt(n(pka), 2)}`],
            ]}
          />
        </div>
      )}

      <Warn>
        模型为单元弱酸 + 强碱，按电荷平衡精确求解，未考虑活度系数与 CO₂ 溶解。
        等当点附近为近似值。
      </Warn>
    </div>
  );
}
