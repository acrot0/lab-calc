import React, { useState, useEffect } from 'react';
import { nernst, cellFromHalfCells, STANDARD_POTENTIALS } from '../../calc/electro.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n, fmtSci, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/**
 * Electrochemistry — cell potential under non-standard conditions.
 *
 * The half-cell picker exists because the sign convention is the thing people
 * get wrong: both tabulated potentials are reductions, so the cell is
 * E_cathode − E_anode and never the sum.
 */
const MODES = ['nernst', 'cell'];

export default function ElectroTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'nernst');
  const [e0, setE0] = useState(restored?.e0 != null ? String(restored.e0) : '1.1037');
  const [electrons, setElectrons] = useState(restored?.n != null ? String(restored.n) : '2');
  const [q, setQ] = useState(restored?.q != null ? String(restored.q) : '1');
  const [tempC, setTempC] = useState(restored?.tempC != null ? String(restored.tempC) : '25');
  const [cathode, setCathode] = useState(restored?.cathode ?? 'Cu2+/Cu');
  const [anode, setAnode] = useState(restored?.anode ?? 'Zn2+/Zn');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setOut(null); setErr(null);
  }, [mode, e0, electrons, q, tempC, cathode, anode]);

  const halves = Object.keys(STANDARD_POTENTIALS);

  function run() {
    try {
      let inputs;
      let r;
      if (mode === 'cell') {
        inputs = { mode, cathode, anode };
        const cell = cellFromHalfCells(inputs);
        r = { ...cell, ...nernst({ e0: cell.e0, n: n(electrons), q: n(q), tempC: n(tempC) }), e0: cell.e0 };
      } else {
        inputs = { mode, e0: n(e0), n: n(electrons), q: n(q), tempC: n(tempC) };
        r = nernst(inputs);
      }
      setOut({ mode, ...r });
      setErr(null);
      onRecord({ kind: 'electro', inputs, outputs: r, summary: recordSummary({ kind: 'electro', inputs, outputs: r }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const shown = shownFor(out, 'mode', mode);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ec-mode">{t('electro.mode')}</label>
        <select id="ec-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`electro.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode === 'cell' ? (
        <div className="row">
          <div className="field">
            <label htmlFor="ec-cathode">{t('electro.cathode')}</label>
            <select id="ec-cathode" value={cathode} onChange={(e) => setCathode(e.target.value)}>
              {halves.map((h) => <option key={h} value={h}>{h} ({STANDARD_POTENTIALS[h]} V)</option>)}
            </select>
            <div className="hint">{t('electro.cathodeHint')}</div>
          </div>
          <div className="field">
            <label htmlFor="ec-anode">{t('electro.anode')}</label>
            <select id="ec-anode" value={anode} onChange={(e) => setAnode(e.target.value)}>
              {halves.map((h) => <option key={h} value={h}>{h} ({STANDARD_POTENTIALS[h]} V)</option>)}
            </select>
            <div className="hint">{t('electro.anodeHint')}</div>
          </div>
        </div>
      ) : (
        <NumField label={t('electro.e0')} value={e0} onChange={setE0}
          hint={t('electro.e0Hint')} />
      )}

      <div className="row">
        <NumField label={t('electro.electrons')} value={electrons} onChange={setElectrons} min="0"
          hint={t('electro.electronsHint')} />
        <NumField label={t('electro.q')} value={q} onChange={setQ} min="0"
          hint={t('electro.qHint')} />
      </div>
      <NumField label={t('electro.tempC')} value={tempC} onChange={setTempC}
        hint={t('electro.tempCHint')} />

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown && (
        <>
          <Result value={fmt(shown.e, 4)} unit="V"
            note={mode === 'cell'
              ? t('electro.cellNote', {
                  cathode: shown.cathode, anode: shown.anode,
                  ec: fmt(shown.cathodePotential, 4), ea: fmt(shown.anodePotential, 4),
                })
              : t('electro.nernstNote', { e0: fmt(shown.e0, 4), n: shown.n, slope: fmt(shown.slope, 5) })}
            rows={[
              [t('electro.deltaG'), `${fmt(shown.deltaGKJ, 3)} kJ/mol`],
              [t('electro.equilibriumK'), shown.equilibriumK == null ? '—' : fmtSci(shown.equilibriumK)],
              [t('electro.logQ'), fmt(shown.logQ, 4)],
              [t('electro.tempK'), `${fmt(shown.tempK, 2)} K`],
            ]} />
          <Warn>{shown.spontaneous ? t('electro.spontaneous') : t('electro.notSpontaneous')}</Warn>
        </>
      )}
    </div>
  );
}
