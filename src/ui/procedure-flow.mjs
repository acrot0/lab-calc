/*
 * The bench procedure as a flow, in coordinates.
 *
 * ## Why this is separate from the component that draws it
 *
 * `procedure.mjs` produces the steps; a React component draws them. Everything
 * in between — where each box sits, which one connects to which — is arithmetic
 * with a claim behind it: the drawing says step 2 follows step 1, and if the
 * geometry disagrees with the list the figure is stating a procedure nobody
 * wrote.
 *
 * That claim is testable without a browser, so it is tested without one. The
 * component is then a loop over these boxes and connectors, which is the part
 * that cannot be wrong in an interesting way.
 *
 * ## Why the boxes are uniform
 *
 * Every box is the same size regardless of how much text it holds. A box sized
 * to its content makes a three-word step look like a different kind of thing
 * from a ten-word one, and the reader has to work out whether the size means
 * something. It does not. Uniform boxes also make two figures from two records
 * look like one set, which is what makes them readable side by side.
 */

/** The drawing area, matching the other diagrams in the app. */
export const FLOW = { w: 480, h: 270 };

/*
 * Box geometry.
 *
 * Full width, less a 24px margin either side. A 300px box left 180px of empty
 * figure beside every step and truncated the longest recipe — "逐管转移 100 mL
 * 至下一管，混匀" — at 34 characters, so the one step a reader most needs to
 * read in full was the one that got cut. The margin is kept because a box
 * touching the frame reads as clipped rather than as placed.
 */
const BOX = { w: 432, h: 34 };
const GAP = 12;

/** Space kept clear at the bottom for the figure's own label. */
const FOOTER = 22;

/** Where the text starts inside a box: past the stripe and the step number. */
export const TEXT_LEFT = 28;

/** Padding kept clear at the trailing edge, so text does not touch the border. */
const TEXT_PAD = 10;

/**
 * How many characters of step text fit on one line, counting CJK as two.
 *
 * Derived from the box rather than written down, because the two are the same
 * fact: a budget that does not follow the box silently truncates the longest
 * step the moment the box is narrowed. The 5.5px is the average advance of a
 * proportional sans face at the 11px the steps render at.
 */
export const TEXT_BUDGET = Math.floor((BOX.w - TEXT_LEFT - TEXT_PAD) / 5.5);

/**
 * The kinds of step a recipe contains, which decide the box's accent.
 *
 * Not decoration: a procedure that weighs, transfers and makes up to volume
 * has three different actions in it, and a reader scanning a figure wants to
 * find the weighing step without reading every line. The roles are distinct so
 * no two kinds draw the same.
 */
export const STEP_KINDS = Object.freeze({
  weigh: 'amount',
  measure: 'amount',
  transfer: 'vessel',
  dissolve: 'vessel',
  adjust: 'condition',
  dilute: 'vessel',
  mix: 'condition',
  label: 'condition',
});

/**
 * Lay out a procedure as boxes and connectors.
 *
 * Returns `{ boxes, connectors }` in viewBox coordinates. The boxes are
 * numbered from zero in the order given, stacked downward, and horizontally
 * centred; the connectors join each box to the next and nothing else.
 *
 * The column is centred rather than left-aligned because a procedure reads as
 * a single chain, and a chain hugging one edge of the figure with empty space
 * beside it reads as something that was meant to branch.
 */
export function flowLayout(steps, { width = FLOW.w, height = FLOW.h } = {}) {
  const list = Array.isArray(steps) ? steps : [];
  /*
   * A procedure longer than the figure can hold is dropped rather than drawn
   * past the edge. Every recipe in the app is three steps and the figure holds
   * five, so this does not fire today — it exists because an imported record
   * can carry any step count, and a chain whose last box is outside the viewBox
   * is a procedure that silently stops early.
   */
  const room = height - FOOTER;
  if (flowHeight(list.length) > room) return { boxes: [], connectors: [] };
  const x = (width - BOX.w) / 2;
  /*
   * The column is centred in the space above the figure's label.
   *
   * A three-step chain is 144 units tall in a 270-unit frame. Anchored at the
   * top it left 108 units of empty figure under the last box, which reads as a
   * fourth step that failed to draw. Centred, the same space becomes margin
   * above and below, which reads as a figure.
   */
  const top = Math.max(0, (room - flowHeight(list.length)) / 2);
  const boxes = list.map((text, index) => ({
    index,
    text: String(text ?? ''),
    x,
    y: top + index * (BOX.h + GAP),
    w: BOX.w,
    h: BOX.h,
  }));
  const connectors = boxes.slice(0, -1).map((box, i) => ({
    from: i,
    to: i + 1,
    x: box.x + box.w / 2,
    y1: box.y + box.h,
    y2: boxes[i + 1].y,
  }));
  return { boxes, connectors };
}

/**
 * How wide a string renders, counting CJK as two.
 *
 * The unit is "characters at the Latin advance", which is what `TEXT_BUDGET` is
 * counted in. It is an estimate: the real width depends on the glyphs and the
 * face. It only has to be good enough that the longest step the app writes
 * lands inside the box, and a test holds it to that.
 */
export function textWidth(text) {
  let width = 0;
  for (const ch of String(text ?? '')) width += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return width;
}

/**
 * Cut a step to a character budget.
 *
 * `textLength` would squeeze a long line rather than cut it, which makes the
 * type smaller instead of dropping words — and a recipe step that reads as
 * smaller type is worse than one that visibly stops, because the reader cannot
 * tell anything is missing.
 *
 * This rarely fires: the longest step the app writes fits. It exists because a
 * record imported from another build can carry any text at all, and an
 * unbounded string would run out of the box and over the figure edge.
 */
export function truncate(text, budget = TEXT_BUDGET) {
  const s = String(text ?? '');
  if (textWidth(s) <= budget) return s;
  let width = 0;
  let out = '';
  for (const ch of s) {
    width += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
    if (width > budget - 1) return `${out}…`;
    out += ch;
  }
  return out;
}

/** How tall a procedure of `n` steps will be, connectors included. */
function flowHeight(n) {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (count === 0) return 0;
  return count * BOX.h + (count - 1) * GAP;
}
