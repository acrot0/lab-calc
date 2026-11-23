import React, { useState, useMemo, useRef } from 'react';
import { fitMichaelisMenten, michaelisMentenCurve, batchInitialRates } from '../../calc/kinetics.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { serializeJournalDiagram, JOURNAL_PRESETS, diagramFilename } from '../svg-export.mjs';
import { saveFile } from '../save-file.mjs';
import Card from '../components/Card.jsx';

const DEFAULT_MM_DATA = [
  '0.05, 0.025',
  '0.10, 0.042',
  '0.20, 0.064',
  '0.40, 0.088',
  '0.80, 0.108',
  '1.60, 0.121',
  '3.20, 0.129',
].join('\n');

const DEFAULT_BATCH_DATA = [
  'time, blank_1, blank_2, S_0.1mM, S_0.4mM, S_1.6mM',
  '0, 0.012, 0.014, 0.015, 0.016, 0.018',
  '1, 0.013, 0.015, 0.032, 0.058, 0.095',
  '2, 0.014, 0.016, 0.050, 0.101, 0.171',
  '3, 0.015, 0.017, 0.068, 0.143, 0.248',
  '4, 0.016, 0.018, 0.085, 0.184, 0.323',
].join('\n');

function parseMmRows(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\s,;]+/).filter(Boolean);
      return { s: Number(parts[0]), v: Number(parts[1]) };
    });
}

function parseBatchTable(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return { times: [], series: [] };
  const headers = lines[0].split(/[\s,;]+/).filter(Boolean);
  const cols = headers.slice(1).map((name) => ({
    name,
    role: /blank|ctrl|control|空白/i.test(name) ? 'blank' : 'sample',
    values: [],
  }));
  const times = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(/[\s,;]+/).filter(Boolean);
    times.push(Number(cells[0]));
    for (let c = 0; c < cols.length; c++) {
      cols[c].values.push(Number(cells[c + 1]));
    }
  }
  return { times, series: cols };
}

function KineticsSvgPlot({ points, fit, theme }) {
  const svgRef = useRef(null);
  const { t } = useI18n();
  const [preset, setPreset] = useState('natureSingle');
  const [savedMsg, setSavedMsg] = useState('');

  const W = 480;
  const H = 270;
  const pad = { l: 56, r: 20, t: 22, b: 42 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const maxS = Math.max(...points.map((p) => p.s), fit.km * 2.2) * 1.08;
  const maxV = Math.max(...points.map((p) => p.v), fit.vmax * 1.06);
  const sx = (s) => pad.l + (s / maxS) * pw;
  const sy = (v) => pad.t + ph - (v / maxV) * ph;

  const curvePts = michaelisMentenCurve({ vmax: fit.vmax, km: fit.km, maxS, steps: 90 });
  const pathD = curvePts
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${sx(pt.s).toFixed(2)},${sy(pt.v).toFixed(2)}`)
    .join(' ');

  const handleExport = async () => {
    if (!svgRef.current) return;
    const svgText = serializeJournalDiagram(svgRef.current, {
      preset,
      background: '#ffffff',
    });
    const ok = await saveFile(diagramFilename(`kinetics-${preset}`, theme), svgText, 'image/svg+xml');
    setSavedMsg(ok ? t('kinetics.exported') : '');
  };

  return (
    <div className="diagram-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="diagram-svg"
        role="img"
        aria-label={t('kinetics.chartAria')}
      >
        <line x1={pad.l} y1={pad.t + ph} x2={pad.l + pw} y2={pad.t + ph} stroke="#222222" strokeWidth="1.2" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ph} stroke="#222222" strokeWidth="1.2" />
        <line
          x1={pad.l} y1={sy(fit.vmax * 0.5)} x2={sx(fit.km)} y2={sy(fit.vmax * 0.5)}
          stroke="#888888" strokeWidth="0.9" strokeDasharray="3,3"
        />
        <line
          x1={sx(fit.km)} y1={sy(fit.vmax * 0.5)} x2={sx(fit.km)} y2={pad.t + ph}
          stroke="#888888" strokeWidth="0.9" strokeDasharray="3,3"
        />
        <path d={pathD} fill="none" stroke="#0072B2" strokeWidth="2" />
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={sx(pt.s)}
            cy={sy(pt.v)}
            r="3.8"
            fill="#D55E00"
            stroke="#ffffff"
            strokeWidth="0.9"
          />
        ))}
        <text x={pad.l + pw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#222222" fontFamily="sans-serif">
          [S] (mM)
        </text>
        <text
          x="16" y={pad.t + ph / 2}
          textAnchor="middle" fontSize="11" fill="#222222" fontFamily="sans-serif"
          transform={`rotate(-90 16 ${pad.t + ph / 2})`}
        >
          v₀
        </text>
        <text x={pad.l + pw - 6} y={pad.t + 14} textAnchor="end" fontSize="10" fill="#222222" fontFamily="sans-serif">
          {`Km = ${fmt(fit.km, 4)} | Vmax = ${fmt(fit.vmax, 4)} | R² = ${fmt(fit.r2, 4)}`}
        </text>
      </svg>
      <div className="field-row" style={{ marginTop: 8, alignItems: 'center', gap: 8 }}>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label={t('kinetics.journalPreset')}>
          {Object.entries(JOURNAL_PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={handleExport}>
          {t('kinetics.exportSvg')}
        </button>
        {savedMsg && <span className="muted">{savedMsg}</span>}
      </div>
    </div>
  );
}

export default function KineticsTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'mm');
  const [mmText, setMmText] = useState(restored?.mmText ?? DEFAULT_MM_DATA);
  const [enzConc, setEnzConc] = useState(restored?.enzConc ?? '');
  const [batchText, setBatchText] = useState(restored?.batchText ?? DEFAULT_BATCH_DATA);
  const [extCoeff, setExtCoeff] = useState(restored?.extCoeff ?? '18500');
  const [pathLen, setPathLen] = useState(restored?.pathLen ?? '1');

  const mmOutcome = useMemo(() => {
    if (mode !== 'mm') return null;
    try {
      const pts = parseMmRows(mmText);
      const res = fitMichaelisMenten(pts, { enzymeConcM: enzConc === '' ? null : n(enzConc) });
      return { pts, res, err: null };
    } catch (e) {
      return { pts: [], res: null, err: errorMessage(e, t) };
    }
  }, [mode, mmText, enzConc, t]);

  const batchOutcome = useMemo(() => {
    if (mode !== 'batch') return null;
    try {
      const parsed = parseBatchTable(batchText);
      const res = batchInitialRates({
        times: parsed.times,
        series: parsed.series,
        pathLengthCm: n(pathLen) || 1,
        extinctionCoeff: Number(extCoeff) > 0 ? Number(extCoeff) : 0,
      });
      return { res, err: null };
    } catch (e) {
      return { res: null, err: errorMessage(e, t) };
    }
  }, [mode, batchText, extCoeff, pathLen, t]);

  const saveMmRecord = () => {
    if (!mmOutcome?.res) return;
    onRecord?.({
      tab: 'kinetics',
      inputs: { mode: 'mm', mmText, enzConc },
      outputs: { vmax: mmOutcome.res.vmax, km: mmOutcome.res.km, r2: mmOutcome.res.r2 },
      summary: `Michaelis-Menten: Km = ${fmt(mmOutcome.res.km, 4)}, Vmax = ${fmt(mmOutcome.res.vmax, 4)}, R² = ${fmt(mmOutcome.res.r2, 4)}`,
    });
  };

  return (
    <Card title={t('kinetics.title')} subtitle={t('kinetics.subtitle')}>
      <div className="segmented" role="tablist">
        <button type="button" className={mode === 'mm' ? 'is-active' : ''} onClick={() => setMode('mm')}>
          {t('kinetics.modeMm')}
        </button>
        <button type="button" className={mode === 'batch' ? 'is-active' : ''} onClick={() => setMode('batch')}>
          {t('kinetics.modeBatch')}
        </button>
      </div>

      {mode === 'mm' && (
        <>
          <div className="field">
            <label htmlFor="mm-textarea">{t('kinetics.mmInputLabel')}</label>
            <textarea
              id="mm-textarea"
              rows={7}
              value={mmText}
              onChange={(e) => setMmText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <NumField
            label={t('kinetics.enzymeConcLabel')}
            value={enzConc}
            onChange={setEnzConc}
            placeholder="e.g. 1e-6"
          />
          {mmOutcome?.err && <Err>{mmOutcome.err}</Err>}
          {mmOutcome?.res && (
            <>
              <Result
                rows={[
                  [t('kinetics.km'), `${fmt(mmOutcome.res.km, 4)} ± ${fmt(mmOutcome.res.seKm, 4)} mM`],
                  [t('kinetics.vmax'), `${fmt(mmOutcome.res.vmax, 4)} ± ${fmt(mmOutcome.res.seVmax, 4)}`],
                  ['R² / RMSE', `${fmt(mmOutcome.res.r2, 5)} / ${fmtSci(mmOutcome.res.rmse, 3)}`],
                  ...(mmOutcome.res.kcat != null
                    ? [
                        ['kcat (s⁻¹)', fmtSci(mmOutcome.res.kcat, 4)],
                        ['kcat / Km (M⁻¹ s⁻¹)', fmtSci(mmOutcome.res.catalyticEfficiency, 4)],
                      ]
                    : []),
                ]}
              />
              <button type="button" className="btn-primary" onClick={saveMmRecord} style={{ marginBottom: 10 }}>
                {t('common.save')}
              </button>
              <KineticsSvgPlot points={mmOutcome.pts} fit={mmOutcome.res} theme={theme} />
            </>
          )}
        </>
      )}

      {mode === 'batch' && (
        <>
          <div className="field">
            <label htmlFor="batch-textarea">{t('kinetics.batchInputLabel')}</label>
            <textarea
              id="batch-textarea"
              rows={7}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="field-row">
            <NumField label={t('kinetics.extCoeff')} value={extCoeff} onChange={setExtCoeff} />
            <NumField label={t('kinetics.pathLen')} value={pathLen} onChange={setPathLen} />
          </div>
          {batchOutcome?.err && <Err>{batchOutcome.err}</Err>}
          {batchOutcome?.res && (
            <Result
              rows={[
                [t('kinetics.blankSlope'), `${fmtSci(batchOutcome.res.blankSlope, 4)} (n=${batchOutcome.res.blankCount})`],
                ...batchOutcome.res.samples.map((s) => [
                  `${s.name} (R²=${fmt(s.r2, 4)})`,
                  s.rateMicromolarPerUnit != null
                    ? `${fmtSci(s.netSlope, 4)} /unit | ${fmt(s.rateMicromolarPerUnit, 3)} µM/unit`
                    : `${fmtSci(s.netSlope, 4)} /unit`,
                ]),
              ]}
            />
          )}
        </>
      )}
    </Card>
  );
}
