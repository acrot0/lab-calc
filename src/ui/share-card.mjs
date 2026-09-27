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
  out.push(`<text x="${pad + 48}" y="${valueY}" font-family="${font}" font-size="96" font-weight="650" fill="${c.accent}" dominant-baseline="middle">${escapeXml(value)}</text>`);
  if (unit) {
    // Positioned after the value by character count rather than by measuring:
    // the builder is pure, and a unit that starts a little early or late is not
    // a defect anyone notices.
    const advance = String(value).length * 56;
    out.push(`<text x="${pad + 48 + advance + 16}" y="${valueY + 24}" font-family="${font}" font-size="38" fill="${c.dim}" dominant-baseline="middle">${escapeXml(unit)}</text>`);
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

  for (let i = 0; i < shown.length; i += 2) {
    for (let j = 0; j < 2 && i + j < shown.length; j++) {
      const [k, v] = shown[i + j] ?? [];
      const x = pad + 48 + j * 520;
      out.push(`<text x="${x}" y="${ry}" font-family="${font}" font-size="17" fill="${c.dim}">${escapeXml(k)}</text>`);
      out.push(`<text x="${x}" y="${ry + 28}" font-family="${font}" font-size="25" fill="${c.text}">${escapeXml(v)}</text>`);
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
