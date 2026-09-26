# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] — 2026-09-26

A phone build, an Android build, and a desktop build that works.

### Fixed

- **The packaged Windows build rendered a blank window.** Since code splitting
  arrived, every released desktop build has been dead: the app opened, showed a
  title and a background colour, and drew nothing. Two causes, stacked, both
  invisible to the unit suite because both only fail under `file://`. The
  packager strips `type="module"`, because `file://` refuses module scripts —
  and what was left still contained `import.meta`, which is a **syntax error**
  outside a module, so the whole script failed to parse. `import.meta` comes
  from Vite's own preload helper and is injected whether or not splitting is on.
  The desktop build is now an IIFE, which has no module semantics and nothing to
  resolve. The packager refuses a bundle containing `import.meta`, a dynamic
  `import(`, or more than one JS file — the failure now lands in the build
  rather than in a user's first launch.
- **The calculator was unusable on a phone.** Measured at 390×844: keys 40px
  against a 44px floor, DEG/RAD 48×28, unit chips 28px, and 25 of 42 keys
  reachable at 360×640. The sheet was also anchored to `bottom: 0` with no idea
  the software keyboard existed — no viewport unit accounts for it, because it
  overlays the page rather than resizing it — and the input auto-focused on
  open, summoning that keyboard over the keypad. Touch sizing is keyed on
  `pointer: coarse` rather than a width, because the defect is the input device:
  a touch laptop at 1440px has the same fingertip as a phone. A landscape phone
  (844×390) passes the width breakpoint and got the floating window, whose clamp
  only guarantees the grab margin stays on screen — right for a window a cursor
  can drag back, wrong for one a thumb cannot; measured there, zero of 42 keys
  were reachable. It now takes the sheet, turns to two columns, and shows 25.
- The smoke test's tab count was hardcoded at 15 and had been failing since a
  tab was added; it now counts the tab files.

### Added

- **The pH tab corrects for ionic strength.** The buffer tab did and the pH tab
  did not, which read as a claim the README was careful not to make. Both
  models are now shown side by side. The correction needs two things a pKa does
  not carry — the charge of the acid form and the background ionic strength —
  and both default to the values that make it vanish, so a user who does not
  know their ionic strength gets the number the tab always gave. Measured at
  I = 0.1: phosphate pKa₂ (z = −1) 4.100 → 3.993, ammonium (z = +1) 5.125 →
  5.232, acetic acid (z = 0) 2.880 → 2.884. The 0.004 is reported as it is: for
  a neutral acid the terms cancel, the ideal model is right, and manufacturing a
  visible shift would teach a wrong mechanism. A neutral base is worked as the
  same equation with OH⁻ in the proton's role and with z = 0 — its conjugate
  acid is a cation, but passing +1 over-corrects by the full 0.10.
- **Product yield against how much of a reactant is supplied, on the reaction
  tab.** The numbers answer "how much do I get"; the question they cannot answer
  is "would more of this help". The answer is a plateau, and a plateau is
  invisible in one row of results. Swept, it is a wedge with a corner at the
  balanced ratio — 4 Fe to 3 O₂ as a place the line bends rather than a fact to
  memorise. The colligative tab was considered and left alone: its `i` is an
  input rather than a function of concentration, so the chart would be a
  straight line through the origin, restating one number more slowly than the
  number.
- **Diagrams export as standalone SVG.** The component's own comment claimed
  they "can be exported by copying the markup", which was untrue: every shape is
  styled through a CSS class resolving through a theme token, so the markup
  alone is unstyled black hairlines. The export reads each element's computed
  style and writes those values onto the elements — no stylesheet, no font
  files, no JavaScript. Values equal to the SVG initial are not written, which
  drops 25 black fills from a figure containing no black and takes the file from
  15 KB to 10.5 KB.
- **An Android APK**, built from the same web bundle as everything else.
  Measured 4.5 MB against 268 MB for Electron — same app. The launcher icon is
  the app's own mark in all five density buckets plus the adaptive foreground,
  verified by comparing sampled pixels against the PWA icon (25 of 25
  identical); the version reads the repository's `package.json` rather than
  Capacitor's template `1.0`.
- **A Tauri shell** as an alternative desktop build, for a machine where the
  Electron build's size is the obstacle. Scaffolding and configuration are
  complete; the first Rust build is not, because fetching the crate index from
  crates.io exceeds any timeout worth waiting on here.
- The installed PWA reuses its open window on relaunch (`navigate-existing`
  rather than `focus-existing`, so a shortcut's `?tab=` still arrives).

### Changed

- The desktop build is 268 MB rather than 322: the DirectX shader compilers and
  the software Vulkan fallback are gone (37 MB, no caller in a 2D-only app) and
  the Chromium licence file is gzipped in place (19.5 → 2.0 MB, notices kept in
  full, nothing summarised).
- The pH tab's preset list comes from the buffer table rather than being written
  out again, which brings in the charged cases — Tris-HCl, HEPES, phosphate
  pKa₂ — where the correction actually moves.

### Documentation

`README.md` and `docs/research-value.zh.md` both said activity correction lives
only in the reagent tab and that non-buffer pH is computed ideally. Both now say
which tabs correct and which do not, and why the ones that do not are
unaffected — a preparation answers "how much do I weigh out", and activity does
not change a mass. `research-value.zh.md` also listed its idealisation caveats
twice; one copy removed. The roadmap header still described v0.5.0.

## [0.7.0] — 2026-09-26

Two more charts on calculate.

### Added

- **The distribution over protonation states, on the pH tab.** The tab rests on
  `[H⁺] ≈ √(Ka·C)`, and that approximation has a domain: it assumes the acid is
  barely dissociated. A reader who has seen the distribution knows when the
  formula applies without being told. Two things it shows that the formula
  hides — the curves cross at exactly pH = pKa, and by pKa + 2 the acid form is
  99% gone, which is where the approximation has already failed. The tab's own
  warning says the same thing; this is that claim made checkable.
  - Species are coloured by rank rather than by identity: a palette has a
    handful of distinguishable hues and phosphoric acid has four states, so
    identity colouring would need a generator and would produce two greens
    nobody can tell apart. The order is the information, so the ramp follows it
    and a markup legend carries the names — readable at any zoom, and reachable
    by a screen reader.
- **The Nernst line, on the electrochemistry tab.** E depends on Q
  logarithmically, so the question that usually matters is not "what is E now"
  but "how much can Q move before the cell stops driving the reaction". Drawn,
  that distance is visible; tabulated it is a number the reader solves for. The
  slope is RT·ln10/nF, so the line's steepness *is* the n and the temperature
  the tab is set to.
  - **The x range brackets the operating point by one decade and does not
    stretch to reach E = 0.** The first version did stretch, on the argument
    that the crossing is the point of the plot. It is not, for most cells:
    log₁₀K is nE°/0.05916, so a Daniell cell reaches equilibrium at log Q ≈ 37.
    Drawing 38 decades to reach it squashed the line into a sliver with 95% of
    the canvas empty. The crossing is drawn when it falls inside the window and
    the caption changes when it does not — two captions, because promising a
    crossing the axis cannot reach is a caption describing a picture the reader
    is not looking at. The marker's presence therefore means "within a decade of
    equilibrium", which is a fact about the cell rather than an accident of the
    axis.

### Changed

- **`niceTicks` moved to `chart-axis.mjs` and learned a non-zero minimum.** A
  second chart needed it, and the alternative was importing an axis helper from
  one plot component into another — which would make the second depend on the
  first's file for a reason that has nothing to do with either chart. The
  non-zero case is what the Nernst y axis needs: over a one-decade window the
  potential moves by hundredths of a volt, and the old zero-based sequence put
  every tick outside the plotted range.

## [0.6.0] — 2026-09-26

Installable, correct on a phone, and able to do the arithmetic.

### Added

- **Molecular biology — the first non-chemistry calculations in the app.** Every
  one of the fifteen tabs was chemistry, so a biology lab's daily arithmetic was
  not in the app at all, and it is the arithmetic most likely to be done wrong
  at 6pm with a pipette in one hand. Nine calculations, each one a ratio:
  nucleic-acid concentration by A260 with the coefficient as a *parameter*
  (50/40/33 µg/mL for dsDNA, RNA and ssDNA — using 50 on an oligo overstates the
  yield by half), path length and dilution corrected, which is what a NanoDrop's
  short path needs; purity ratios 260/280 and 260/230 with a deliberately coarse
  verdict, because a ratio cannot tell a little phenol from a lot and a number
  presented as a diagnosis is worse than a number presented as a number;
  dilution to a target returned as **volumes** rather than a fold factor, since
  the fold is not what gets pipetted; oligo molarity, which refuses without a
  sequence because an oligo's absorbance depends on its sequence; seeding
  volume; doubling time, which throws on a decline rather than returning a
  negative doubling time; RPM↔RCF; and the k-factor, the radius-independent way
  to specify a centrifugation and therefore the only one that transfers between
  rotors.
  - **Michaelis–Menten by Hanes–Woolf, not Lineweaver–Burk.** The latter divides
    by v, so the noisiest measurement — the smallest rate — gets the largest
    weight. The fit is checked against data generated from known parameters and
    r² is reported, so a fit that does not describe the data is visible.
- **The enzyme kinetics curve, with the residual visible.** A table of Vmax, Km
  and r² cannot show the thing that matters most about an assay: whether the
  substrate range actually brackets Km. A fit from five points all far below Km
  produces confident-looking parameters from data containing almost no
  information about Vmax. Each measurement is drawn with a vertical tie to the
  fitted curve — that segment *is* the residual — and Km and Vmax are dashed
  guides, so whether Km falls inside the measured range is checkable rather than
  inferable.
- **A calculator that can actually do the arithmetic.** The keypad could not
  reach most of what the parser understood. Now: two function pages with the
  digits, brackets, clear and backspace on a block that does not swap; a comma
  key, without which `hypot(`, `min(`, `max(` and `atan2(` open calls the keypad
  cannot finish — a dead end on a phone, where the on-screen keypad is the only
  keyboard there is; `mod` and `|x|`, with tooltips saying what `%` and `mod`
  each do. The window was capped 100px shorter than the keypad it holds and
  opened with its last two rows behind a scrollbar.
- **Four more palettes** — Gruvbox and Solarized, dark and light, six to ten.
  Both read from their own packages rather than transcribed. Three packages were
  checked and rejected with reasons in the file: Nord, whose
  `(Apache-2.0 AND CC-BY-SA-4.0)` would attach share-alike to this MIT
  distribution; `solarized-colors`'s `index.js`, which is a verbatim copy of
  gruvbox's hex values under a Solarized filename; and `base16` on npm, the same
  stale gruvbox copy under a third name.
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

### Changed

- **`2**10`, `1,000` and `mod` are accepted.** Three inputs that are unambiguous
  arithmetic to a person but were parse errors here. `**` is tokenised as a
  single `^` rather than added as a second operator, so precedence has one power
  operator to reason about and the two spellings cannot drift apart. The
  separators in `1,000` are stripped, never interpreted, and only the strict
  grouping form is accepted — `1,00` stays a syntax error rather than being
  silently read as 100, and the European form is deliberately not guessed at,
  because guessing wrong is worse than refusing. `%` stays percent: in a lab
  calculator a trailing percent means per hundred, so `0.9%` is a concentration
  of 0.009, which is the reading this app exists to serve.
- **The model now corrects for activity, ionic strength and temperature.** The
  educational notice had said since the first release that all three were
  ignored. Temperature moves pKa by the integrated van 't Hoff relation, and the
  movement varies by two orders of magnitude across the buffers offered —
  acetate drifts 0.002 units over 25 → 20 °C while Tris drifts 0.12 and 0.63
  over 25 → 4 °C, so a buffer table with one number per buffer is wrong about
  Tris by more than its useful range. Ionic strength is derived from the recipe
  rather than asked for: a solution is neutral, so the counter-ion is whatever
  balances the buffer's own charged species, and for phosphate that counter-ion
  is the largest single contributor to I — counting only the buffer's own ions
  understates it by a factor of 1.6. Activity by Davies, in both the weak-acid
  solve and Henderson–Hasselbalch.
  - **For a neutral weak acid the correction cancels**, and the module returns
    that answer rather than manufacturing a shift: γ_H = γ_A, so acetic acid
    moves 0.0008 units between I = 0 and I = 0.1. A calculator that "corrected"
    acetic acid by 0.05 would teach a wrong mechanism. What it does fix is the
    charged acids — phosphate's pKa2 solution moves 0.38 units at bench
    concentration.
- **The limitations notice is now split in two.** A notice that understates the
  tool is its own kind of untruth: it teaches the user to distrust a number that
  is better than they think. One column is what is corrected and where the
  correction is valid; the other is what no tab models at all — CO₂ dissolution,
  volume contraction, impurities and complexation, and non-buffered pH and every
  titration curve, which still solve for an ideal solution. The README grows the
  same split into a table with the numbers the correction produces (Tris at 4 °C
  moves 7.37 → 8.08; phosphate at I = 0.2 moves −0.38).
- **The first screen stopped carrying every tab.** Measured before: 236 KB
  gzipped to draw the default tab; after, 186 KB. The whole app was in one
  bundle, so opening it downloaded and parsed all sixteen tabs — the periodic
  table with its SMILES renderer, two canvas-chart tabs, the print report, and a
  hand-rolled ZIP-of-XML spreadsheet writer — before the first field appeared.
  Sixteen chunks now, 0.9–12.6 KB each. The print report loads when the panel
  mounts rather than at print time, because a print dialog does not wait for a
  network fetch. `lucide-react` (33.7 MB on disk, referenced nowhere) is gone.
- **The material toggle is gone.** On a machine with "reduce transparency"
  switched on it was permanently disabled — correctly, because a user who asked
  for less transparency must not be given more of it. But a control that is
  always greyed out is indistinguishable from a broken button, and it was
  reported as one. The honest fix is to stop offering a choice the OS has
  already made: the preference is read and applied, and there is no button to be
  confused by.
- **The layout no longer jumps when a result appears, and the calculator stops
  closing itself.** The card was a single grid with results placed into column 2
  by `grid-column`, and CSS Grid *shares row heights across columns* — so a
  282px result stretched row 1 for both columns and the primary button, which
  belongs directly under the fields, was pushed down by the full height of the
  result. Measured: the button moved 212px on every calculation. No grid tuning
  fixes it; the shared row is what a grid is. The split is now two flow
  contexts, so neither column can push the other, and the button moves 0px. The
  calculator sat behind a full-screen scrim whose only job was to dismiss it —
  the behaviour of a modal, for a window that is deliberately not one. It exists
  so a number can be worked out *while* filling in the form behind it, and a
  scrim that dismissed it on the first click into a field made it useless for
  exactly that.
- **Motion.** Three named durations and three curves, so a rule that wants
  "something arrives" reaches for `--dur-enter` rather than a number. The tab
  underline scales in from the centre rather than jumping, and the live
  expression value slides in as it appears — the movement is how a user
  discovers that a box labelled "volume" accepts `250*0.1/2`.
  - Reduced motion keeps the meaning and drops the movement: the underline
    fades instead of scaling, and the keyed reveals fall back to opacity only.

### Fixed

- **A pasted expression was arithmetic, not a parse error.** Reported twice as
  "the calculator still cannot paste". The paste always worked — the characters
  arrived, the field showed them — and then the parser rejected them, which
  reads as a refusal to accept a paste at all. Five separate causes, all
  reachable by copy-paste, which is how a number actually gets into this app:
  typographic operators (`×`, `÷`, U+2212 and the whole dash family — en, em,
  figure, horizontal bar — each reported as "cannot parse"), because nobody
  types `×`; fullwidth characters, which a Chinese IME produces by default and
  which are indistinguishable from ASCII in the input box; superscripts
  (`cm²`, `10⁻³` — rewritten to `cm^2` and `10^-3` deliberately *not* via
  `String.normalize('NFKC')`, which maps `²` to a plain `2` and would turn `2²`
  into twenty-two); and units the converter offers and the calculator could not
  spell, because the identifier rule was ASCII-only and `µg`, `µm`, `Å`, `Ω`,
  `kΩ` were all unreadable in an expression while working perfectly in the
  converter.
  - **`readNumberField` silently truncated.** It asked `looksLikeExpression`
    first and fell back to `Number.parseFloat`, which stops at the first
    non-digit: `1,234.5` pasted out of a spreadsheet became **1**, with no error
    and a field that looked filled in. The evaluator now gets the first say and
    the fallback is a strict numeric-literal test, because `parseFloat('1,00')`
    is 1 and `parseFloat('0x10')` is 0 — a partial parse of something the
    evaluator rejected is the worst failure this app can have.
  - **`1 °C` was accepted as a factor-1 unit.** The refusal tested symbols
    against a table keyed by the ASCII forms (`K`, `C`, `F`, `R`) while the unit
    registry also holds the typographic `°C` and `°F`. A silent wrong answer is
    worse than the parse error it replaced; the test is now by dimension.
  - **`1 deg` and `1 turn` threw a raw TypeError** — `ratio` and `angle` have no
    exponent vector by design, so the first arithmetic on it threw "Cannot read
    properties of undefined", an English message with no error code and
    therefore untranslatable.
  - **`10^-3 M` was rejected** as "an exponent must be a plain number", because
    the exponent parse swallowed the unit — the exact sequence the `10ˣ` keypad
    key was added for.
  - Measured before writing any of it: mathjs rejects all five paste cases too
    and costs 654 KB minified. The problem was never the grammar.
- **The calculator window stuck to the cursor, and could be stranded
  off-screen.** Three defects in the drag, all found by driving a real mouse
  rather than synthetic events. `setPointerCapture` was called on the window
  while the move and up handlers were bound to the title bar; capture retargets
  every subsequent event to the window, so the `pointerup` never reached it,
  `drag.current` was never cleared, and the window kept following the cursor on
  plain hover. Separately, the grab margin was 48px and the title bar's right end
  holds the DEG/RAD toggle and the close button — at the left edge the entire
  visible strip was the close button, on screen, apparently reachable, and
  completely immovable. The margin is now 120px, and the margin test checks it
  against the width of the controls it has to clear rather than asserting the
  number.
- **Every theme draws its own chart colours, not the dark ones.** Every canvas
  chart took a `theme` prop and looked it up in a map with exactly two entries,
  `dark` and `light` — but the prop is the palette *key*, so eight of the ten
  palettes matched neither and fell through to the dark defaults. A chart on
  Catppuccin Latte drew a white grid on a cream card. It went unnoticed because
  the two themes the map happened to contain are the two everyone checks by
  hand. Colours are now derived from the palette's own tokens, so there is no
  list to forget to update. The equivalence marker also stops using the warning
  colour: it is not a warning, it is a second reading of the same quantity, and
  a correct titration that looked like something had gone wrong was the wrong
  signal to send.
- **The empty right column is back, and now has a test.** Moving the split into
  `Card.jsx` reintroduced the defect the container query had been fixed for: the
  results column rendered whenever a tab *had* `Result` elements, and a `Result`
  with no value renders nothing — so ten of the fifteen tabs had a permanently
  empty right half.
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

[0.8.0]: https://github.com/acrot0/lab-calc/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/acrot0/lab-calc/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/acrot0/lab-calc/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/acrot0/lab-calc/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/acrot0/lab-calc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/acrot0/lab-calc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/acrot0/lab-calc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/acrot0/lab-calc/releases/tag/v0.1.0
