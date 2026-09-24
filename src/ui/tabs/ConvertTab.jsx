import React, { useState, useMemo } from 'react';
import { unitConvert, MASS_UNITS, VOLUME_UNITS, CONC_UNITS } from '../../calc/buffer.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';

const ALL_UNITS = { ...MASS_UNITS, ...VOLUME_UNITS, ...CONC_UNITS };

export default function ConvertTab() {
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState('g');
  const [to, setTo] = useState('mg');
  const [err, setErr] = useState(null);

  const result = useMemo(() => {
    try {
      setErr(null);
      return unitConvert(n(value), from, to);
    } catch (e) {
      setErr(e.message);
      return null;
    }
  }, [value, from, to]);

  return (
    <div className="card">
      <NumField label="数值" value={value} onChange={setValue} />
      <div className="row">
        <div className="field">
          <label htmlFor="from">从</label>
          <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {Object.keys(ALL_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">到</label>
          <select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
            {Object.keys(ALL_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      {err && <Err>{err}</Err>}
      <Result value={result !== null ? fmt(result, 6) : null} unit={to} />
    </div>
  );
}

