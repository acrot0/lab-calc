import React from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { recordSummary } from '../summaries.mjs';
import { fieldLabel } from '../field-labels.mjs';

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

  return (
    <div className="report" aria-hidden="true">
      <header className="report-head">
        <h1>{title ?? t('report.title')}</h1>
        <div className="report-meta">
          <span>{t('report.generated', { date: now.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB') })}</span>
          <span>{t('report.count', { count: entries.length })}</span>
        </div>
      </header>

      {entries.length === 0 && <p>{t('report.empty')}</p>}

      {entries.map((e, i) => (
        <article className="report-item" key={e.id ?? i}>
          <h2>
            <span className="report-num">{i + 1}</span>
            {recordSummary(e, t) || t('history.untitled')}
          </h2>
          <div className="report-when">
            {e.at ? new Date(e.at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB') : ''}
          </div>

          {/* Inputs and results as two definition lists rather than one table:
              the two have different key sets, and a table would pad whichever
              is shorter with empty cells that read as missing data. */}
          {e.inputs && Object.keys(e.inputs).length > 0 && (
            <section className="report-block">
              <h3>{t('report.inputs')}</h3>
              <dl>
                {Object.entries(e.inputs).map(([k, v]) => (
                  <div key={k}>
                    {/* The stored key is a code identifier (`massG`); the
                        label is what a reader of the printed page needs. */}
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
        </article>
      ))}

      <footer className="report-foot">
        {t('report.footer')}
      </footer>
    </div>
  );
}

/** A scalar as text; an object is not printable as one cell. */
function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
