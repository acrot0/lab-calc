/**
 * Human-readable one-line summaries for the history list.
 *
 * Moved out of the calc layer when i18n arrived: the calc modules are pure and
 * language-free, but a summary is a presentation string. Keeping it here also
 * means the summary follows the UI language at render time, so switching to
 * English re-renders the existing history in English rather than leaving old
 * entries stranded in the previous language.
 *
 * The record itself stores only `kind`, `inputs` and `outputs` — the summary is
 * derived, never persisted. That is what makes a language switch retroactive.
 */
const fmt = (v, digits = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '?');

export function recordSummary(record, t) {
  const kind = record?.kind ?? 'unknown';
  const i = record?.inputs ?? {};
  const o = record?.outputs ?? {};

  switch (kind) {
    case 'massForMolarity':
    case 'stockFromSolid':
      return t('summaries.weigh', {
        mass: fmt(o.massG), formula: i.formula, volume: i.volumeMl, molarity: i.molarity,
      });

    case 'dilution':
      return t('summaries.dilution', {
        stock: fmt(o.stockVolumeMl), diluent: fmt(o.diluentVolumeMl),
        from: i.stockConc, to: i.targetConc,
      });

    case 'dilutionSeries':
      return t('summaries.series', {
        steps: i.steps, factor: i.factor, stock: i.stockConc, volume: i.stepVolumeMl,
      });

    case 'bufferRecipe':
      return t('summaries.buffer', { ph: i.targetPh, pka: i.pKa });

    case 'phCalc':
      return t('summaries.ph', {
        kind: i.kind === 'acid' ? t('ph.weakAcid') : t('ph.weakBase'),
        pk: i.pk, conc: i.conc,
      });

    case 'percentSolution':
      return o.massG != null
        ? t('summaries.percentPrepare', { percent: i.percent, formula: i.formula, volume: i.volumeMl })
        : t('summaries.percentConvert', { molarity: i.molarity, formula: i.formula });

    case 'titrationCurve': {
      // Name the acid by its actual type. A polyprotic acid is not a "weak
      // acid" in the sense the summary used to imply, and labelling it that way
      // makes the history entry wrong about what was calculated.
      const kindKey = i.acidType ?? 'weakAcid';
      const kind = t(`curve.${kindKey}`);
      const detail = i.pKas?.length ? ` (pKa ${i.pKas.join('/')})`
        : i.pKa != null ? ` (pKa ${i.pKa})` : '';
      return t('summaries.curve', {
        conc: i.conc,
        acidKind: `${kind}${detail}`,
        volume: i.volumeMl,
        eqVolume: fmt(o.equivalenceMl),
        eqPh: fmt(o.equivalencePh),
      });
    }

    default:
      // An unknown kind renders as its translated name rather than throwing:
      // a history list that dies on one bad row loses all of them.
      return t(`kinds.${kind}`);
  }
}
