/*
 * The share card: one calculation, as an image.
 *
 * ## What this is for
 *
 * A student who has just worked out that they need 14.61 g of NaCl wants to put
 * that in the group chat, or in their lab notebook, or in a slide. Every other
 * export in this app produces a *file* — a spreadsheet, a bundle, a printed
 * report — and all of them are the wrong shape for that: the reader has to open
 * something, and half the time they cannot.
 *
 * A card is a picture. It pastes anywhere, it needs no app to read, and it
 * carries its own attribution, which is the reason it is worth building rather
 * than telling people to screenshot.
 *
 * ## Why it is built as SVG text rather than by rasterising the DOM
 *
 * The diagram export reads the live DOM through `getComputedStyle` and bakes
 * the resolved values into a copy. That is right for a diagram — an arbitrary
 * figure the app did not draw — and wrong here: a card has a fixed layout of
 * about eight elements, all of them text the app already has as strings.
 *
 * Building it from strings means the whole card is a pure function. It can be
 * tested by asserting on the markup, it cannot be affected by which theme
 * happened to be mounted, and the PNG path (below) is the only part that needs
 * a browser at all.
 *
 * ## The PNG step
 *
 * A card is shared as PNG, not SVG, because most places people paste — chat
 * apps, slide decks, phones — do not render SVG. The conversion is
 * `Image` → `<canvas>` → `toBlob`, which is the only browser-dependent part;
 * it lives in `renderShareCard` and is kept separate from the markup builder so
 * the layout stays testable.
 */

/** Card geometry. 1200×675 is 16:9, which is what a slide wants. */
export const CARD = { width: 1200, height: 675, pad: 64 };

/** Escape the five characters that would break out of an XML text node. */
export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Break a string into lines that fit a width, by character count.
 *
 * A real text measurement needs a canvas and the font loaded, and the card is
 * built before either is guaranteed. Counting characters is approximate — a
 * line of `mmm` is wider than a line of `iii` — but the failure mode is a
 * slightly ragged right edge, where measuring would have made the builder
 * impure. CJK counts double, because a Chinese glyph is about twice the width
 * of a Latin one at the same size and a card of Chinese text would otherwise
 * overflow badly.
 */
export function wrapText(text, maxChars) {
  const s = String(text ?? '').trim();
  if (s === '') return [];
  const lines = [];
  let line = '';
  let width = 0;

  for (const ch of s) {
    // A newline in the source is a break the caller asked for.
    if (ch === '\n') {
      lines.push(line);
      line = '';
      width = 0;
      continue;
    }
    const w = ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
    if (width + w > maxChars && line !== '') {
      lines.push(line);
      line = ch;
      width = w;
    } else {
      line += ch;
      width += w;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/*
 * The width model, and what it is actually modelling.
 *
 * `wrapText` counts characters — a CJK glyph as two, everything else as one —
 * because it was written to keep a *heading* from running off the card, where
 * wrapping one character early costs nothing and a ragged right edge is the
 * only failure. Reused for truncation it is not good enough: a column budget is
 * a width, and "one column" has to mean a real number of units, or the
 * arithmetic that derives the budgets is decoration.
 *
 * Measured with `getComputedTextLength` at the row font, per class, as a
 * fraction of the font size:
 *
 *   digits    0.588 em      uppercase  0.668 em avg, 1.02 em for `W`
 *   lowercase 0.541 em      punctuation 0.444 em avg, 0.90 em for `%`
 *   CJK       1.000 em      × ³ M      0.60 em
 *
 * Scaling is linear — 17px and 25px gave identical fractions — so one table
 * serves every size. The 650 weight is 5.5% wider than regular, measured across
 * all classes.
 *
 * A column is `0.60 em` at the row font — one `EM_COL`, which is a hair above
 * the measured digit advance (0.588) and so carries a small margin on the case
 * a card actually contains. That is the choice that matters: a card's values
 * are numbers and units, and the alphabet average (`abcdefg…`, 0.541 em from
 * `lower`'s own spread) under-reserved a run of digits by ~9%. Uppercase stays
 * modelled optimistically: a card whose rows are long runs of capitals does not
 * exist, and reserving `W`'s 1.02 em for every column would truncate every real
 * card to buy protection against a case that does not occur.
 */
const EM_COL = 0.60;
const EM_BOLD = 1.055;
const EM_WIDE = 1.0;

/**
 * How many columns a character occupies: one for Latin and its usual
 * punctuation, `1/0.6` for CJK — a glyph that renders at a full em.
 *
 * Exported because the tests reason in columns and the builder reasons in units,
 * and both have to agree about a Chinese glyph. `wrapText`'s flat 2 is a
 * different, coarser convention that stays where it is: a heading one character
 * short is not a defect.
 */
export function columnsOf(ch) {
  return ch.charCodeAt(0) > 0x2e7f ? EM_WIDE / EM_COL : 1;
}

/** How wide a string renders, in the columns `truncateTo` budgets. */
export function textColumns(text) {
  let w = 0;
  for (const ch of String(text ?? '')) w += columnsOf(ch);
  return w;
}

/**
 * Trim a string to fit `maxCols` columns, marking that it was cut.
 *
 * An ellipsis rather than a silent chop: a value that has been shortened must
 * say so, because the alternative is a card showing `58.4400` when the answer
 * was `58.4400123` — a number that is wrong in the way this whole project
 * exists to avoid.
 *
 * The budget bounds the text, and the ellipsis is *added* on top of it rather
 * than taken out of it: a reader who sees the marker must be able to trust that
 * everything before it is a prefix of the real value, and a marker that pushed
 * the last character out would quietly make that false. That is why every
 * caller below gives up a column of slack first.
 */
export function truncateTo(text, maxCols) {
  const s = String(text ?? '');
  if (!(maxCols > 0)) return '';
  let width = 0;
  let out = '';
  for (const ch of s) {
    const w = columnsOf(ch);
    if (width + w > maxCols) return `${out}…`;
    out += ch;
    width += w;
  }
  return s;
}

const ROW_FONT = 25;
const UNIT_FONT = 38;
const VALUE_FONT = 96;
const ROW_ADVANCE = ROW_FONT * EM_COL;
const UNIT_ADVANCE = UNIT_FONT * EM_COL;
/* Measured bold digits: 0.617 em, i.e. 0.588 × 1.055. */
const VALUE_ADVANCE = VALUE_FONT * EM_COL * EM_BOLD;
/** The gap between the headline and its unit. */
const UNIT_GAP = 16;
const COL_GAP = 520;
const RIGHT_EDGE = CARD.width - CARD.pad;
const COL_LEFT = CARD.pad + 48;

/** Columns that fit between two x positions. */
const colsBetween = (from, to) => Math.floor((to - from) / ROW_ADVANCE);

/*
 * The two row cells share one budget: the narrower of the two columns, less the
 * ellipsis's own column.
 *
 *   column 1:  632 − 112 = 520 units → 37 columns
 *   column 2:  1136 − 632 = 504 units → 36 columns
 */
const ROW_COLS = Math.min(colsBetween(COL_LEFT, COL_LEFT + COL_GAP), colsBetween(COL_LEFT + COL_GAP, RIGHT_EDGE)) - 1;

/*
 * The headline's budget is not the headline alone.
 *
 * The unit is drawn *after* the value, so the two share one line and the value
 * must leave room for it. Budgeting the value the full panel width — which is
 * what the first version did — put the number and its unit on top of each
 * other: a 17-character value reached 112 + 17·56 = 1064, the unit started 16
 * units later, and `mol/L` at 38px is another 104, so the line ended at 1184
 * against a panel edge of 1136.
 *
 * Reserving that unconditionally would cost the headline three characters on
 * every card that has no unit, which is most of them, so it is a function of
 * whether there is one. Both budgets then give up two columns: one for the
 * ellipsis, and one because the headline can be a digit run at a bold weight —
 * the case the model is most optimistic about.
 */
const UNIT_COLS = 8;
const valueCols = (hasUnit) => {
  const reserved = hasUnit ? UNIT_GAP + UNIT_COLS * UNIT_ADVANCE : 0;
  return Math.max(4, Math.floor((RIGHT_EDGE - COL_LEFT - reserved) / VALUE_ADVANCE) - 2);
};
const VALUE_COLS = valueCols(false);

/**
 * The measured geometry, exported.
 *
 * Tests that check "does this fit" need the same numbers the builder uses. The
 * alternative — repeating `520` and `13.75` in the test file — is a second
 * source of truth for the layout, and the earlier version of this code drifted
 * exactly that way: the comment said one column budget, the constant said
 * another, and one test asserted a third.
 */
export const COLUMNS = Object.freeze({
  row: ROW_COLS,
  value: VALUE_COLS,
  /** The headline budget when a unit shares the line — always the smaller. */
  valueWithUnit: valueCols(true),
  unit: UNIT_COLS,
  /** The x each of the two row cells starts at. */
  x: Object.freeze([COL_LEFT, COL_LEFT + COL_GAP]),
  left: COL_LEFT,
  right: RIGHT_EDGE,
  advance: ROW_ADVANCE,
  valueAdvance: VALUE_ADVANCE,
  unitAdvance: UNIT_ADVANCE,
  unitGap: UNIT_GAP,
  valueFontPx: VALUE_FONT,
  unitFontPx: UNIT_FONT,
  rowFontPx: ROW_FONT,
});

/** How wide a string renders, in user units. */
export function textWidth(text, advance = ROW_ADVANCE) {
  return textColumns(text) * advance;
}

/**
 * The card as a standalone SVG document.
 *
 * `card` is plain data — every string already formatted by the caller — so this
 * function has no dependencies on the app's state, its locale, or the DOM. The
 * caller decides what the card says; this decides where it goes.
 *
 * The signature line is not optional. A card that leaves the app without saying
 * where it came from is a number in a chat with no provenance, and the whole
 * premise of this tool is that a calculation should be traceable.
 */
export function shareCardSvg(card) {
  const {
    title = '', summary = '', value = '', unit = '', rows = [], note = '',
    software = 'Lab Calc', version = '', theme = 'dark',
  } = card ?? {};

  const dark = theme !== 'light';
  const c = dark
    ? { bg: '#12161f', panel: '#1a2029', line: '#2a323f', text: '#e6ebf2', dim: '#93a1b5', accent: '#4aa8c8' }
    : { bg: '#fbfaf7', panel: '#ffffff', line: '#dcd8ce', text: '#1d2229', dim: '#5d6672', accent: '#2b7a95' };

  const { width, height, pad } = CARD;
  const font = "ui-sans-serif, system-ui, 'Segoe UI', 'Microsoft YaHei', sans-serif";

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`);
  out.push(`<rect width="${width}" height="${height}" fill="${c.bg}"/>`);
  out.push(`<rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="20" fill="${c.panel}" stroke="${c.line}"/>`);

  let y = pad + 74;

  // The heading: what was calculated.
  for (const line of wrapText(title, 40)) {
    out.push(`<text x="${pad + 48}" y="${y}" font-family="${font}" font-size="26" fill="${c.dim}">${escapeXml(line)}</text>`);
    y += 36;
  }

  // The summary, when the tab produced one.
  if (summary) {
    y += 8;
    for (const line of wrapText(summary, 46)) {
      out.push(`<text x="${pad + 48}" y="${y}" font-family="${font}" font-size="21" fill="${c.text}">${escapeXml(line)}</text>`);
      y += 30;
    }
  }

  /*
   * The headline number, centred in the space between the heading and the rows.
   *
   * This is the thing the card exists to show, so it gets the size — at 96px it
   * is readable as a thumbnail in a chat list, which is where these actually
   * get seen.
   */
  const valueY = Math.round(height * 0.52);
  /*
   * The value is truncated, not wrapped.
   *
   * A headline that wrapped to two lines would push the rows off the bottom,
   * and a value long enough to need this is one that will not fit at any size —
   * the card is for a number read at a glance, where an ellipsis says plainly
   * that there was more, and an overflowed glyph says nothing at all.
   */
  const shownValue = truncateTo(value, valueCols(Boolean(unit)));
  out.push(`<text x="${COL_LEFT}" y="${valueY}" font-family="${font}" font-size="${COLUMNS.valueFontPx}" font-weight="650" fill="${c.accent}" dominant-baseline="middle">${escapeXml(shownValue)}</text>`);
  if (unit) {
    /*
     * The unit follows the value on the same line, so it is placed by
     * `textWidth` at the headline's own advance — the same function the column
     * budgets use, so the three cannot disagree.
     *
     * This was `shownValue.length * 56`, which counts a CJK character as one
     * where the renderer draws it as two: a Chinese unit would have drawn 56
     * units inside the number it labels, and a Chinese value would have drawn
     * it under the last glyph.
     */
    const advance = textWidth(shownValue, VALUE_ADVANCE);
    out.push(`<text x="${COL_LEFT + advance + UNIT_GAP}" y="${valueY + 24}" font-family="${font}" font-size="${UNIT_FONT}" fill="${c.dim}" dominant-baseline="middle">${escapeXml(truncateTo(unit, UNIT_COLS))}</text>`);
  }

  /*
   * The footer line, and the rows above it.
   *
   * The rows are laid out *upward* from a fixed footer rather than downward
   * from a fixed start. The first version anchored them near the bottom and
   * stepped down 68px per pair, which put the third row's value on top of the
   * note line and hid the note completely — visible in a render, invisible in
   * the markup, which is why the test below asserts the geometry rather than
   * the presence of the strings.
   *
   * `ROW_H` is the pair's height; `FOOTER_H` is the space the note and the
   * attribution share.
   */
  const ROW_H = 68;
  const FOOTER_H = 76;
  const footerY = height - pad - 40;
  const shown = rows.slice(0, 4);
  const rowLines = Math.ceil(shown.length / 2);
  let ry = footerY - FOOTER_H - (rowLines - 1) * ROW_H;

  /*
   * Both cells are truncated to their column, with the measured geometry rather
   * than a repeated literal — before this, a real value like `2.055×10³ mol/L`
   * or a long formula ran past the panel edge, and a 60-character one reached
   * 1688 against a limit of 1136.
   */
  for (let i = 0; i < shown.length; i += 2) {
    for (let j = 0; j < 2 && i + j < shown.length; j++) {
      const [k, v] = shown[i + j] ?? [];
      const x = COLUMNS.x[j];
      out.push(`<text x="${x}" y="${ry}" font-family="${font}" font-size="17" fill="${c.dim}">${escapeXml(truncateTo(k, ROW_COLS))}</text>`);
      out.push(`<text x="${x}" y="${ry + 28}" font-family="${font}" font-size="${ROW_FONT}" fill="${c.text}">${escapeXml(truncateTo(v, ROW_COLS))}</text>`);
    }
    ry += ROW_H;
  }

  /*
   * The caveat, when there is one — a card that carries a number and not its
   * uncertainty is the failure this app exists to avoid. Truncated to the
   * footer's height rather than wrapped into the rows above it.
   */
  if (note) {
    out.push(`<text x="${pad + 48}" y="${footerY}" font-family="${font}" font-size="15" fill="${c.dim}">${escapeXml(wrapText(note, 72)[0] ?? '')}</text>`);
  }

  // Attribution. Always present, never optional.
  out.push(`<text x="${width - pad - 48}" y="${footerY}" text-anchor="end" font-family="${font}" font-size="16" fill="${c.dim}">${escapeXml(`${software}${version ? ` ${version}` : ''}`)}</text>`);
  out.push('</svg>');
  return out.join('\n');
}

/**
 * The y of the lowest row value, or null when there are no rows.
 *
 * Exported so a test can assert the rows clear the footer. Reading the geometry
 * out of the markup with a regex would work and would also break the moment the
 * attribute order changed; this is the number the layout actually used.
 */
export function lowestRowY(rowCount) {
  const lines = Math.ceil(Math.min(rowCount, 4) / 2);
  if (lines === 0) return null;
  const { height, pad } = CARD;
  const footerY = height - pad - 40;
  return footerY - 76 - (lines - 1) * 68 + 28;
}

/** The y of the footer line, for the same reason. */
export function footerY() {
  return CARD.height - CARD.pad - 40;
}

/** The filename for a shared card. */
export function shareCardFilename(card, now = new Date()) {
  const day = Number.isNaN(now.getTime()) ? '' : now.toISOString().slice(0, 10);
  const slug = String(card?.title ?? 'result')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'result';
  return `lab-calc-${slug}${day ? `-${day}` : ''}.png`;
}

/**
 * Turn the card's SVG into a PNG blob.
 *
 * The only part that needs a browser. An SVG data URL loads into an `Image`
 * without a network request, and drawing it to a canvas gives the pixels;
 * `toBlob` then produces a file the clipboard and every chat app accept.
 *
 * The canvas is filled with the card's own background before the image is
 * drawn, because a PNG with transparency pasted onto a dark chat theme shows
 * light text on nothing. The size comes from the SVG's own attributes rather
 * than from `CARD`, so the two cannot drift.
 */
export async function renderShareCard(svgMarkup, {
  width = CARD.width, height = CARD.height, background = '#12161f',
} = {}) {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('shareCardImageFailed'));
    el.src = url;
  });

  const canvas = document.createElement('canvas');
  // 2× so the card stays sharp on a retina screen or when a slide is projected.
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('shareCardBlobFailed'));
    }, 'image/png');
  });
}
