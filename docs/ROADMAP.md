# Roadmap

Where this project is going, and why in this order. Written down because the
sequencing has dependencies that are not obvious from the feature list.

## Where it stands (v0.8.0)

16 calculation tabs, a 118-element periodic table with exam properties, six
charts drawn from the calculations themselves, bilingual UI, six themes plus
follow-the-system, PWA-installable, offline-capable, and a portable Windows
build. 1,281 tests. 592 KB of JS (185 KB gzipped), no charting dependency — the
charts are hand-drawn canvas, and the .xlsx writer is hand-written too.

The calculator panel works on a phone: 44px touch targets, a bottom sheet that
lifts clear of the software keyboard, and a two-column layout when the phone is
held sideways.

**Live: <https://acrot0.github.io/lab-calc/>**

## Principles that constrain everything below

1. **Correctness is the product.** A chemistry calculator that is wrong once is
   not used twice. Every new number needs a source and a test.
2. **Rich graphics must not cost smoothness.** These are not in tension once the
   method is right: hand-drawn SVG for geometry, CSS transform and the Web
   Animations API for motion (GPU-composited, never triggering layout), and
   `IntersectionObserver` so an off-screen chart costs nothing. A charting
   library would solve the first problem by creating the second.
3. **Colour is chosen by evidence, not taste.** Categorical data uses a
   colourblind-safe palette; continuous data uses a perceptually uniform one.
   Rainbow ramps are rejected — they invent structure that is not in the data.
4. **Only licence-compatible third-party code.** MIT / Apache-2.0 / BSD / CC0 /
   public domain. GPL, AGPL and CC BY-SA are refused, because their terms are
   incompatible with the MIT licence this ships under. Enforced by
   `scripts/check-licences.mjs`, not by memory.

## Phases

Ordered by dependency. Each phase ships on its own and leaves the app working.

### Phase 1 — Foundations

The shared pieces every later phase draws on. Doing these first is what keeps
the visualisation work from turning into four incompatible one-offs.

- `src/ui/palette.mjs` — the Okabe-Ito categorical palette and the viridis
  sequential ramp, with contrast and colour-vision checks as tests.
- `scripts/check-licences.mjs` — the licence gate. Refuses a dependency whose
  licence is not on the allow-list.
- Icon library evaluation and migration, with the icon set the app actually
  needs rather than the one the library happens to ship.

### Phase 2 — Explanation (why the formula is what it is)

Each calculation tab gains a diagram of the quantity it computes: what a
titration curve's shape comes from, why a buffer resists pH change, what
molarity means geometrically. These are the teaching layer, and the other
visualisations read better once they exist.

### Phase 3 — Computation visualisation

Every calculation tab plots its own result: buffer capacity against pH, serial
dilution decay, standard-curve fit with residuals, Nernst potential against
concentration. Extends what the titration curve already does.

### Phase 0 — Visual overhaul — done (2026-09-25)

Driven by feedback that the interface was plain, the icons coarse, the motion
poor and the export thin. What it settled:

- **Six palettes, read from the upstream packages.** Catppuccin (Latte, Mocha)
  and Rosé Pine (main, Dawn) are imported from `@catppuccin/palette` and
  `@rose-pine/palette` rather than transcribed, so an upstream revision flows
  through. **Nord was rejected** — its npm package is
  `(Apache-2.0 AND CC-BY-SA-4.0)` and share-alike is incompatible with MIT.
  **Tokyo Night was rejected** — no authoritative package exists, only
  third-party ports, and inventing hex values to label "Tokyo Night" is the
  thing the approach exists to avoid.
- **These are editor themes and this is not an editor.** 15 of the measured
  text/background pairings failed 4.5:1 on first run, including one in the
  *shipped dark theme* (`--text-dim` at 4.34:1 on `--surface-3`). Each was
  fixed by moving one token while holding its hue.
- **Phosphor icons**, imported by subpath — the package barrel pulls all 3,024
  icons and costs 115 KB that tree-shaking cannot remove.
- **A motion layer with one rule**: animate a change of state, never an
  arrival.
- **A hand-written .xlsx writer** instead of `exceljs` (925 KB, nine
  transitive dependencies) and **print-to-PDF** instead of jsPDF (which would
  need an embedded CJK font several hundred KB more).

Two defects found by measuring rather than looking:

- The app icon's plate was `#0f1115` while the app's own background is
  `#0b0d12` — the icon sat one shade off from the app it opens.
- **At 390px the header was unusable.** The brand was squeezed to 17px and its
  subtitle rendered one character per line in a 417px-tall strip. No media
  query touched `.topbar`. This was live in production.

### Phase 4 — Periodic trends — done

The heat-map colouring extends to every numeric property, and a comparison
view takes two to four elements.

What the phase settled, in case a later change is tempted to undo it:

- **Scale is chosen per property, not per chart.** Electronegativity spans a
  factor of 5.7 and stays linear; density spans 251,000 and goes logarithmic.
  `LOG_THRESHOLD` in `src/ui/heat.mjs` is the switch, and it is pinned by a
  test so that changing it forces a re-check of every property.
- **A missing measurement is a gap, not a low value.** 22 elements have no
  density in the source data. Drawing them at the bottom of the ramp asserts a
  value nobody measured, so they render as an unfilled cell, and the legend
  says how many of the 118 the scale actually covers.
- **The radar normalises every axis to its own range**, which is the only way
  to put a radius and a density on one diagram — and is also its limitation. A
  factor of two looks the same on both axes. That is why the value table sits
  directly beneath the chart: the shape is the overview, the table is the
  measurement.
- **The outline stays open where the data does.** Helium has no
  electronegativity, so its polygon is drawn as an open path rather than
  closed through the centre. Filling it would fabricate an area.
- **Series colour is per theme.** Okabe-Ito is designed for a dark surface; on
  white its yellow falls to 1.32:1. The light set is the palette's own
  recommended substitution, and a test holds every colour above 4.5:1.

### Phase 5 — Exportable procedure diagrams

The bench procedure drawn as a flow: take this much, add that much, make up to
volume. Exportable as SVG so it can be pasted into a lab notebook.

### Phase 6 — New capability

- **Chemistry depth** (exam-relevant): full Debye-Hückel, complexation
  equilibria, Ksp and solubility, redox balancing, formation constants.
- **Data analysis** (research-relevant): regression report, error propagation,
  significant figures, repeated-measurement statistics.
- **Lab management**: procedure templates, reagent inventory, instrument
  calibration records.
- **Experience**: unit-system switching, keyboard shortcuts, bulk calculation.

### Phase 7 — Data portability

Export and import the calculation history as a versioned JSON file. No backend:
the user moves the file however they like. The format carries a schema version
from the first release so a future sync feature has something to migrate from.

### Phase 8 — Research documentation

`docs/research-value.zh.md` — what problem the tool solves for research, the
algorithm and its literature source for each calculation, how the results were
verified, where the models stop being valid, and how it compares with the
commercial tools. Written for a reader deciding whether to trust it.

## Out of scope

- **A backend or accounts.** The export/import path covers the real need
  (moving data between machines) without taking on custody of anyone's data.
- **Anything that needs a server to work.** The app must keep functioning with
  no network, because a lab bench is a bad place for wifi.
- **Fabricated data.** Where a value is unknown it renders as unknown. A
  plausible-looking placeholder is worse than a gap.
