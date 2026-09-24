import { fmtSci } from './format.mjs';

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
/**
 * Format a number for a history line.
 *
 * This used to be its own `v.toFixed(digits)`, which meant the summary and the
 * result panel could disagree about the same number — and for a trace amount
 * the summary said "0.00 g" while the panel said "5.844×10⁻⁸ g". One formatter
 * for both, so a value reads the same wherever it appears.
 *
 * The only difference from the panel is the fallback: a history line has to
 * stay legible when a field is missing, so a non-number renders as "?" rather
 * than the panel's em dash.
 */
const fmt = (v, digits = 2) => (
  typeof v === 'number' && Number.isFinite(v) ? fmtSci(v, digits) : '?'
);

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

    case 'reagent': {
      // Five directions share one kind, so the summary branches on `mode`.
      // Without that branch every reagent calculation would read as a stock
      // conversion, which is wrong for four of the five.
      switch (i.mode) {
        case 'volume':
          return t('summaries.reagentVolume', {
            volume: fmt(o.volumeMl), percent: i.percent, formula: i.formula,
            target: i.targetVolumeMl, molarity: i.targetMolarity,
          });
        case 'normality':
          return t('summaries.reagentNormality', {
            molarity: i.molarity, formula: i.formula, n: i.n, normality: fmt(o.normality, 3),
          });
        case 'molality':
          return t('summaries.reagentMolality', {
            moles: i.moles, solvent: i.solventKg, molality: fmt(o.molality, 4),
          });
        case 'ionic':
          return t('summaries.reagentIonic', {
            ionicStrength: fmt(o.ionicStrength, 4), n: i.ions?.length ?? 0,
          });
        default:
          return t('summaries.reagentStock', {
            percent: i.percent, formula: i.formula, density: i.density, molarity: fmt(o.molarity),
          });
      }
    }

    case 'spectro':
      if (i.mode === 'curve') {
        return t('summaries.spectroCurve', {
          n: o.fit?.n ?? 0, r2: fmt(o.fit?.r2, 4), conc: fmt(o.pred?.value, 6),
        });
      }
      return i.mode === 'concentration'
        ? t('summaries.spectroConc', { absorbance: fmt(o.absorbance, 4), conc: fmt(o.conc, 8) })
        : t('summaries.spectroAbs', {
            epsilon: i.epsilon, conc: i.conc, path: i.pathCm, absorbance: fmt(o.absorbance, 4),
          });

    case 'lab': {
      // Four directions share one kind, so the summary branches on `mode`.
      switch (i.mode) {
        case 'cfu':
          return t('summaries.labCfu', {
            colonies: i.colonies, factor: i.dilutionFactor, cfu: fmt(o.cfuPerMl, 4),
          });
        case 'nucleic':
          return t('summaries.labNucleic', {
            length: i.lengthBp, kind: t(`lab.na_${i.kind}`),
            pmol: fmt(o.pmolPerUl, 4), copies: fmt(o.copiesPerUl, 4),
          });
        case 'mix':
          return t('summaries.labMix', {
            reactions: i.reactions, excess: i.excessPercent,
            volume: fmt(o.totalVolume, 1), n: o.rows?.length ?? 0,
          });
        default:
          return t('summaries.labMoles', {
            formula: i.formula, mass: fmt(o.massG, 4), moles: fmt(o.moles, 6),
          });
      }
    }

    case 'colligative': {
      switch (i.mode) {
        case 'osmotic':
          return t('summaries.colligativeOsmotic', {
            molarity: i.molarity, i: i.i, atm: fmt(o.atm, 4),
          });
        case 'unknown':
          return t('summaries.colligativeUnknown', {
            drop: i.deltaTf, solvent: t(`colligative.solvent_${i.solvent}`), molarMass: fmt(o.molarMass, 2),
          });
        default:
          return t('summaries.colligativeShift', {
            solvent: t(`colligative.solvent_${i.solvent}`), molality: i.molality,
            deltaTf: fmt(o.deltaTf, 4), freezingPoint: fmt(o.freezingPoint, 3),
          });
      }
    }

    case 'reaction': {
      switch (i.mode) {
        case 'limiting':
          return t('summaries.reactionLimiting', {
            equation: i.equation, limiting: o.limiting ?? '—', extent: fmt(o.extent, 5),
          });
        case 'formula':
          return t('summaries.reactionFormula', {
            formula: o.formula, M: fmt(o.molarMass, 3), n: i.entries?.length ?? 0,
          });
        default:
          return t('summaries.reactionBalance', { equation: o.equation ?? i.equation });
      }
    }

    case 'electro': {
      // Both directions report a potential; only the cell mode knows which
      // electrode is which, so the summary names them when they are present.
      if (i.mode === 'cell') {
        return t('summaries.electroCell', {
          cathode: i.cathode, anode: i.anode, e: fmt(o.e, 4),
        });
      }
      return t('summaries.electroNernst', {
        e0: i.e0, n: i.n, q: i.q, e: fmt(o.e, 4),
      });
    }

    default:
      // An unknown kind renders as its translated name rather than throwing:
      // a history list that dies on one bad row loses all of them.
      return t(`kinds.${kind}`);
  }
}
