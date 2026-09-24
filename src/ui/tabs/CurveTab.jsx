import React, { useState, useEffect, useRef } from 'react';
import { titrationCurve, findEquivalencePoint, equivalenceVolumes } from '../../calc/curve.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/** Parse "2.15, 7.20, 12.35" into numbers. Returns null on anything unusable. */
function parsePkaList(text) {
  const parts = String(text).split(/[,，\s]+/).filter((p) => p.length > 0);
  const nums = parts.map(Number);
  if (nums.length === 0 || nums.some((v) => !Number.isFinite(v))) return null;
  return nums;
}

/**
 * Draw the curve on a canvas. SVG would need ~160 nodes and per-point
 * interaction this chart never uses; a canvas is cheaper and simpler.
 */
function CurveChart({ points, eqVolumes, width = 560, height = 280 }) {
  const { t } = useI18n();
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

    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x(v), pad.t);
      ctx.lineTo(x(v), pad.t + plotH);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), x(v), height - 12);
    }

    // One dashed marker per equivalence point — a polyprotic acid has several,
    // and drawing only the first would misrepresent the curve.
    ctx.strokeStyle = 'rgba(240,180,41,0.5)';
    ctx.setLineDash([4, 4]);
    for (const v of eqVolumes) {
      if (v > maxV) continue;
      ctx.beginPath();
      ctx.moveTo(x(v), pad.t);
      ctx.lineTo(x(v), pad.t + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = '#4ea1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.volumeMl), y(p.ph)) : ctx.lineTo(x(p.volumeMl), y(p.ph))));
    ctx.stroke();

    ctx.fillStyle = '#9aa3b2';
    ctx.textAlign = 'center';
    ctx.fillText(t('curve.axisX'), pad.l + plotW / 2, height - 1);
  }, [points, eqVolumes, width, height, t]);

  const eq = eqVolumes[0] ?? 0;
  return <canvas ref={ref} className="curve-canvas" role="img"
    aria-label={t('curve.chartLabel', { volume: fmt(eq, 1), ph: fmt(points[0]?.ph ?? 0, 2) })} />;
}

const ACID_TYPES = ['weakAcid', 'strongAcid', 'polyprotic'];

export default function CurveTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [acidType, setAcidType] = useState(restored?.acidType ?? 'weakAcid');
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [pkaList, setPkaList] = useState(restored?.pKas ? restored.pKas.join(', ') : '2.15, 7.20, 12.35');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.1');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '25');
  const [titrant, setTitrant] = useState(restored?.titrantConc != null ? String(restored.titrantConc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [acidType, pka, pkaList, conc, volume, titrant]);

  function buildSpec() {
    const base = { conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) };
    if (acidType === 'strongAcid') return { ...base, strongAcid: true };
    if (acidType === 'polyprotic') {
      const pKas = parsePkaList(pkaList);
      if (!pKas) throw new Error('pkaListInvalid');
      return { ...base, pKas };
    }
    return { ...base, pKa: n(pka) };
  }

  function run() {
    try {
      const spec = buildSpec();
      const eqVolumes = equivalenceVolumes(spec);
      const first = findEquivalencePoint(spec);
      const points = titrationCurve({ ...spec, points: 200 });
      setOut({ points, eqVolumes, first });
      setErr(null);
      const inputs = acidType === 'polyprotic'
        ? { acidType, pKas: parsePkaList(pkaList), conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) }
        : { acidType, pKa: acidType === 'strongAcid' ? null : n(pka), conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) };
      onRecord({
        kind: 'titrationCurve', inputs,
        outputs: { equivalenceMl: first.volumeMl, equivalencePh: first.ph },
        summary: recordSummary({ kind: 'titrationCurve', inputs, outputs: { equivalenceMl: first.volumeMl, equivalencePh: first.ph } }, t),
      });
    } catch (e) {
      setErr(e.message === 'pkaListInvalid' ? t('curve.pkaListHint') : errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="acid-type">{t('curve.acidType')}</label>
        <select id="acid-type" value={acidType} onChange={(e) => setAcidType(e.target.value)}>
          {ACID_TYPES.map((k) => <option key={k} value={k}>{t(`curve.${k}`)}</option>)}
        </select>
      </div>

      {acidType === 'weakAcid' && (
        <NumField label={t('curve.pka')} value={pka} onChange={setPka} hint={t('curve.pkaHint')} />
      )}
      {acidType === 'polyprotic' && (
        <div className="field">
          <label htmlFor="pka-list">{t('curve.pkaList')}</label>
          <input id="pka-list" type="text" value={pkaList}
            onChange={(e) => setPkaList(e.target.value)} placeholder={t('curve.pkaListHint')} />
          <div className="hint">{t('curve.pkaListHint')}</div>
        </div>
      )}

      <div className="row">
        <NumField label={t('curve.acidConc')} value={conc} onChange={setConc} min="0" />
        <NumField label={t('curve.acidVolume')} value={volume} onChange={setVolume} min="0" />
      </div>
      <NumField label={t('curve.titrantConc')} value={titrant} onChange={setTitrant} min="0" hint={t('curve.titrantHint')} />

      <button className="primary" onClick={run}>{t('curve.run')}</button>
      {err && <Err>{err}</Err>}

      {out && (
        <div className="result">
          <CurveChart points={out.points} eqVolumes={out.eqVolumes} />
          <Result
            value={fmt(out.first.volumeMl, 2)}
            unit={t('curve.equivalenceUnit')}
            note={t('curve.equivalenceNote', { ph: fmt(out.first.ph, 2) })}
            rows={[
              [t('curve.equivalenceVolume'), `${fmt(out.first.volumeMl, 3)} mL`],
              [t('curve.equivalencePh'), fmt(out.first.ph, 3)],
              ...(out.eqVolumes.length > 1
                ? [[t('curve.allEquivalence'), out.eqVolumes.map((v) => fmt(v, 1)).join(' / ') + ' mL']]
                : [[t('curve.halfEquivalence'), t('curve.halfEquivalenceValue', { pka: acidType === 'polyprotic' ? (parsePkaList(pkaList) ?? [])[0] : fmt(n(pka), 2) })]]),
            ]}
          />
        </div>
      )}

      <Warn>{t('curve.warning')}</Warn>
    </div>
  );
}
