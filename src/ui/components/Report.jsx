import React from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { recordSummary } from '../summaries.mjs';
import { fieldLabel } from '../field-labels.mjs';
import { formulaOf } from '../../calc/data/formulas.mjs';

/**
 * The printable lab report.
 *
 * ## Why this and not a PDF library
 *
 * The alternative was jsPDF (about 350 KB) or pdfmake, either of which also
 * needs an embedded CJK font — several hundred KB more, because a PDF has to
 * carry the glyphs it draws and a default Latin font renders Chinese as
 * boxes. That is roughly a megabyte to produce a document the browser already
 * knows how to make.
 *
 * Instead this renders a real DOM tree and the print stylesheet in
 * `styles.css` lays it out. `window.print()` then offers "Save as PDF", and
 * what comes out is a *vector* PDF with selectable, searchable, copyable text
 * — which a canvas-based library cannot produce at all. Zero dependencies,
 * zero bundle growth, and a better artifact.
 *
 * ## What makes it a lab record rather than a printout
 *
 * A page of numbers is not a record. A record says what was done, when, by
 * whose method, and what the numbers mean — so a reader six months later can
 * tell whether the result is still valid. Three things carry that here:
 *
 *   - **A cover page** with the document identity: title, generation time,
 *     entry count, and the standing disclaimer. A stack of loose pages that
 *     cannot be identified is not a record.
 *   - **The equation and its assumptions, per entry.** The formula registry
 *     already declares these for every calculation, so the printed page states
 *     the relationship that was used and the conditions it holds under. This
 *     is the part a hand-written printout always lacks, and it is the part
 *     that makes the number checkable rather than merely present.
 *   - **A numbered, dated entry** so any item can be referred to by number,
 *     which is what a lab notebook's numbering is for.
 *
 * ## Why it is in the DOM rather than generated on demand
 *
 * Because it is real HTML, it inherits the theme's typography and the locale,
 * and it can be checked by the same render tests as everything else. It is
 * hidden on screen with `display: none` and shown only in print, so it costs
 * one hidden subtree rather than a second document.
 *
 * The one thing that must not happen: this subtree being visible on screen.
 * A print-only report that leaks into the app looks like a rendering bug, so
 * the visibility rule is in the stylesheet with the rest of the print rules
 * rather than inline here.
 */
export default function Report({ entries, title }) {
  const { t, locale } = useI18n();
  const now = new Date();

  // The entry's own formula, looked up by the tab it came from. A record whose
  // kind has no registry entry — an old record, or one from a removed tab —
  // prints without the equation rather than failing.
  const formulaFor = (entry) => formulaOf(entry?.kind) ?? formulaOf(kindAlias(entry?.kind));

  return (
    <div className="report" aria-hidden="true">
      {/* ---------------------------------------------------------------
          Cover
          --------------------------------------------------------------- */}
      <section className="report-cover">
        <div className="report-cover-mark">{t('report.docType')}</div>
        <h1 className="report-cover-title">{title ?? t('report.title')}</h1>
        <dl className="report-cover-meta">
          <div>
            <dt>{t('report.generatedLabel')}</dt>
            <dd>{stamp(now, locale)}</dd>
          </div>
          <div>
            <dt>{t('report.countLabel')}</dt>
            <dd>{entries.length}</dd>
          </div>
          <div>
            <dt>{t('report.software')}</dt>
            <dd>{t('app.footerVersion')}</dd>
          </div>
        </dl>
        <p className="report-cover-note">{t('report.footer')}</p>
      </section>

      {/* ---------------------------------------------------------------
          Entries
          --------------------------------------------------------------- */}
      {entries.length === 0 && <p className="report-empty">{t('report.empty')}</p>}

      {entries.map((e, i) => {
        const formula = formulaFor(e);
        return (
          <article className="report-item" key={e.id ?? i}>
            <header className="report-item-head">
              <span className="report-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2>{recordSummary(e, t) || t('history.untitled')}</h2>
                <div className="report-when">
                  {e.at ? stamp(new Date(e.at), locale) : ''}
                  {e.kind && <span className="report-kind">{t(`tabs.${e.kind}`, {})}</span>}
                </div>
              </div>
            </header>

            {/* The relationship and its conditions. This is what turns the
                numbers below from a printout into something checkable. */}
            {formula && (
              <section className="report-block report-method">
                <h3>{t('report.method')}</h3>
                <p className="report-equation">{formula.equation}</p>
                {formula.assumptions?.length > 0 && (
                  <>
                    <h4>{t('report.assumptions')}</h4>
                    <ul>
                      {formula.assumptions.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </>
                )}
                {formula.source && (
                  <p className="report-source">
                    <span>{t('report.source')}</span> {formula.source}
                  </p>
                )}
              </section>
            )}

            {/* Inputs and results as two definition lists rather than one
                table: the two have different key sets, and a table would pad
                whichever is shorter with empty cells that read as missing
                data. */}
            {e.inputs && Object.keys(e.inputs).length > 0 && (
              <section className="report-block">
                <h3>{t('report.inputs')}</h3>
                <dl>
                  {Object.entries(e.inputs).map(([k, v]) => (
                    <div key={k}>
                      {/* The stored key is a code identifier (`massG`); the
                          label is what a reader of the printed page needs, and
                          it already carries the unit. */}
                      <dt>{fieldLabel(k, locale)}</dt>
                      <dd>{formatValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {e.outputs && Object.keys(e.outputs).length > 0 && (
              <section className="report-block">
                <h3>{t('report.outputs')}</h3>
                <dl>
                  {Object.entries(e.outputs).map(([k, v]) => (
                    <div key={k}>
                      <dt>{fieldLabel(k, locale)}</dt>
                      <dd>{formatValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* A signature line per entry. A lab record that nobody signs is a
                draft, and the blank is what makes the intent legible. */}
            <div className="report-sign">
              <span>{t('report.checkedBy')}</span>
              <span className="report-sign-line" />
              <span>{t('report.dateLine')}</span>
              <span className="report-sign-line is-short" />
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Older records store the tab id, which is not always the formula id.
 *
 * `massForMolarity` and `stockFromSolid` are both the "weigh" screen; the
 * registry keys on the screen. Kept as a table rather than a chain of `if`s so
 * the mapping is visible in one place when a tab is renamed.
 */
const KIND_ALIASES = {
  massForMolarity: 'weigh',
  stockFromSolid: 'weigh',
  dilution: 'dilute',
  dilutionSeries: 'series',
  bufferRecipe: 'buffer',
  phCalc: 'ph',
  percentSolution: 'percent',
  titrationCurve: 'titrationCurve',
};

function kindAlias(kind) {
  return KIND_ALIASES[kind] ?? kind;
}

/** A date and time a reader can act on, in their own zone. */
function stamp(date, locale) {
  return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** A scalar as text; an object is not printable as one cell. */
function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
