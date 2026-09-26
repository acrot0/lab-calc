import React, { useState, useEffect, useMemo } from 'react';
import {
  EXTINCTION, nucleicAcidConc, purityRatios, dilutionToTarget, oligoConc,
  seedingVolume, doublingTime, centrifuge, kFactor,
  michaelisMenten, catalyticEfficiency,
} from '../../calc/bio.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

/**
 * Molecular biology: the nine calculations a wet lab does every day.
 *
 * Grouped into one tab with a mode selector rather than nine tabs. The rail is
 * already fifteen entries and a sixteenth would make it a menu; these also
 * share inputs — a dilution is the same dilution whether the answer wanted was
 * a volume or a concentration — so switching mode keeps what was typed.
 *
 * Each mode names its own units on every field, because that is where the
 * errors are: a concentration in ng/µL and one in µg/mL differ by a thousand,
 * and a field that does not say which is a field that gets both.
 */
const MODES = [
  'nucleic', 'purity', 'dilution', 'oligo', 'seeding', 'doubling', 'centrifuge', 'kinetics',
];

/** Which nucleic acid types offer a coefficient, in the order a menu should list them. */
const NA_TYPES = ['dsDNA', 'rna', 'ssDNA', 'oligo'];

export default function BioTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'nucleic');

  // Nucleic acid
  const [a260, setA260] = useState(restored?.a260 != null ? String(restored.a260) : '0.85');
  const [naType, setNaType] = useState(restored?.naType ?? 'dsDNA');
  const [pathCm, setPathCm] = useState(restored?.pathCm != null ? String(restored.pathCm) : '1');
  const [dilution, setDilution] = useState(restored?.dilution != null ? String(restored.dilution) : '1');

  // Purity
  const [a280, setA280] = useState(restored?.a280 != null ? String(restored.a280) : '0.47');
  const [a230, setA230] = useState(restored?.a230 != null ? String(restored.a230) : '0.4');

  // Dilution
  const [stockConc, setStockConc] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1000');
  const [finalVol, setFinalVol] = useState(restored?.finalVol != null ? String(restored.finalVol) : '100');
  const [targetConc, setTargetConc] = useState(restored?.targetConc != null ? String(restored.targetConc) : '10');

  // Oligo
  const [sequence, setSequence] = useState(restored?.sequence ?? 'ATGCGTACGTAGCTAGCTAG');

  // Seeding
  const [stockDensity, setStockDensity] = useState(restored?.stockDensity != null ? String(restored.stockDensity) : '1000000');
  const [targetDensity, setTargetDensity] = useState(restored?.targetDensity != null ? String(restored.targetDensity) : '100000');
  const [cultureVol, setCultureVol] = useState(restored?.cultureVol != null ? String(restored.cultureVol) : '10');

  // Doubling
  const [cells0, setCells0] = useState(restored?.cells0 != null ? String(restored.cells0) : '100000');
  const [cells1, setCells1] = useState(restored?.cells1 != null ? String(restored.cells1) : '800000');
  const [hours, setHours] = useState(restored?.hours != null ? String(restored.hours) : '48');

  // Centrifuge
  const [radius, setRadius] = useState(restored?.radius != null ? String(restored.radius) : '10');
  const [rpm, setRpm] = useState(restored?.rpm != null ? String(restored.rpm) : '12000');

  // Kinetics
  const [kcat, setKcat] = useState(restored?.kcat != null ? String(restored.kcat) : '100');
  const [km, setKm] = useState(restored?.km != null ? String(restored.km) : '0.05');
  const [pointsText, setPointsText] = useState(
    restored?.pointsText ?? '0.5,2.5\n1,5\n2,6.7\n5,7.1\n10,8.3',
  );

  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setOut(null); setErr(null);
  }, [mode, a260, naType, pathCm, dilution, a280, a230, stockConc, finalVol, targetConc,
    sequence, stockDensity, targetDensity, cultureVol, cells0, cells1, hours, radius, rpm,
    kcat, km, pointsText]);

  function run() {
    try {
      let inputs;
      let r;

      if (mode === 'nucleic') {
        inputs = { mode, a260: n(a260), naType, pathCm: n(pathCm), dilution: n(dilution) };
        r = nucleicAcidConc(n(a260), naType, n(pathCm), n(dilution));
      } else if (mode === 'purity') {
        inputs = { mode, a260: n(a260), a280: n(a280), a230: n(a230) };
        r = purityRatios(n(a260), n(a280), n(a230));
      } else if (mode === 'dilution') {
        inputs = { mode, stockConc: n(stockConc), finalVol: n(finalVol), targetConc: n(targetConc) };
        r = dilutionToTarget(n(stockConc), n(finalVol), n(targetConc));
      } else if (mode === 'oligo') {
        inputs = { mode, a260: n(a260), sequence };
        r = oligoConc(n(a260), sequence);
      } else if (mode === 'seeding') {
        inputs = { mode, stockDensity: n(stockDensity), targetDensity: n(targetDensity), cultureVol: n(cultureVol) };
        r = seedingVolume(n(stockDensity), n(targetDensity), n(cultureVol));
      } else if (mode === 'doubling') {
        inputs = { mode, cells0: n(cells0), cells1: n(cells1), hours: n(hours) };
        r = doublingTime(n(cells0), n(cells1), n(hours));
      } else if (mode === 'centrifuge') {
        inputs = { mode, radius: n(radius), rpm: n(rpm) };
        const c = centrifuge(n(rpm), n(radius), 'rpm');
        r = { ...c, k: kFactor(n(radius)).k };
      } else {
        const pts = parsePoints(pointsText);
        inputs = { mode, kcat: n(kcat), km: n(km), points: pts };
        const fit = michaelisMenten(pts);
        r = { ...fit, ...catalyticEfficiency(n(kcat), n(km)) };
      }

      setOut({ mode, ...r });
      setErr(null);
      onRecord({
        kind: 'bio', inputs, outputs: r,
        summary: recordSummary({ kind: 'bio', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const shown = shownFor(out, 'mode', mode);

  /*
   * The worked step for each mode.
   *
   * Not decoration: every one of these is a place a factor of ten hides. The
   * substitution line shows which coefficient was used and what the units were,
   * so a wrong answer is traceable to the number that caused it rather than
   * being an opaque result.
   */
  const worked = useMemo(() => {
    if (!shown) return null;
    const k = EXTINCTION[naType];

    if (shown.mode === 'nucleic') {
      return [
        { term: 'c', value: t('common.worked_bioNucleic') },
        {
          term: '',
          value: t('common.worked_bioNucleicStep', {
            a: fmt(n(a260), 4), k: fmt(k, 0), path: fmt(n(pathCm), 3),
            dil: fmtSci(n(dilution), 3), c: fmtSci(shown.concNgPerUl, 4),
          }),
        },
      ];
    }
    if (shown.mode === 'purity') {
      return [
        { term: 'A260/A280', value: t('common.worked_bioRatio280', { r: shown.ratio260280 === null ? '—' : fmt(shown.ratio260280, 3) }) },
        { term: 'A260/A230', value: t('common.worked_bioRatio230', { r: shown.ratio260230 === null ? '—' : fmt(shown.ratio260230, 3) }) },
      ];
    }
    if (shown.mode === 'dilution') {
      return [
        { term: 'V₁', value: t('common.worked_bioDilution') },
        {
          term: '',
          value: t('common.worked_bioDilutionStep', {
            c2: fmtSci(n(targetConc), 4), v2: fmtSci(n(finalVol), 4), c1: fmtSci(n(stockConc), 4),
            v1: fmt(shown.sampleUl, 4),
          }),
        },
      ];
    }
    if (shown.mode === 'oligo') {
      return [
        { term: 'M', value: t('common.worked_bioOligoMass', { m: fmt(shown.molarMass, 2) }) },
        {
          term: '',
          value: t('common.worked_bioOligoStep', {
            a: fmt(n(a260), 4), gc: fmt(shown.gc * 100, 1), c: fmt(shown.nmolPerUl, 4),
          }),
        },
      ];
    }
    if (shown.mode === 'seeding') {
      return [
        { term: 'V', value: t('common.worked_bioSeeding') },
        {
          term: '',
          value: t('common.worked_bioSeedingStep', {
            c2: fmtSci(n(targetDensity), 3), v2: fmt(n(cultureVol), 3), c1: fmtSci(n(stockDensity), 3),
            v: fmt(shown.volumeUl, 3),
          }),
        },
      ];
    }
    if (shown.mode === 'doubling') {
      return [
        { term: 'n', value: t('common.worked_bioDoublings', { n: fmt(shown.doublings, 3) }) },
        {
          term: '',
          value: t('common.worked_bioDoublingStep', {
            c1: fmtSci(n(cells0), 3), c2: fmtSci(n(cells1), 3), h: fmt(n(hours), 3),
            td: shown.doublingTimeH === Infinity ? '∞' : fmt(shown.doublingTimeH, 3),
          }),
        },
      ];
    }
    if (shown.mode === 'centrifuge') {
      return [
        { term: 'RCF', value: t('common.worked_bioRcf') },
        {
          term: '',
          value: t('common.worked_bioRcfStep', {
            r: fmt(n(radius), 3), rpm: fmt(n(rpm), 0), rcf: fmtSci(shown.rcf, 4),
          }),
        },
      ];
    }
    return [
      { term: 'Vmax', value: t('common.worked_bioVmax', { v: fmt(shown.vmax, 4) }) },
      { term: 'Km', value: t('common.worked_bioKm', { k: fmt(shown.km, 4) }) },
      { term: 'kcat/Km', value: t('common.worked_bioEff', { e: fmtSci(shown.efficiency, 4) }) },
    ];
  }, [shown, naType, a260, pathCm, dilution, targetConc, finalVol, stockConc,
    targetDensity, cultureVol, stockDensity, cells0, cells1, hours, radius, rpm, t]);

  return (
    <Card>
      <div className="field">
        <label htmlFor="bio-mode">{t('bio.mode')}</label>
        <select id="bio-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`bio.mode_${m}`)}</option>)}
        </select>
      </div>

      {/* --- Nucleic acid concentration --- */}
      {(mode === 'nucleic' || mode === 'purity' || mode === 'oligo') && (
        <NumField label={t('bio.a260')} value={a260} onChange={setA260} min="0"
          hint={t('bio.a260Hint')} />
      )}

      {mode === 'nucleic' && (
        <>
          <div className="field">
            <label htmlFor="bio-type">{t('bio.nucleicType')}</label>
            <select id="bio-type" value={naType} onChange={(e) => setNaType(e.target.value)}>
              {NA_TYPES.map((k) => (
                <option key={k} value={k}>{t(`bio.na_${k}`)} — {EXTINCTION[k]}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <NumField label={t('bio.pathCm')} value={pathCm} onChange={setPathCm} min="0"
              hint={t('bio.pathCmHint')} />
            <NumField label={t('bio.dilution')} value={dilution} onChange={setDilution} min="0"
              hint={t('bio.dilutionHint')} />
          </div>
        </>
      )}

      {/* --- Purity --- */}
      {mode === 'purity' && (
        <div className="row">
          <NumField label={t('bio.a280')} value={a280} onChange={setA280} min="0" />
          <NumField label={t('bio.a230')} value={a230} onChange={setA230} min="0" />
        </div>
      )}

      {/* --- Dilution --- */}
      {mode === 'dilution' && (
        <>
          <div className="row">
            <NumField label={t('bio.stockConc')} value={stockConc} onChange={setStockConc} min="0" />
            <NumField label={t('bio.targetConc')} value={targetConc} onChange={setTargetConc} min="0" />
          </div>
          <NumField label={t('bio.finalVol')} value={finalVol} onChange={setFinalVol} min="0" />
        </>
      )}

      {/* --- Oligo --- */}
      {mode === 'oligo' && (
        <div className="field">
          <label htmlFor="bio-seq">{t('bio.sequence')}</label>
          <input
            id="bio-seq"
            type="text"
            value={sequence}
            spellCheck="false"
            placeholder="ATGCGTACGTAGCTAGCTAG"
            onChange={(e) => setSequence(e.target.value)}
            style={{ fontFamily: 'var(--font-num)', letterSpacing: '0.06em' }}
          />
          <div className="hint">{t('bio.sequenceHint')}</div>
        </div>
      )}

      {/* --- Seeding --- */}
      {mode === 'seeding' && (
        <>
          <div className="row">
            <NumField label={t('bio.stockDensity')} value={stockDensity} onChange={setStockDensity} min="0"
              hint={t('bio.densityHint')} />
            <NumField label={t('bio.targetDensity')} value={targetDensity} onChange={setTargetDensity} min="0" />
          </div>
          <NumField label={t('bio.cultureVol')} value={cultureVol} onChange={setCultureVol} min="0" />
        </>
      )}

      {/* --- Doubling time --- */}
      {mode === 'doubling' && (
        <>
          <div className="row">
            <NumField label={t('bio.cells0')} value={cells0} onChange={setCells0} min="0" />
            <NumField label={t('bio.cells1')} value={cells1} onChange={setCells1} min="0" />
          </div>
          <NumField label={t('bio.hours')} value={hours} onChange={setHours} min="0" />
        </>
      )}

      {/* --- Centrifuge --- */}
      {mode === 'centrifuge' && (
        <div className="row">
          <NumField label={t('bio.rpm')} value={rpm} onChange={setRpm} min="0" />
          <NumField label={t('bio.radius')} value={radius} onChange={setRadius} min="0"
            hint={t('bio.radiusHint')} />
        </div>
      )}

      {/* --- Kinetics --- */}
      {mode === 'kinetics' && (
        <>
          <div className="field">
            <label htmlFor="bio-points">{t('bio.kineticsPoints')}</label>
            <textarea
              id="bio-points"
              rows={5}
              value={pointsText}
              spellCheck="false"
              onChange={(e) => setPointsText(e.target.value)}
              style={{ fontFamily: 'var(--font-num)' }}
            />
            <div className="hint">{t('bio.kineticsPointsHint')}</div>
          </div>
          <div className="row">
            <NumField label={t('bio.kcat')} value={kcat} onChange={setKcat} min="0" hint={t('bio.kcatHint')} />
            <NumField label={t('bio.kmInput')} value={km} onChange={setKm} min="0" />
          </div>
        </>
      )}

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'nucleic' && (
        <Result
          value={fmtSci(shown.concNgPerUl, 4)}
          unit="ng/µL"
          note={t('bio.nucleicNote', { k: shown.coefficient, type: t(`bio.na_${naType}`) })}
          rows={[
            [t('bio.concUgMl'), `${fmtSci(shown.concUgPerMl, 4)} µg/mL`],
            [t('bio.coefficient'), `${shown.coefficient} µg/mL per A260`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'purity' && (
        <Result
          value={shown.ratio260280 === null ? '—' : fmt(shown.ratio260280, 3)}
          unit="A260/A280"
          note={t(`bio.verdict_${shown.verdict}`)}
          rows={[
            [t('bio.ratio260230'), shown.ratio260230 === null ? '—' : fmt(shown.ratio260230, 3)],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'dilution' && (
        <Result
          value={fmt(shown.sampleUl, 4)}
          unit="µL"
          note={t('bio.dilutionNote', { diluent: fmt(shown.diluentUl, 4), total: fmt(shown.totalUl, 4) })}
          rows={[
            [t('bio.diluent'), `${fmt(shown.diluentUl, 4)} µL`],
            [t('bio.fold'), `1 : ${fmt(shown.fold, 4)}`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'oligo' && (
        <Result
          value={fmt(shown.nmolPerUl, 4)}
          unit="nmol/µL"
          note={t('bio.oligoNote', { m: fmt(shown.molarMass, 2) })}
          rows={[
            [t('bio.concUgMl'), `${fmtSci(shown.ugPerMl, 4)} µg/mL`],
            [t('bio.gc'), `${fmt(shown.gc * 100, 1)} %`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'seeding' && (
        <Result
          value={fmt(shown.volumeUl, 4)}
          unit="µL"
          note={t('bio.seedingNote', { cells: fmtSci(shown.cellsNeeded, 4), vol: fmt(n(cultureVol), 3) })}
          rows={[
            [t('bio.dilutionFold'), `1 : ${fmt(shown.dilution, 4)}`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'doubling' && (
        <Result
          value={shown.doublingTimeH === Infinity ? '∞' : fmt(shown.doublingTimeH, 3)}
          unit="h"
          note={t('bio.doublingNote', { n: fmt(shown.doublings, 3) })}
          rows={[
            [t('bio.doublings'), fmt(shown.doublings, 3)],
            [t('bio.ratePerH'), `${fmt(shown.ratePerH, 4)} /h`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'centrifuge' && (
        <Result
          value={fmtSci(shown.rcf, 4)}
          unit="× g"
          note={t('bio.rcfNote', { rpm: fmt(n(rpm), 0), radius: fmt(n(radius), 3) })}
          rows={[
            [t('bio.kFactor'), fmt(shown.k, 0)],
            [t('bio.timeAtRcf'), `${fmt(shown.k / 10000, 3)} min @ 10 000 × g`],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'kinetics' && (
        <Result
          value={fmt(shown.vmax, 4)}
          unit="Vmax"
          note={t('bio.kineticsNote', { n: shown.points, r2: fmt(shown.r2, 4) })}
          rows={[
            [t('bio.km'), fmt(shown.km, 4)],
            [t('bio.kcatOverKm'), `${fmtSci(shown.efficiency, 4)} M⁻¹s⁻¹`],
            [t('bio.r2'), fmt(shown.r2, 4)],
          ]}
          worked={worked} workedLabel={t('common.worked')}
        />
      )}

      {shown?.mode === 'kinetics' && shown.diffusionLimited && (
        <Warn>{t('bio.diffusionLimited')}</Warn>
      )}
    </Card>
  );
}

/**
 * Parse the kinetics table: one `substrate, rate` pair per line.
 *
 * Comma or whitespace separated, because both are what gets pasted out of a
 * spreadsheet. A line that does not parse is dropped rather than throwing —
 * a stray header row is the common case, and the fit already refuses when too
 * few points survive.
 */
export function parsePoints(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t;]+|\s+/).filter(Boolean);
      return { s: Number(parts[0]), v: Number(parts[1]) };
    })
    .filter((p) => Number.isFinite(p.s) && Number.isFinite(p.v));
}
