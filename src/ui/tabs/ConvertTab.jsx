import React, { useState, useMemo } from 'react';
import { unitConvert, MASS_UNITS, VOLUME_UNITS, CONC_UNITS } from '../../calc/buffer.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';

const ALL_UNITS = { ...MASS_UNITS, ...VOLUME_UNITS, ...CONC_UNITS };

export default function ConvertTab() {
  const { t } = useI18n();
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState('g');
  const [to, setTo] = useState('mg');
  const [err, setErr] = useState(null);

  const result = useMemo(() => {
    try {
      setErr(null);
      return unitConvert(n(value), from, to);
    } catch (e) {
      setErr(errorMessage(e, t));
      return null;
    }
  }, [value, from, to, t]);

  return (
    <div className="card">
      <NumField label={t('convert.value')} value={value} onChange={setValue} />
      <div className="row">
        <div className="field">
          <label htmlFor="from">{t('convert.from')}</label>
          <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {Object.keys(ALL_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">{t('convert.to')}</label>
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
