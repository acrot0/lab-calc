import React, { useState, useEffect } from 'react';
import {
  moleConvert, cfuPerMl, nucleicAcid, masterMix, COUNTABLE_MIN, COUNTABLE_MAX,
} from '../../calc/lab.mjs';
import { NumField, TextField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/**
 * Everyday bench arithmetic: moles, plating, nucleic acids, master mixes.
 *
 * Four modes, one kind (`lab`) in the history — the summary branches on `mode`,
 * the same shape the reagent tab uses.
 */
const MODES = ['moles', 'cfu', 'nucleic', 'mix'];
const NA_KINDS = ['dsDNA', 'ssDNA', 'RNA'];

/**
 * Which direction each mode's two-way choice starts on.
 *
 * Switching mode has to reset the direction, because the two modes share one
 * piece of state: leaving `conc` selected while the moles mode is showing means
 * neither segment is highlighted and the calculation silently takes the
 * fallback branch — a wrong answer with no visible cause.
 */
const DEFAULT_DIR = { moles: 'mass', nucleic: 'conc' };

/** Turn the raw string state into calc inputs plus the result. */
function compute(mode, dir, s) {
  if (mode === 'moles') {
    const inputs = {
      mode,
      formula: s.formula,
      volumeMl: s.volumeMl === '' ? undefined : n(s.volumeMl),
    };
    // The direction picks which of mass/moles is the given one; sending both
    // would be over-determined and the calc layer refuses it.
    if (dir === 'mass') inputs.massG = n(s.massG);
    else inputs.moles = n(s.moles);
    return { inputs, outputs: moleConvert(inputs) };
  }

  if (mode === 'cfu') {
    const inputs = {
      mode,
      colonies: n(s.colonies),
      dilutionFactor: n(s.dilutionFactor),
      platedVolumeMl: n(s.platedVolumeMl),
    };
    return { inputs, outputs: cfuPerMl(inputs) };
  }

  if (mode === 'nucleic') {
    const inputs = {
      mode,
      kind: s.naKind,
      lengthBp: n(s.lengthBp),
      volumeUl: s.volumeUl === '' ? undefined : n(s.volumeUl),
    };
    if (dir === 'conc') inputs.concNgPerUl = n(s.concNgPerUl);
    else inputs.copiesPerUl = n(s.copiesPerUl);
    return { inputs, outputs: nucleicAcid(inputs) };
  }

  const components = s.components.map((c) => ({ name: c.name, perReaction: n(c.perReaction) }));
  const inputs = { mode, components, reactions: n(s.reactions), excessPercent: n(s.excess) };
  return { inputs, outputs: masterMix(inputs) };
}

export default function LabTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'moles');
  const [dir, setDir] = useState(restored?.massG != null ? 'mass' : restored?.concNgPerUl != null ? 'conc' : restored?.copiesPerUl != null ? 'copies' : 'mass');
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [massG, setMassG] = useState(restored?.massG != null ? String(restored.massG) : '5.844');
  const [moles, setMoles] = useState(restored?.moles != null ? String(restored.moles) : '0.1');
  const [volumeMl, setVolumeMl] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '500');
  const [colonies, setColonies] = useState(restored?.colonies != null ? String(restored.colonies) : '150');
  const [dilutionFactor, setDilutionFactor] = useState(restored?.dilutionFactor != null ? String(restored.dilutionFactor) : '10000');
  const [platedVolume, setPlatedVolume] = useState(restored?.platedVolumeMl != null ? String(restored.platedVolumeMl) : '0.1');
  const [naKind, setNaKind] = useState(restored?.kind ?? 'dsDNA');
  const [lengthBp, setLengthBp] = useState(restored?.lengthBp != null ? String(restored.lengthBp) : '1000');
  const [concNg, setConcNg] = useState(restored?.concNgPerUl != null ? String(restored.concNgPerUl) : '100');
  const [copies, setCopies] = useState(restored?.copiesPerUl != null ? String(restored.copiesPerUl) : '1e10');
  const [volumeUl, setVolumeUl] = useState(restored?.volumeUl != null ? String(restored.volumeUl) : '50');
  const [components, setComponents] = useState(restored?.components ?? [
    { name: '2× Master Mix', perReaction: '10' },
    { name: 'Primer F', perReaction: '0.5' },
    { name: 'Primer R', perReaction: '0.5' },
    { name: 'Template', perReaction: '1' },
  ]);
  const [reactions, setReactions] = useState(restored?.reactions != null ? String(restored.reactions) : '24');
  const [excess, setExcess] = useState(restored?.excessPercent != null ? String(restored.excessPercent) : '10');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  const deps = [mode, dir, formula, massG, moles, volumeMl, colonies, dilutionFactor, platedVolume,
    naKind, lengthBp, concNg, copies, volumeUl, components, reactions, excess];
  useEffect(() => { setOut(null); setErr(null); }, deps);

  // Switching between the two modes that own the direction selector must also
  // reset the direction itself, or the leftover value belongs to the mode that
  // is no longer on screen. Runs on the mode only, so the user's own choice
  // within a mode is not overridden.
  useEffect(() => {
    const d = DEFAULT_DIR[mode];
    if (d) setDir(d);
  }, [mode]);

  function run() {
    try {
      const { inputs, outputs } = compute(mode, dir, {
        formula, massG, moles, volumeMl, colonies, dilutionFactor, platedVolumeMl: platedVolume,
        naKind, lengthBp, concNgPerUl: concNg, copiesPerUl: copies, volumeUl,
        components, reactions, excess,
      });
      setOut({ mode, ...outputs });
      setErr(null);
      onRecord({ kind: 'lab', inputs, outputs, summary: recordSummary({ kind: 'lab', inputs, outputs }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const shown = shownFor(out, 'mode', mode);
  const setComponent = (i, patch) => setComponents(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="lab-mode">{t('lab.mode')}</label>
        <select id="lab-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`lab.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode === 'moles' && (
        <>
          <TextField label={t('common.formula')} value={formula} onChange={setFormula}
            hint={t('lab.formulaHint')} />
          <Direction id="moles-dir" label={t('lab.direction')} value={dir} onChange={setDir}
            options={[['mass', t('lab.dirMass')], ['moles', t('lab.dirMoles')]]} t={t} />
          {dir === 'mass'
            ? <NumField label={t('lab.mass')} value={massG} onChange={setMassG} min="0" />
            : <NumField label={t('lab.moles')} value={moles} onChange={setMoles} min="0" />}
          <NumField label={t('lab.volumeOptional')} value={volumeMl} onChange={setVolumeMl} min="0"
            hint={t('lab.volumeOptionalHint')} />
        </>
      )}

      {mode === 'cfu' && (
        <>
          <div className="row">
            <NumField label={t('lab.colonies')} value={colonies} onChange={setColonies} min="0" step="1" />
            <NumField label={t('lab.platedVolume')} value={platedVolume} onChange={setPlatedVolume} min="0"
              hint={t('lab.platedVolumeHint')} />
          </div>
          <NumField label={t('lab.dilutionFactor')} value={dilutionFactor} onChange={setDilutionFactor} min="0"
            hint={t('lab.dilutionFactorHint')} />
        </>
      )}

      {mode === 'nucleic' && (
        <>
          <div className="field">
            <label htmlFor="na-kind">{t('lab.naKind')}</label>
            <select id="na-kind" value={naKind} onChange={(e) => setNaKind(e.target.value)}>
              {NA_KINDS.map((k) => <option key={k} value={k}>{t(`lab.na_${k}`)}</option>)}
            </select>
          </div>
          <NumField label={t('lab.lengthBp')} value={lengthBp} onChange={setLengthBp} min="1"
            hint={t('lab.lengthBpHint')} />
          <Direction id="na-dir" label={t('lab.direction')} value={dir} onChange={setDir}
            options={[['conc', t('lab.dirConc')], ['copies', t('lab.dirCopies')]]} t={t} />
          {dir === 'conc'
            ? <NumField label={t('lab.concNg')} value={concNg} onChange={setConcNg} min="0" />
            : <NumField label={t('lab.copies')} value={copies} onChange={setCopies} min="0" />}
          <NumField label={t('lab.volumeUl')} value={volumeUl} onChange={setVolumeUl} min="0"
            hint={t('lab.volumeUlHint')} />
        </>
      )}

      {mode === 'mix' && (
        <>
          <div className="ion-list">
            {components.map((c, i) => (
              // Explicit ids: every row carries the same two labels, so a
              // derived id would repeat and strand all but the first row.
              <div className="mix-row" key={i}>
                <TextField id={`mix-name-${i}`} label={t('lab.componentName')} value={c.name}
                  onChange={(v) => setComponent(i, { name: v })} />
                <NumField id={`mix-vol-${i}`} label={t('lab.perReaction')} value={c.perReaction} min="0"
                  onChange={(v) => setComponent(i, { perReaction: v })} />
                {components.length > 1 && (
                  <button className="icon-btn ion-del" aria-label={t('lab.removeComponent')}
                    onClick={() => setComponents(components.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
          </div>
          <button className="control" onClick={() => setComponents([...components, { name: '', perReaction: '1' }])}>
            + {t('lab.addComponent')}
          </button>
          <div className="row">
            <NumField label={t('lab.reactions')} value={reactions} onChange={setReactions} min="1" step="1" />
            <NumField label={t('lab.excess')} value={excess} onChange={setExcess} min="0"
              hint={t('lab.excessHint')} />
          </div>
        </>
      )}

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'moles' && (
        <Result value={fmtSci(shown.moles, 4)} unit="mol"
          note={t('lab.molesNote', { molarMass: fmt(shown.molarMass, 2) })}
          rows={[
            [t('lab.mass'), `${fmtSci(shown.massG, 4)} g`],
            // Particles and copy numbers run to 1e22, where a plain decimal is
            // a wall of digits and Number#toString falls back to "6.02e+22".
            // The same is true downwards: a nanogram of solute is 1e-11 mol,
            // which fmt rounds to "0" and reads as an empty tube.
            [t('lab.particles'), fmtSci(shown.particles)],
            ...(shown.molarity != null
              ? [[t('lab.molarity'), `${fmtSci(shown.molarity, 4)} mol/L`]]
              : []),
          ]} />
      )}

      {shown?.mode === 'cfu' && (
        <Result value={fmtSci(shown.cfuPerMl)} unit="CFU/mL"
          note={t('lab.cfuNote', { min: COUNTABLE_MIN, max: COUNTABLE_MAX })} />
      )}
      {shown?.mode === 'cfu' && shown.countWarning && (
        <Warn>{errorMessage(shown.countWarning, t)}</Warn>
      )}

      {shown?.mode === 'nucleic' && (
        <Result value={fmtSci(shown.pmolPerUl, 4)} unit="pmol/µL"
          note={t('lab.naNote', { kind: t(`lab.na_${naKind}`), residue: shown.residueMass })}
          rows={[
            [t('lab.concNg'), `${fmtSci(shown.concNgPerUl, 3)} ng/µL`],
            [t('lab.copies'), `${fmtSci(shown.copiesPerUl)} copies/µL`],
            ...(shown.totalNg != null
              ? [[t('lab.totalMass'), `${fmtSci(shown.totalNg, 3)} ng`], [t('lab.totalPmol'), `${fmtSci(shown.totalPmol, 3)} pmol`]]
              : []),
          ]} />
      )}

      {shown?.mode === 'mix' && (
        <div className="result">
          <div className="result-main">
            {fmt(shown.totalReactions, 1)}<span className="unit">{t('lab.reactionUnits')}</span>
          </div>
          <div className="result-note">{t('lab.mixNote', { excess })}</div>
          <table className="series-table">
            <thead>
              <tr>
                <th scope="col">{t('lab.colComponent')}</th>
                <th scope="col">{t('lab.colPerReaction')}</th>
                <th scope="col">{t('lab.colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.name}</th>
                  <td>{fmt(r.perReaction, 2)} µL</td>
                  <td>{fmt(r.total, 2)} µL</td>
                </tr>
              ))}
              <tr>
                <th scope="row">{t('lab.total')}</th>
                <td />
                <td>{fmt(shown.totalVolume, 2)} µL</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A two-option radio pair, used where the input direction is a real choice. */
function Direction({ id, label, value, onChange, options, t }) {
  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>{label}</span>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v}
            className={`seg-btn${value === v ? ' is-on' : ''}`} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
      <span className="sr-only">{t('lab.directionHint')}</span>
    </div>
  );
}
