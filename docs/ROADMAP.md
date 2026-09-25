# Roadmap

Where this project is going, and why in this order. Written down because the
sequencing has dependencies that are not obvious from the feature list.

## Where it stands (v0.5.0)

15 calculation tabs, a 118-element periodic table with exam properties, an
interactive titration curve, bilingual UI, PWA-installable, offline-capable,
and a portable Windows build. 565 tests. 407 KB of JS (129 KB gzipped), no
charting dependency — the titration curve is hand-drawn SVG.

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

### Phase 4 — Periodic trends

The heat-map colouring already in the table extends to every numeric property,
plus a comparison view (radar or parallel coordinates) for two or more elements.

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
