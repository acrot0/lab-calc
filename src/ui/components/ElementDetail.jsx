import React from 'react';
import { categoryOf, blockOf } from '../../calc/elements.mjs';
import { discoveryOf } from '../../calc/element-discovery.mjs';
import { fmt, fmtSci } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * An era as a sentence, e.g. "before 5000 BC" or "c. AD 300".
 *
 * The kinds are translated rather than formatted with Intl: these are not dates
 * — "before 5000 BC" is an upper bound on an archaeological estimate, and a date
 * formatter would render it as a day in a month that nobody ever recorded.
 */
function eraText(era, t) {
  return t(`elements.era_${era.kind}`, { years: era.years });
}

/**
 * The detail panel for the selected element.
 *
 * Extracted from ElementsTab, which had grown past the project's 500-line
 * limit. This is the natural seam: the panel is a pure function of the
 * selected element and its properties, it holds no state, and it does not
 * touch the grid, the search or the comparison — none of which it can break by
 * changing.
 */
export default function ElementDetail({ element, chemPeriod, onDetachedRow, config, properties }) {
  const { t } = useI18n();
  if (!element) return null;

  const selected = element;
  const cfg = config;
  const props = properties;
  const cat = categoryOf(selected);
  const blk = blockOf(selected);
  const disc = discoveryOf(selected.number);

  return (
    <div className="result" role="status" aria-live="polite">
      <div className="result-main">
        {selected.symbol}
        <span className="unit">{selected.zh}</span>
      </div>
      <div className="result-note">
        {selected.name} · {t('elements.number')} {selected.number} ·{' '}
        {t('elements.period')} {chemPeriod} ·{' '}
        {/* The f-block rows are drawn at groups 3-17 on this table, so the
            stored group is a drawing coordinate, not chemistry: cerium is
            not in group 4, which is Ti/Zr/Hf/Rf. Name the family instead. */}
        {onDetachedRow
          ? t(`elements.cat_${cat}`)
          : `${t('elements.group')} ${selected.group}`} ·{' '}
        {t(`elements.block_${blk}`)}
      </div>
      <div className="result-grid">
        <div>
          <span>{t('elements.mass')}</span>
          <strong>{fmt(selected.mass, 4)} g/mol</strong>
        </div>
        <div>
          <span>{t('elements.rcow')}</span>
          <strong>{fmt(selected.rcow, 3)} Å</strong>
        </div>
        <div>
          <span>{t('elements.rvdw')}</span>
          <strong>{fmt(selected.rvdw, 3)} Å</strong>
        </div>
        <div>
          <span>{t('elements.category')}</span>
          <strong>{t(`elements.cat_${cat}`)}</strong>
        </div>
        <div>
          <span>{t('elements.valence')}</span>
          <strong>{cfg.valence}</strong>
        </div>
      </div>

      {/* Exam-relevant physical properties. Every one of these is absent
          for some element — an electronegativity never measured, a melting
          point nobody can take for a superheavy — so each renders an
          em dash rather than a zero or a blank cell. A blank reads as a
          rendering bug; a zero reads as a fact. */}
      <div className="result-grid">
        <div>
          <span>{t('elements.electronegativity')}</span>
          <strong>{props.electronegativity === null
            ? t('elements.noValue')
            : fmt(props.electronegativity, 3)}</strong>
        </div>
        <div>
          <span>{t('elements.oxidationStates')}</span>
          <strong>{props.oxidationStates.length === 0
            ? t('elements.noValue')
            : props.oxidationStates.map((s) => (s > 0 ? `+${s}` : String(s))).join(', ')}</strong>
        </div>
        <div>
          <span>{t('elements.melt')}</span>
          <strong>{props.melt === null
            ? t('elements.noValue')
            : `${fmt(props.melt, 4)} ${t('elements.unit_melt')}`}</strong>
        </div>
        <div>
          <span>{t('elements.boil')}</span>
          <strong>{props.boil === null
            ? t('elements.noValue')
            : `${fmt(props.boil, 4)} ${t('elements.unit_boil')}`}</strong>
        </div>
        <div>
          {/* Density spans five orders of magnitude — 8.99e-5 for hydrogen
              against 22.57 for osmium — so a fixed-decimal format renders
              the gases as 0.000 g/cm3. */}
          <span>{t('elements.density')}</span>
          <strong>{props.density === null
            ? t('elements.noValue')
            : `${fmtSci(props.density, 4)} ${t('elements.unit_density')}`}</strong>
        </div>
        <div>
          <span>{t('elements.ionization')}</span>
          <strong>{props.ionization === null
            ? t('elements.noValue')
            : `${fmt(props.ionization, 4)} ${t('elements.unit_ionization')}`}</strong>
        </div>
        <div>
          <span>{t('elements.yearDiscovered')}</span>
          {/* Two shapes: a year for anything isolated in recorded history, an
              approximate era for the twelve elements in use before records
              began. Aluminium and calcium used to land here as "antiquity"
              because PubChem files them under "Ancient" — they have years now. */}
          <strong>{disc.year !== null
            ? String(disc.year)
            : t('elements.ancientEra', { era: eraText(disc.era, t) })}</strong>
        </div>
        <div>
          <span>{t('elements.discoveredBy')}</span>
          <strong>{disc.by}</strong>
        </div>
      </div>

      <div className="hint">
        {t('elements.config')} <code className="cfg">{cfg.shorthand}</code>
      </div>
      <div className="hint">
        {t('elements.massSourceNote', {
          source: t(`elements.source_${selected.massSource}`),
        })}
      </div>
      <div className="hint">{t('elements.propertySource')}</div>
      <div className="hint">{t('elements.discoverySource')}</div>
    </div>

  );
}
