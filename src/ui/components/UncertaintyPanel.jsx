import React from 'react';
import { NumField, Warn } from './Fields.jsx';
import { fmtSci, fmtMeasured } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';

/*
 * The uncertainty budget, as a disclosure rather than a permanent block.
 *
 * Collapsed by default because it is four inputs most sessions do not need, and
 * an always-visible form above the result pushes the result off the first
 * screen. A disclosure rather than a separate tab because the budget is about
 * *this* calculation — a separate page would lose the connection.
 *
 * Every source is listed with its own contribution, not just the total. A
 * single combined number tells the user their result is uncertain; the
 * breakdown tells them which instrument to change, which is the only actionable
 * thing in the whole panel.
 *
 * Extracted from WeighTab when the dilution tab needed the same panel. The
 * instrument inputs are shared because they describe the same bench: a user who
 * has told the app their flask is class A has told it once.
 */

/**
 * The instruments, as a controlled group.
 *
 * `balance: false` hides the mass fields — a calculation that measures a volume
 * into a flask has no weighing step, and showing a readability field would
 * invite the user to think it contributed.
 */
/** One source's contribution, in the shape the panel's list expects. */
export function Contribution({ label, value, unc, unit }) {
  if (!(unc > 0)) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{fmtMeasured(value, unc, { unit: unit ? ` ${unit}` : '' }).uncText}</dd>
    </div>
  );
}

export function UncertaintyPanel({
  open, onToggle, budget, state, balance = true, children, intro, fields, caveats,
  pipetteSizeLabel,
}) {
  const { t } = useI18n();
  const {
    flaskMl, setFlaskMl, flaskGrade, setFlaskGrade, tempC, setTempC,
    pipetteMl, setPipetteMl,
    readabilityG, setReadabilityG, linearityG, setLinearityG,
  } = state;

  return (
    <div className="unc-panel">
      <button type="button" className="link-btn unc-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? '▾' : '▸'} {open ? t('unc.uncHide') : t('unc.uncShow')}
      </button>
      {open && (
        <div className="unc-body">
          {/*
            The intro names the instrument the numbers came from, so a tab whose
            budget is not glassware and a balance supplies its own. The default
            text says "glassware and balance", and leaving it above a cuvette
            budget would be a caption describing a different experiment.
          */}
          <p className="unc-intro">{intro ?? t('unc.uncIntro')}</p>
          {/*
            `fields` replaces the volumetric block wholesale for tabs whose
            instruments are not a flask and a balance — a spectrophotometer has
            neither, and rendering empty flask inputs above a Beer's law budget
            would invite the user to think they contributed.
          */}
          {fields ?? (
            <>
              <div className="row">
                <NumField label={t('unc.uncFlaskSize')} value={flaskMl} onChange={setFlaskMl} min="0" />
                <label className="field">
                  <span className="field-label">{t('unc.uncGrade')}</span>
                  <select value={flaskGrade} onChange={(e) => setFlaskGrade(e.target.value)}>
                    <option value="A">{t('unc.uncGradeA')}</option>
                    <option value="B">{t('unc.uncGradeB')}</option>
                  </select>
                </label>
              </div>
              {setPipetteMl && (
                <NumField
                  label={pipetteSizeLabel ?? t('unc.uncPipetteSize')}
                  value={pipetteMl} onChange={setPipetteMl} min="0"
                />
              )}
              <NumField label={t('unc.uncTemp')} value={tempC} onChange={setTempC} />
              {balance && (
                <div className="row">
                  <NumField label={t('unc.uncReadability')} value={readabilityG} onChange={setReadabilityG} min="0" />
                  <NumField label={t('unc.uncLinearity')} value={linearityG} onChange={setLinearityG} min="0" />
                </div>
              )}
            </>
          )}

          {budget ? (
            <>
              <div className="unc-relative">
                <span>{t('unc.uncResult')}</span>
                {/*
                  Three decimals, not two.
                  Relative uncertainties live between about 0.01% and a few
                  percent, and at two decimals everything under 0.05% collapses
                  to "0.03%" — so swapping a 500 mL flask for a 1000 mL one, a
                  17% improvement in the budget, reads as no change at all.
                  That is the same defect as quoting digits the glassware
                  cannot support, in the other direction.
                */}
                <strong>{fmtSci(budget.relative * 100, 3)}%</strong>
              </div>
              <dl className="unc-contrib">
                {/* The tab supplies its own rows: which instruments appear, and
                    in what order, is what differs between a weighing and a
                    dilution. The shared part is the frame. */}
                {children}
                {/*
                  Rendered through `Contribution` rather than as a literal
                  `± 0.0577`, so every row in the list quotes its uncertainty to
                  the precision that uncertainty justifies. A fixed decimal
                  count here printed the flask's ± to four places while the row
                  above it — from the same budget — was rounded to two, and two
                  renderings of the same measurement disagreeing by two digits
                  is the thing this panel exists to stop.
                */}
                {/*
                  Guarded because the volumetric rows are not universal: a
                  spectrophotometry budget has no flask and no pipette, and an
                  unguarded `budget.flask.value` took the whole panel down with
                  it. A budget that does not carry the term simply does not show
                  the row.
                */}
                {budget.flask && (
                  <Contribution
                    label={t('unc.uncFlask')} value={budget.flask.value}
                    unc={budget.flask.unc} unit="mL"
                  />
                )}
                {budget.pipette && (
                  <Contribution
                    // Named by the tab when it is not a pipette: the reagent
                    // tab can deliver with a burette, and a row labelled
                    // "pipette" under a burette reading is a caption for a
                    // different instrument.
                    label={budget.pipetteLabel ?? t('unc.uncPipette')}
                    value={budget.pipette.value}
                    unc={budget.pipette.unc} unit="mL"
                  />
                )}
              </dl>
              {budget.balance?.belowMinimumWeight && (
                <Warn>
                  {t('weigh.uncBelowMin', {
                    mass: fmtSci(budget.mass.value, 3),
                    min: fmtSci(budget.balance.minimumWeightG, 3),
                  })}
                </Warn>
              )}
              {/*
                The "what is not in here" lines are instrument-specific: the
                default names operator technique and reagent purity, which is
                right for a weighing and wrong for a photometer. A tab supplies
                its own so the caveat keeps matching the budget above it.
              */}
              {caveats ?? (
                <>
                  <p className="unc-caveat">{t('unc.uncNotModelled')}</p>
                  <p className="unc-caveat">{t('unc.uncExact')}</p>
                </>
              )}
            </>
          ) : (
            // Not an error the user made — an instrument size the standard does
            // not cover, or a formula with an element outside the weight table.
            // The main result is unaffected, so this states what is missing
            // rather than presenting a zero as if it were a measurement.
            <p className="unc-caveat">{t('unc.uncUnavailable')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default UncertaintyPanel;
