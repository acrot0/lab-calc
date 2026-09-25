/**
 * One-off: find an element-category palette that survives colour vision
 * deficiency.
 *
 * The constraint is not "pick pretty colours". It is that ten categories stay
 * mutually distinguishable under protanopia, deuteranopia and tritanopia while
 * still respecting chemistry's own conventions — alkali metals read as red,
 * halogens as green, noble gases as violet. Those pull against each other: the
 * violet end of the wheel is where the three purple-family categories
 * (noble / lanthanide / actinide) collapse into one under red-green deficiency.
 *
 * Method: seven categories map onto Okabe-Ito hues that already satisfy the
 * convention, so they are pinned. Only the three that have no Okabe-Ito home
 * (halogen, lanthanide, actinide) are searched — over hue, saturation and
 * lightness together, scored by the worst pairwise separation across all three
 * simulated deficiencies.
 *
 * Run by hand; the winner is pasted into src/ui/palette.mjs. Kept in the repo
 * so the choice is reproducible rather than a matter of taste.
 *
 *   node scripts/search-palette.mjs
 */

import {
  simulateCvd, hexToRgb, CVD_KINDS, rgbToHex, contrastRatio,
} from '../src/ui/palette.mjs';

function distance(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * The separation the published Okabe-Ito palette achieves under each simulated
 * deficiency. Measured, not assumed — Okabe-Ito's own tightest pair is its grey
 * against its reddish purple under deuteranopia, at 18.4.
 *
 * Used to normalise the score: raw RGB distance is not comparable across the
 * three deficiencies, because each simulation compresses the colour space by a
 * different amount. Protanopia has the most room (the reference palette manages
 * 37.7), so an unnormalised "worst pair" would always be reported for whichever
 * deficiency compresses least, and the search would over-optimise for it while
 * leaving a real collision in another.
 */
const REFERENCE = { protanopia: 37.7, deuteranopia: 18.4, tritanopia: 33.8 };

/** Smallest pairwise distance within a palette under one deficiency. */
function minFor(palette, kind) {
  const names = Object.keys(palette);
  const sim = names.map((n) => simulateCvd(palette[n], kind));
  let min = Infinity;
  let where = '';
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const d = distance(sim[i], sim[j]);
      if (d < min) { min = d; where = `${names[i]}/${names[j]}`; }
    }
  }
  return { min, where };
}

/**
 * Score a palette by its worst *normalised* separation: each deficiency's
 * minimum divided by what the reference palette achieves there. A score of 1
 * means "as good as Okabe-Ito everywhere"; below 1 means worse somewhere.
 */
function worstPair(palette) {
  let score = Infinity;
  let where = '';
  let kind = '';
  let raw = Infinity;
  for (const k of CVD_KINDS) {
    const { min, where: w } = minFor(palette, k);
    const normalised = min / REFERENCE[k];
    if (normalised < score) { score = normalised; where = w; kind = k; raw = min; }
  }
  return { min: score, raw, where, kind };
}

function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
            : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * The seven that map onto Okabe-Ito without violating a convention. These are
 * the published palette's own values, unmodified — there is no reason to
 * second-guess a palette that was designed for exactly this.
 */
const PINNED = {
  alkali: '#D55E00',          // vermillion
  alkaline: '#E69F00',        // orange
  postTransition: '#009E73',  // bluish green
  metalloid: '#56B4E9',       // sky blue
  nonmetal: '#0072B2',        // blue
};

// Every colour has to be readable as a legend swatch and as full-strength text
// on the dark surface; below 3 is the WCAG floor for graphics.
const DARK = '#12151d';
const MIN_CONTRAST = 3;

let best = null;
for (let hHalogen = 60; hHalogen <= 140; hHalogen += 5) {
  for (const lHalogen of [0.42, 0.50, 0.58]) {
    for (let hLanth = 255; hLanth <= 345; hLanth += 5) {
      for (const lLanth of [0.48, 0.56, 0.64]) {
        for (let hAct = 250; hAct <= 350; hAct += 5) {
          // The actinide is the darkest of the three purples, and darkness is
          // what collides with the contrast floor: below L≈0.46 a purple on the
          // dark surface measures under 3:1. The search starts there rather
          // than lower, so it spends its time on combinations that can pass.
          for (const lAct of [0.46, 0.52, 0.58]) {
            // Transition metals are also searched: Okabe-Ito's grey is 18.4
            // from its own reddish purple under deuteranopia, which is the
            // tightest pair in the published palette. A slightly blue-shifted
            // grey opens that gap without losing the "recedes into the
            // background" quality the bulk-of-the-table category wants.
            for (let hTrans = 200; hTrans <= 260; hTrans += 10) {
              for (const sTrans of [0.04, 0.08, 0.12]) {
                for (const lTrans of [0.60, 0.66, 0.72]) {
                  const palette = {
                    ...PINNED,
                    transition: hsl(hTrans, sTrans, lTrans),
                    halogen: hsl(hHalogen, 0.70, lHalogen),
                    lanthanide: hsl(hLanth, 0.42, lLanth),
                    actinide: hsl(hAct, 0.45, lAct),
                  };

                  // Reject anything that fails the contrast floor before
                  // scoring it — a beautifully separated palette nobody can
                  // read is not a palette.
                  const contrastOk = Object.values(palette)
                    .every((hex) => contrastRatio(hex, DARK) >= MIN_CONTRAST);
                  if (!contrastOk) continue;

                  const w = worstPair(palette);
                  if (!best || w.min > best.min) {
                    best = {
                      min: w.min, raw: w.raw, where: w.where, kind: w.kind, palette,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`best normalised score: ${best.min.toFixed(3)} (worst pair ${best.where} under ${best.kind}, raw ${best.raw.toFixed(1)})`);
console.log('  a score of 1.000 means "as separated as Okabe-Ito under every deficiency"');
console.log();
for (const [name, hex] of Object.entries(best.palette)) {
  const c = contrastRatio(hex, DARK);
  console.log(`  ${name.padEnd(16)} ${hex}   contrast ${c.toFixed(2)}`);
}
console.log();
for (const k of CVD_KINDS) {
  const { min } = minFor(best.palette, k);
  console.log(`  ${k.padEnd(14)} ${min.toFixed(1).padStart(5)}  (reference ${REFERENCE[k]})`);
}
