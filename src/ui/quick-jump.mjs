/**
 * The model behind the quick-jump palette.
 *
 * Twenty tabs is past the point where finding one by scanning a rail is fast,
 * and the history already holds every calculation this app has ever made. The
 * palette searches both at once: type a few characters, get tabs and matching
 * records, press Enter. The matching lives here rather than in the component
 * because the rules are easy to get subtly wrong and easy to test when they
 * are pure functions.
 *
 * ## How matching works
 *
 * Case-insensitive substring over everything a person might type: the tab's
 * name in the current language, its aliases in *both* languages (a Chinese
 * user types "buffer" as often as "缓冲"), the tab id, and for records the
 * summary plus metadata plus the raw input values — the same haystack the
 * history panel searches, so a query that finds something in the panel finds
 * it here.
 */
import { recordSummary } from './summaries.mjs';
import { noteTags } from './history.mjs';

/**
 * Extra names a tab answers to, beyond its title.
 *
 * The title is what the rail shows, not what a person types into a search box:
 * nobody types "实验台计算" when they want the dilution-factor helper, and
 * nobody types "Percent solution" when they want w/v. These are the words the
 * tab's own fields already use, so the palette and the forms speak the same
 * language. Both locales are listed for every tab so a query works regardless
 * of the interface language.
 */
export const TAB_ALIASES = {
  weigh: ['molarity', 'mol', '母液', 'stock', '称量', '配方', 'recipe'],
  dilute: ['稀释', 'dilution', 'v1 v2', '母液'],
  buffer: ['缓冲', 'henderson', 'pka', 'tris', 'hes'],
  series: ['梯度', 'serial', '倍比', 'tube'],
  ph: ['酸碱', 'ph', 'ka', '活度', 'activity'],
  percent: ['百分比', 'w/v', 'w/w', 'v/v', 'percent', '质量分数'],
  curve: ['滴定', 'titration', '等当点', 'equivalence'],
  reagent: ['浓试剂', 'concentrated', '密度', 'density', 'normality'],
  spectro: ['分光', 'absorbance', '吸光度', 'beer', 'lambert', '光谱'],
  lab: ['实验台', 'bench', '移液', 'pipette', '离心', 'rpm'],
  colligative: ['依数性', '沸点', '冰点', '渗透压', 'boiling', 'freezing', 'osmotic'],
  convert: ['单位', 'unit', '换算', '转换'],
  reaction: ['配平', 'balance', '化学方程式', 'yield', '产量', 'limiting'],
  electro: ['电化学', 'nernst', '电极', 'electrode', '电池'],
  elements: ['元素', '周期表', 'periodic', 'element', 'atomic'],
  bio: ['生物', 'dna', '蛋白', 'protein', 'od600', '拷贝'],
  uncertainty: ['不确定度', 'uncertainty', '误差', 'error', 'gum'],
  stats: ['统计', 'statistics', '均值', 'mean', 'sd', 'rsd'],
  analytical: ['分析', 'analytical', '校准', 'calibration', '回归', 'regression'],
  physical: ['物理化学', 'physical', '动力学', 'kinetics', 'arrhenius', '热力学'],
};

/**
 * Score a query against a list of candidate strings.
 *
 * Substring match only, no fuzzy gap matching. Fuzzy matching earns its cost
 * on a palette with thousands of entries; here it would turn "缓冲" into
 * "buffer, colligative, uncertainty" and make the top hit unpredictable.
 * Returns null when nothing matches.
 */
export function scoreCandidates(query, candidates) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return null;
  let best = null;
  for (const candidate of candidates) {
    const text = String(candidate ?? '').toLowerCase();
    if (!text) continue;
    const at = text.indexOf(q);
    if (at < 0) continue;
    // A prefix hit outranks a hit buried mid-word, and a shorter haystack
    // outranks a longer one at the same position — both push the thing the
    // query most likely names to the top without a popularity model.
    const score = (at === 0 ? 0 : 10) + text.length;
    if (best === null || score < best) best = score;
  }
  return best;
}

/**
 * The searchable strings for one tab.
 *
 * The id is included because the URL accepts `?tab=` and the shortcuts name
 * tabs by id — power users type ids, and they are the densest alias there is.
 */
function tabHaystack(id, title) {
  return [title, ...(TAB_ALIASES[id] ?? []), id];
}

/**
 * The searchable strings for one history entry.
 *
 * Mirrors `filterHistory`: the summary a person read when the record was
 * made, the metadata they typed, and the input values as JSON so a query for
 * a formula or a number finds the record it produced.
 */
export function entryHaystack(entry, summary) {
  const meta = Object.values(entry?.meta ?? {}).join(' ');
  const note = typeof entry?.note === 'string' ? entry.note : '';
  let inputs = '';
  try { inputs = JSON.stringify(entry?.inputs ?? {}); } catch { inputs = ''; }
  return [summary, meta, note, inputs];
}

/**
 * Search tabs and history together.
 *
 * @param {Array<{id: string}>} tabs   the live tab list, in nav order
 * @param {Array<object>} entries      live history entries, newest first
 * @param {string} query
 * @param {(key: string) => string} t  translator for tab titles and summaries
 * @returns {{ tabs: Array<{id: string, score: number}>,
 *             history: Array<{id: string, score: number, entry: object, summary: string}> }}
 *   Both lists are best-first and capped; `id` is the entry's own id, kept
 *   flat so the component can key rows without re-deriving it.
 */
export function searchQuickJump(tabs, entries, query, t) {
  const q = String(query ?? '').trim();
  const out = { tabs: [], history: [] };
  if (!t || typeof t !== 'function') return out;

  // An empty query is not a search for nothing: it is the palette just
  // opened, and the useful list then is every tab in the user's own nav
  // order. Ctrl+P, Enter is the fastest possible way to the first tab.
  if (!q) {
    out.tabs = (Array.isArray(tabs) ? tabs : [])
      .filter((tab) => tab && typeof tab.id === 'string')
      .map((tab) => ({ id: tab.id, score: 0 }));
    return out;
  }

  const tabResults = [];
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (!tab || typeof tab.id !== 'string') continue;
    const title = t(`tabs.${tab.id}`);
    const score = scoreCandidates(q, tabHaystack(tab.id, title));
    if (score !== null) tabResults.push({ id: tab.id, score });
  }
  tabResults.sort((a, b) => a.score - b.score);
  out.tabs = tabResults.slice(0, 7).map(({ id, score }) => ({ id, score }));

  const tagMode = q.startsWith('#');
  const historyResults = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.id !== 'string') continue;
    let summary = '';
    try { summary = recordSummary(entry, t); } catch { summary = String(entry.kind ?? ''); }
    // In tag mode the tags are the only haystack; every other mode searches
    // them alongside everything else, so `失败` without the # still finds a
    // tagged record through its note text.
    if (tagMode) {
      // Inline: the function is only used here, and keeping the predicate
      // beside the loop it gates reads better than an export for one caller.
      const want = q.replace(/^#/, '').trim();
      if (!want || !noteTags(entry.note ?? '').includes(want)) continue;
      historyResults.push({ id: entry.id, score: q.length, entry, summary });
      continue;
    }
    const score = scoreCandidates(q, entryHaystack(entry, summary));
    if (score !== null) historyResults.push({ id: entry.id, score, entry, summary });
  }
  historyResults.sort((a, b) => a.score - b.score);
  out.history = historyResults.slice(0, 6).map(({ id, score, entry, summary }) => ({
    id, score, entry, summary,
  }));
  return out;
}

/**
 * Move a selection by one row, wrapping at both ends.
 *
 * Wrapping for the same reason `cycleTab` wraps: the user pressing Down past
 * the last row is looking for the first one, not for a key that goes dead.
 */
export function moveSelection(index, delta, count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const at = Number.isFinite(index) ? index : 0;
  return (at + delta + count) % count;
}
