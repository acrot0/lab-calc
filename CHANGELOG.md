# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-09-25

Installable, and correct on a phone.

### Added

- **An install offer, with the right instructions per platform.** An
  installable PWA says nothing about being installable — Chrome buries the
  entry in a menu, and iOS Safari has no menu item at all (Share → Add to Home
  Screen is not discoverable). Three paths, and the difference is the point:
  Chromium's held `beforeinstallprompt` opens the real native dialog; iOS and
  iPadOS get written steps, because they never fire that event; a browser with
  no install path gets nothing. A dismissal is remembered and never asked
  again.
  - iPadOS 13+ reports itself as a Macintosh, so it is detected by touch points
    as well as user agent. Without that, every modern iPad is shown an install
    button that does not exist there.
- **Install-prompt screenshots** in the manifest. Without them an Android
  install shows a plain bar instead of a card with a preview. They are
  composed rather than captured, and drawn from the app's own palette —
  imported, not copied — so they cannot disagree with the product.
- **`id` and `display_override`** in the manifest. The first pins the app's
  identity so a future `start_url` change does not make an installed app look
  like a different app; the second lets a Chromium browser that understands it
  go a step beyond `standalone`.

### Fixed

- **The back gesture closed the app instead of the layer.** Installed, there is
  no browser back button, so the system gesture is the only way back — and with
  no history entries of our own it exited the app, taking whatever was typed
  into the form with it. One entry is now pushed per open layer, so the gesture
  closes the topmost one. Two cases that are easy to get wrong: a layer
  dismissed by its own X used to strand its entry, so the next back press
  exited the app with no visible cause; and the first-visit disclaimer is not
  dismissible by back until it has been acknowledged.
- **The status bar and home indicator overlapped the page.** Installed, the app
  runs full-screen, so the sticky topbar sat under the clock and the
  calculator's last keypad row under the gesture bar. `env()` reports the
  insets but only when the viewport opts in via `viewport-fit=cover`, which
  was missing — so the CSS would have silently done nothing.
- **The result reveal never replayed.** `.result-main` was animated directly,
  and a CSS animation runs on mount, so the panel animated once on the first
  result of the session and every result after it appeared with no transition.
  Invisible in a screenshot, because the end state is identical. The contents
  are now keyed on the value.

### Changed

- **Motion.** Three named durations and three curves, so a rule that wants
  "something arrives" reaches for `--dur-enter` rather than a number. The tab
  underline scales in from the centre rather than jumping, and the live
  expression value slides in as it appears — the movement is how a user
  discovers that a box labelled "volume" accepts `250*0.1/2`.
  - Reduced motion keeps the meaning and drops the movement: the underline
    fades instead of scaling, and the keyed reveals fall back to opacity only.

## [0.5.0] — 2026-09-25

### Added

- **The exam properties on the element detail panel** — electronegativity,
  common oxidation states, melting point, boiling point, density, first
  ionization energy and year of discovery, for all 118 elements. The panel
  previously showed mass, radii, category and electron configuration, which
  describe an element but are not what an exam asks about.
  - Data comes from the PubChem periodic table (NCBI/NIH, **public domain**).
    Community datasets were rejected for licence reasons: the usual ones are
    CC BY-SA, whose ShareAlike term is incompatible with this project's MIT
    licence.
  - `scripts/fetch-element-properties.mjs` generates
    `src/calc/element-properties.mjs`; both are committed, so any value can be
    re-derived rather than trusted and the app itself needs no network.
  - `null` means PubChem has no value — 23 elements have no measured
    electronegativity, and the superheavies have no melting point. Those render
    as an em dash. A zero would be a fabrication.
  - Density spans five orders of magnitude (hydrogen 8.99×10⁻⁵, osmium 22.57),
    so it uses `fmtSci`.

### Fixed

- **The light theme's dim text failed the contrast floor** — `--text-dim`
  measured 3.91:1 against `--surface-3` and 4.21:1 against `--surface-2`, under
  the 4.5:1 minimum for text below 18pt. It passed on white (4.59:1), which is
  why it went unnoticed. Now 5.02 / 5.40 / 5.89.
- **Six accessibility failures Lighthouse reports**, all of them real:
  `role="grid"` wrapped 118 `role="gridcell"` buttons with no rows (a grid needs
  row children and a gridcell needs a row parent, so the roles described a
  structure that did not exist); no `<main>` landmark; the 9px cell labels used
  `--text-dim` on a category tint; and the number and name were announced twice
  because they sat in the button's text as well as its label. Accessibility now
  scores 100, up from 79.
- **`robots.txt` was a 404**, costing the SEO score its only failing audit.

- **Six malformed formulas were accepted as valid** — `Na0Cl` (a zero subscript
  contributed no sodium, so the molar mass came back as the mass of chlorine
  alone), `H0` (returned zero), `Ca()2` and `()` (empty groups silently
  dropped), `NaCl.` (the empty segment was filtered out, so the formula read as
  NaCl) and `H2O·5` (the coefficient after the hydrate dot was ignored). Each
  produced a plausible number for an input that has no answer, which is the
  failure this module exists to prevent; each now throws with its own code.
- **The arithmetic knew 83 elements while the periodic table showed 118** — the
  atomic-weight table was written out by hand and had drifted from the element
  table, so `UF6`, `PuO2` and `Ac2O3` were rejected as unknown elements. The
  weight table is now derived from the element table.
- **The formula field showed a fixed "unparseable" message** for every failure,
  so "subscript cannot be zero" and "empty parentheses" arrived as the same
  shrug. The specific reason is now translated and shown.

### Added

- **Isotope notation** — `D` and `T` are read as deuterium and tritium (D₂O is
  20.027 g/mol, not 18.015), and the `-dN` label expands against the hydrogen
  count (`DMSO-d6` is C₂D₆OS). A label larger than the available hydrogens is
  rejected rather than clamped.
- **Organic group abbreviations** — Me, Et, iPr, tBu, Ph, Bn, Bz, Boc, Cbz,
  Fmoc, TBS, TMS, Ms, Tf and common solvents (DMSO, THF, DMF, EtOAc…).
  Abbreviations that are also element symbols (Pr, Ac, Ar, Ts, Am) are
  deliberately **not** expanded: `Pr2O3` is praseodymium oxide, and reading Pr
  as propyl would silently change the meaning of a correct formula.


- **Element categories were wrong for 13 of 118 elements** — the category was
  derived from the grid position, but the staircase dividing metals from
  non-metals cuts diagonally across the columns. Carbon, nitrogen, oxygen,
  phosphorus and sulfur share groups 14–16 with tin and lead and came out
  post-transition metals; astatine in group 17 came out a halogen. Categories
  are now explicit membership lists, and `categoryOf` throws on an unassigned
  element rather than falling back to a plausible default.
- **The element detail panel reported the drawing row as the period** — it said
  lanthanum was in "period 9, group 4". The f-block is drawn on rows 9 and 10
  and spans groups 3–17 for layout, so both numbers were coordinates rather than
  chemistry; lanthanum is in period 6 and is not in group 4, which holds Ti, Zr,
  Hf and Rf.
- **Cross-dimension unit conversion returned a confident wrong answer** —
  `unitConvert(1, 'g', 'mL')` returned `1`, because grams and millilitres both
  have a factor of 1 against their own base. A mass-to-volume conversion needs a
  density the function has no way to know; it now throws `incompatibleUnits`.
- **Trace amounts rendered as zero** — a 1 µM solution in 1 mL needs 5.844×10⁻⁸ g,
  which the weigh tab reported as `0 g`; a weak absorber gave 6.7×10⁻⁸ M, which
  the spectrophotometer reported as `0 mol/L`; the eighth tube of a 1:100 serial
  dilution reported `0`. Amounts with no lower bound (mass, moles,
  concentration) now use `fmtSci`; quantities with a floor keep `fmt`.
- **Preset chips shipped Chinese to English users** — reagent, solute and pKa
  presets were written as literals in the components (`'盐酸 HCl 37%'`,
  `'葡萄糖 glucose'`). Each now carries a translation key with the
  language-independent parts held separately.
- **`<html lang>` never changed on locale switch** — an English user's document
  still claimed to be Chinese, so a screen reader read English with Chinese
  phonetics.

### Added

- **Electron configuration and valence count** for every element, with the
  twenty Madelung-rule exceptions as explicit data rather than generated —
  chromium is `[Ar] 3d5 4s1` and palladium is `[Kr] 4d10`, and a generated table
  would have been wrong in twenty places while looking right everywhere.
- **Periodic table legend, axis labels and keyboard navigation** — the
  "colour by category" view used the per-element CPK colours, so it produced 118
  hues and showed no grouping at all; it now uses one colour per category with a
  legend. Group numbers run across the top, period numbers down the gutter, and
  the two detached rows are named. Arrow keys move between cells instead of 118
  tab stops.
- **Block view** (s/p/d/f) for the periodic table, and a legend ramp for the
  numeric properties so the key and the cells share one ramp.
- **Unit conversion by dimension** — each dimension gets its own picker, so
  grams on one side and millilitres on the other is never offered; a swap button
  flips a conversion in one tap.

### Changed

- `README.md` caught up with the seven tabs added since it was written.

## [0.4.0] — 2026-09-24

### Added

- **Educational-use notice** — shown on first visit, reopenable from the footer.
  It names the specific model limitations (ideal solutions, no activity
  coefficients or temperature, approximate near equivalence points) rather than
  gesturing at "limitations", and states plainly that the tool is not for
  clinical, diagnostic, or production use. A calculator that looks authoritative
  will be trusted further than it deserves; the notice is what closes that gap.
- **Theme: dark / light / follow-system** — three states rather than a two-way
  toggle, so the OS preference is always reachable without clearing storage.
- **Design token system** — spacing, type, elevation, motion and colour as
  custom properties, so the light theme is a second token block rather than a
  second stylesheet.
- Footer stating the educational-use limit on every screen.

### Fixed

- The titration canvas hardcoded dark grid colours, so grid lines and axis
  labels were nearly invisible in the light theme. Canvas cannot read CSS custom
  properties, so the palette is now passed in and memoised.

### Changed

- First-run flow: the notice is acknowledged once and not shown again. Failing
  storage re-shows it rather than skipping it — re-reading a warning is the safe
  direction to fail.

## [0.3.0] — 2026-09-24

### Added

- **Polyprotic and strong-acid titration curves** — the solver handles any
  number of protons via the average charge z̄, computed from the full
  distribution over protonation states. Verified against textbook landmarks:
  phosphoric acid gives three equivalence points at 25/50/75 mL with
  half-equivalence pH values landing on pKa₁/₂/₃; hydrochloric acid gives pH
  7.00 at equivalence and 1.48 at half-equivalence.
- **Chinese / English** — the calc layer throws error codes rather than prose
  (so a language switch reaches error messages too), and history summaries are
  derived at render time rather than stored, so switching language retranslates
  existing entries. Two dictionaries are held to identical key and placeholder
  sets by test.
- **Offline support (PWA)** — manifest and service worker. Verified by cutting
  the network and running a calculation.
- **Procedurally generated app icons** — `scripts/make-icons.mjs`, including a
  hand-rolled PNG encoder. Colours are taken from the CSS tokens, and CI
  regenerates the icons and asserts no diff.

## [0.2.0] — 2026-09-24

### Added

- **Titration curve** — solved from the charge balance rather than the
  `√(Ka·C)` approximation, which fails near an equivalence point. That region is
  the reason the curve exists.
- **Export** — CSV (with a UTF-8 BOM, without which Excel on Windows renders
  every Chinese character as mojibake) and Markdown.
- **GitHub Pages deployment**, with tests running before publish.

### Fixed

- The bisection solve bracketed the charge-balance residual the wrong way,
  assuming it decreased in [H⁺]. It increases; the wrong bracket converged
  confidently on pH 16.

## [0.1.0] — 2026-09-24

### Added

- Seven calculators: weigh-out, dilution, buffer, serial dilution, pH, percent
  solution, unit conversion.
- **Calculation history** — every calculation is kept automatically, searchable,
  and reloadable. The arithmetic is textbook and anyone can write it; the
  keeping is the part no existing calculator does.
- Pure calculation core (`src/calc/`) with no I/O, tested against hand-computed
  reference values.
- Storage injected as an interface, so history logic is testable in Node.
- 3-OS × 2-Node CI, plus a smoke test asserting known answers and a check for
  unused imports.

[0.5.0]: https://github.com/acrot0/lab-calc/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/acrot0/lab-calc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/acrot0/lab-calc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/acrot0/lab-calc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/acrot0/lab-calc/releases/tag/v0.1.0
