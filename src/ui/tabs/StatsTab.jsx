import React, { useState, useMemo } from 'react';
import {
  describe as describeStats, dixon, grubbs, meanConfidenceInterval, rsd, tTest, fTest,
} from '../../calc/stats.mjs';
import { significantFigures, roundToSignificant } from '../../calc/uncertainty.mjs';
import { NumField, TextField, Result, Err, Warn } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

/*
 * Two or more columns of replicates.
 *
 * The shape is fixed at two for the comparison half of the tab — a t test and
 * an F test both take exactly two samples — but the first column alone is
 * enough for everything in the summary half. Starting with one column filled
 * and the second empty means the common case (describe my replicates) works
 * without the user having to work out that the second box is optional.
 */
const COLUMNS = [
  { key: 'a', labelKey: 'stats.sampleA', default: '10.02, 10.05, 9.98, 10.01, 10.03' },
  { key: 'b', labelKey: 'stats.sampleB', default: '' },
];

/**
 * Parse a free-text list of numbers.
 *
 * Commas, whitespace and newlines all separate, because a column pasted out of
 * a spreadsheet arrives tab-separated and one typed by hand arrives
 * comma-separated. Anything that is not a finite number is reported rather than
 * skipped: silently dropping an unreadable entry would compute a mean over
 * fewer points than the user believes they entered.
 */
function parseSeries(text) {
  const parts = String(text ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const values = [];
  const bad = [];
  for (const p of parts) {
    const v = Number(p);
    if (Number.isFinite(v)) values.push(v); else bad.push(p);
  }
  return { values, bad };
}

export default function StatsTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [seriesA, setSeriesA] = useState(restored?.seriesA ?? COLUMNS[0].default);
  const [seriesB, setSeriesB] = useState(restored?.seriesB ?? COLUMNS[1].default);
  const [confidence, setConfidence] = useState(
    restored?.confidence != null ? String(restored.confidence) : '95',
  );
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  const parsed = useMemo(() => {
    const a = parseSeries(seriesA);
    const b = parseSeries(seriesB);
    return { a, b, bad: [...a.bad, ...b.bad] };
  }, [seriesA, seriesB]);

  /*
   * The summary recomputes live rather than behind a button.
   *
   * Every other tab calculates on demand because its inputs are a recipe and
   * the answer is a quantity to weigh out. This one is a view of data the user
   * has already collected, so the mean and the spread are what they are looking
   * at while they type — a button between them and it is friction with no
   * purpose. The outlier test and the comparison do wait for a press, because
   * those are decisions rather than descriptions.
   */
  const summary = useMemo(() => {
    if (parsed.a.values.length < 2) return null;
    try {
      return {
        describe: describeStats(parsed.a.values),
        rsd: rsd(parsed.a.values),
      };
    } catch {
      return null;
    }
  }, [parsed.a.values]);

  function run() {
    try {
      const conf = n(confidence) / 100;
      const a = parsed.a.values;
      const b = parsed.b.values;
      /*
       * Each test is attempted independently, and one that cannot run is
       * recorded as its reason rather than aborting the rest.
       *
       * The two comparison tests fail for different inputs: the F test is
       * undefined when either sample is perfectly constant, while the t test
       * has a defined answer in exactly that case — two constant samples that
       * differ are definitely different. Running them in sequence and letting
       * the first throw meant a user with constant replicates saw only the F
       * test's refusal and never the t test's answer, which was the one they
       * were after.
       */
      const attempt = (fn) => {
        try { return { value: fn(), error: null }; } catch (e) { return { value: null, error: e }; }
      };
      const t = b.length >= 2 ? attempt(() => tTest(a, b)) : { value: null, error: null };
      const f = b.length >= 2 ? attempt(() => fTest(a, b)) : { value: null, error: null };
      const result = {
        confidence: conf,
        describeA: describeStats(a),
        rsdA: rsd(a),
        interval: meanConfidenceInterval(a, { confidence: conf }),
        grubbs: a.length >= 3 ? attempt(() => grubbs(a)).value : null,
        dixon: a.length >= 3 && a.length <= 10 ? attempt(() => dixon(a)).value : null,
        describeB: b.length >= 2 ? describeStats(b) : null,
        rsdB: b.length >= 2 ? rsd(b) : null,
        intervalB: b.length >= 2 ? meanConfidenceInterval(b, { confidence: conf }) : null,
        tTest: t.value,
        tTestError: t.error,
        fTest: f.value,
        fTestError: f.error,
      };
      setOut(result);
      setErr(null);
      onRecord({
        kind: 'stats',
        inputs: { seriesA, seriesB, confidence },
        outputs: {
          mean: result.describeA.mean,
          sd: result.describeA.sd,
          n: result.describeA.n,
        },
        summary: recordSummary({ kind: 'stats', inputs: { seriesA, seriesB, confidence }, outputs: result }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  /*
   * The mean quoted to the precision the data support.
   *
   * A mean of 10.018 over five readings that agree to two decimals is not known
   * to three; the standard error is the thing that decides how many figures are
   * real. When the uncertainty is zero — every replicate identical — there is no
   * limit from the data and the raw mean stands.
   */
  const quoted = useMemo(() => {
    if (!summary) return null;
    const { mean, sem } = summary.describe;
    if (!sem) return { mean, figures: null };
    const figures = significantFigures({ value: mean, unc: sem });
    return { mean: figures ? roundToSignificant(mean, figures) : mean, figures };
  }, [summary]);

  return (
    <Card>
      <TextField
        label={t('stats.sampleA')} value={seriesA} onChange={setSeriesA}
        hint={t('stats.seriesHint')}
        error={parsed.a.bad.length ? t('stats.badNumbers', { values: parsed.a.bad.join(', ') }) : null}
      />
      <TextField
        label={t('stats.sampleB')} value={seriesB} onChange={setSeriesB}
        hint={t('stats.seriesHint')}
        error={parsed.b.bad.length ? t('stats.badNumbers', { values: parsed.b.bad.join(', ') }) : null}
      />
      <NumField
        label={t('stats.confidence')} value={confidence} onChange={setConfidence}
        min="1" hint={t('stats.confidenceHint')}
      />

      {summary && (
        <div className="result" role="status" aria-live="polite">
          <div className="result-body">
            <div className="result-main">
              {fmt(quoted.mean, 6)}
              {quoted.figures && <span className="unit">{t('stats.figures', { n: quoted.figures })}</span>}
            </div>
            <div className="result-note">{t('stats.meanNote')}</div>
            <div className="result-grid">
              <div><span>{t('stats.n')}</span><strong>{summary.describe.n}</strong></div>
              <div><span>{t('stats.sd')}</span><strong>{fmt(summary.describe.sd, 5)}</strong></div>
              <div><span>{t('stats.sem')}</span><strong>{fmt(summary.describe.sem, 5)}</strong></div>
              <div>
                <span>{t('stats.rsd')}</span>
                <strong>{summary.rsd === null ? '—' : `${fmt(summary.rsd * 100, 3)}%`}</strong>
              </div>
              <div><span>{t('stats.median')}</span><strong>{fmt(summary.describe.median, 5)}</strong></div>
              <div><span>{t('stats.range')}</span><strong>{fmt(summary.describe.range, 5)}</strong></div>
            </div>
          </div>
        </div>
      )}

      <button className="primary" onClick={run} disabled={parsed.a.values.length < 2}>
        {t('stats.runTests')}
      </button>
      {err && <Err>{err}</Err>}

      {out && (
        /*
         * Only what the interval adds. The mean and the standard deviation are
         * already in the live summary above, and repeating them here put two
         * identical rows on the screen — the panel read as a duplicate of the
         * one above it rather than as the next step.
         */
        <Result
          value={`${fmt(out.interval.low, 5)} – ${fmt(out.interval.high, 5)}`}
          unit={t('stats.ciUnit', { pct: fmt(out.confidence * 100, 0) })}
          note={t('stats.ciNote', { t: fmt(out.interval.t, 4), n: out.interval.n })}
          rows={[
            [t('stats.halfWidth'), `± ${fmt(out.interval.halfWidth, 5)}`],
            [t('stats.tValue'), fmt(out.interval.t, 4)],
            [t('stats.dof'), String(out.interval.n - 1)],
          ]}
        />
      )}

      {out?.grubbs && (
        <div className={`msg ${out.grubbs.isOutlier ? 'warn' : ''}`}>
          <div>
            <strong>{t('stats.grubbs')}</strong>
            {' — '}
            {t('stats.grubbsResult', {
              G: fmt(out.grubbs.G, 4),
              crit: fmt(out.grubbs.critical, 4),
            })}
            {out.grubbs.isOutlier
              ? ` ${t('stats.grubbsFlagged', { value: fmt(out.grubbs.value, 6) })}`
              : ` ${t('stats.grubbsKept')}`}
          </div>
        </div>
      )}

      {out?.dixon && (
        <div className={`msg ${out.dixon.isOutlier ? 'warn' : ''}`}>
          <div>
            <strong>{t('stats.dixon')}</strong>
            {' — '}
            {t('stats.dixonResult', {
              Q: fmt(out.dixon.Q, 4),
              crit: fmt(out.dixon.critical, 4),
              end: out.dixon.end === 'high' ? t('stats.highEnd') : t('stats.lowEnd'),
            })}
            {out.dixon.isOutlier ? ` ${t('stats.dixonFlagged')}` : ` ${t('stats.dixonKept')}`}
          </div>
        </div>
      )}

      {/*
        * A test that could not run says why, in its own block. Swallowing the
        * reason left the panel silently missing a row the user expected.
        */}
      {out?.tTestError && (
        <div className="msg">
          <div>
            <strong>{t('stats.tTest')}</strong>
            {' — '}
            {t('stats.testUnavailable', { reason: errorMessage(out.tTestError, t) })}
          </div>
        </div>
      )}

      {out?.tTest && (
        <div className={`msg ${out.tTest.significant ? 'warn' : ''}`}>
          <div>
            <strong>{t('stats.tTest')}</strong>
            {' — '}
            {t('stats.tTestResult', {
              t: fmt(out.tTest.t, 4),
              df: fmt(out.tTest.df, 2),
              crit: fmt(out.tTest.critical, 4),
            })}
            {out.tTest.significant ? ` ${t('stats.tDiffers')}` : ` ${t('stats.tSame')}`}
          </div>
        </div>
      )}

      {out?.fTestError && (
        <div className="msg">
          <div>
            <strong>{t('stats.fTest')}</strong>
            {' — '}
            {t('stats.testUnavailable', { reason: errorMessage(out.fTestError, t) })}
          </div>
        </div>
      )}

      {out?.fTest && (
        <div className={`msg ${out.fTest.differs ? 'warn' : ''}`}>
          <div>
            <strong>{t('stats.fTest')}</strong>
            {' — '}
            {t('stats.fTestResult', {
              F: fmt(out.fTest.F, 4),
              df1: out.fTest.df1,
              df2: out.fTest.df2,
              p: fmt(out.fTest.p, 4),
            })}
            {out.fTest.differs ? ` ${t('stats.fDiffers')}` : ` ${t('stats.fSame')}`}
          </div>
        </div>
      )}

      {parsed.bad.length > 0 && (
        <Warn>{t('stats.badNumbers', { values: parsed.bad.join(', ') })}</Warn>
      )}
    </Card>
  );
}
