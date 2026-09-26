/**
 * Turn a rendered diagram into a standalone SVG file.
 *
 * ## Why copying the markup does not work
 *
 * The diagrams are drawn with CSS classes — `.diagram-line` carries the accent
 * stroke, `.diagram-axis text` the dim fill — and every one of those rules
 * resolves through a custom property that changes with the theme. The markup on
 * its own is therefore a set of unstyled black shapes: pasting it into a lab
 * notebook, a slide, or an Illustrator document gives hairlines where the
 * figure had a curve, and black where it had the dim annotation grey.
 *
 * So the export walks the live tree, asks the browser what each element
 * actually computes to, and writes those values onto the elements as
 * presentation attributes. What comes out is the diagram as it appears, with no
 * stylesheet, no font files and no JavaScript — one file that opens anywhere.
 *
 * ## Why the values are read from the DOM rather than from the theme
 *
 * The theme is not the only thing that decides a colour: the density setting
 * changes spacing, `prefers-color-scheme` can override the chosen theme, and a
 * future rule could compute a stroke from the data. Reading the computed style
 * asks the only authority that has all of that already resolved, and it cannot
 * drift from what the user is looking at — because it *is* what they are
 * looking at.
 *
 * The one thing it cannot see is the background: an SVG element's computed
 * `background` is transparent, and the surface colour lives on the container.
 * That is passed in explicitly.
 */

/**
 * Properties copied from the computed style onto the exported element.
 *
 * Deliberately a list rather than "everything": a computed style has ~340
 * properties, and copying them all would bury the geometry in noise and
 * hard-code values that mean nothing outside a browser (`-webkit-text-stroke`,
 * animation state, the whole `transition-*` family). These are the ones the
 * diagram stylesheet actually sets.
 */
const COPIED = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline',
];

/**
 * Attributes that belong on the element rather than in its style.
 *
 * Presentation attributes lose to any stylesheet, so an exported file that
 * keeps a `class` would be re-styled by whatever CSS the host document has.
 * The classes are stripped below for the same reason — the values written here
 * are the whole styling.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Whether a computed value is worth writing.
 *
 * The rule is "write it if it differs from what the element would do anyway".
 * A value equal to the initial one is not a decision the stylesheet made, it is
 * the absence of one — and writing it down turns an inherited default into a
 * stated intent. That matters most for `fill`: SVG's initial fill is opaque
 * black, so every `<g>` and `<line>` computes to `rgb(0, 0, 0)` whether or not
 * anything said so. Baking that in puts 25 black fills into a figure that has
 * no black in it, and the day someone adds a closed `<path>` to the diagram it
 * will be filled solid black by an attribute nobody wrote on purpose.
 */
function worthWriting(prop, value) {
  if (value === '' || value == null) return false;
  if (prop === 'fill') {
    // Black is the initial value for every element here; a real fill is a
    // colour the stylesheet chose, and `none` is a decision too.
    return value !== 'none' && value !== 'rgb(0, 0, 0)';
  }
  if (prop === 'stroke') return value !== 'none';
  if (prop === 'stroke-width') return value !== '0px' && value !== '0' && value !== '1px';
  if (prop === 'opacity' || prop === 'fill-opacity' || prop === 'stroke-opacity') {
    return value !== '1';
  }
  if (prop === 'stroke-dasharray') return value !== 'none' && value !== '';
  // The defaults for these are the values a diagram almost always wants, and
  // the stylesheet sets them on nothing.
  if (prop === 'fill-rule') return value !== 'nonzero';
  if (prop === 'stroke-linecap') return value !== 'butt';
  if (prop === 'stroke-linejoin') return value !== 'miter';
  return true;
}

/**
 * A font stack that survives leaving the app.
 *
 * The app's own fonts are bundled as woff2 and referenced by the stylesheet, so
 * a computed `font-family` names faces the export cannot carry. Embedding the
 * woff2 as base64 would work and would multiply the file size by twenty for
 * diagrams whose text is a dozen short labels — and an SVG dropped into a
 * document should adopt that document's type anyway. The stack is therefore
 * reduced to generic families, which is what the reader's machine already has.
 */
function portableFontFamily(value) {
  const generic = /(monospace|sans-serif|serif)/i.exec(value);
  if (!generic) return 'sans-serif';
  // Keep only the generic tail: everything before it names a bundled face.
  return generic[1].toLowerCase();
}

/**
 * Elements that carry text for assistive tech rather than drawing it.
 *
 * `<title>` and `<desc>` are not rendered, so every style property computed on
 * them is the initial value — `fill: rgb(0, 0, 0)`, `stroke-width: 1px`, the
 * whole list. Writing those onto the export is noise that makes the file look
 * like it has a black fill where it has none, and invites a reader to "fix" a
 * value that was never doing anything.
 */
const NON_DRAWING = new Set(['title', 'desc', 'metadata']);

/** Copy the computed style of one element onto its clone. */
function styleClone(source, clone) {
  if (NON_DRAWING.has(source.nodeName.toLowerCase())) return;
  const cs = source.ownerDocument?.defaultView?.getComputedStyle(source);
  if (!cs) return;
  for (const prop of COPIED) {
    let value = cs.getPropertyValue(prop);
    if (!worthWriting(prop, value)) continue;
    if (prop === 'font-family') value = portableFontFamily(value);
    clone.setAttribute(prop, value.trim());
  }
}

/**
 * Rebuild the tree with computed styles baked in.
 *
 * A deep `cloneNode` would carry the classes across, and the classes are what
 * has to go — the point is a file that stands alone. So the tree is walked in
 * step and rebuilt element by element.
 */
function bake(source, target) {
  for (const child of source.childNodes) {
    if (child.nodeType === 3) {
      target.appendChild(target.ownerDocument.createTextNode(child.textContent));
      continue;
    }
    if (child.nodeType !== 1) continue;
    // Foreign-namespace content (an embedded <img>, say) is dropped rather
    // than copied: it cannot be inlined and a dangling reference is worse
    // than an absent one.
    if (child.namespaceURI !== SVG_NS) continue;

    const copy = target.ownerDocument.createElementNS(SVG_NS, child.nodeName);
    for (const attr of child.attributes) {
      // `class` and `style` are what the baked values replace; `id` and
      // `aria-*` can collide with the host document.
      if (attr.name === 'class' || attr.name === 'style') continue;
      if (attr.name === 'id' || attr.name.startsWith('aria-')) continue;
      copy.setAttribute(attr.name, attr.value);
    }
    styleClone(child, copy);
    bake(child, copy);
    target.appendChild(copy);
  }
}

/**
 * Serialise a diagram element to standalone SVG markup.
 *
 * @param {SVGElement} svg      The live `<svg>` inside a rendered diagram
 * @param {object} [opts]
 * @param {string} [opts.background]  Surface colour, which computed style
 *                                    cannot report for an SVG element
 * @returns {string} a complete `<svg>` document
 */
export function serializeDiagram(svg, { background } = {}) {
  if (!svg) return '';
  const doc = svg.ownerDocument;
  const out = doc.createElementNS(SVG_NS, 'svg');

  for (const attr of svg.attributes) {
    if (attr.name === 'class' || attr.name === 'style') continue;
    if (attr.name === 'aria-labelledby' || attr.name === 'aria-describedby') continue;
    out.setAttribute(attr.name, attr.value);
  }
  // `xmlns` is required for the file to open on its own; the DOM API does not
  // add it because the element is created in a document that already has one.
  out.setAttribute('xmlns', SVG_NS);
  out.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  if (background) {
    out.setAttribute('style', `background:${background}`);
  }

  bake(svg, out);

  const markup = new XMLSerializer().serializeToString(out);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
}

/**
 * The filename for a diagram export.
 *
 * Named after the diagram and the theme, because a notebook accumulates these
 * and "diagram.svg" three times over is a folder nobody can search. The date is
 * omitted deliberately: a figure pasted into a report should be identified by
 * what it shows, not by when it was exported.
 */
export function diagramFilename(name, theme) {
  const safe = String(name ?? 'diagram')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'diagram';
  return `lab-calc-${safe}-${theme ?? 'default'}.svg`;
}
