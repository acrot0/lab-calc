# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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

[Unreleased]: https://github.com/acrot0/lab-calc/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/acrot0/lab-calc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/acrot0/lab-calc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/acrot0/lab-calc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/acrot0/lab-calc/releases/tag/v0.1.0
