# Lab Calc

**A lab solution calculator. 20 calculation tabs, and every calculation is kept — searchable, replayable, exportable.**

Built for everyday preparation and calculation work in chemistry, biology and pharmacy labs. One thing separates it from the alternatives: **the calculation is not thrown away.** Every input and result goes into a local record. The arithmetic is standard textbook formulae that anyone can get right; the record is the part nobody builds.

[**Use it online**](https://acrot0.github.io/lab-calc/) · nothing to install · works offline (PWA) · your data never leaves your device

[中文说明](README.md)

![The weighing tab: the formula NaCl resolves to a molar mass of 58.440 g/mol, and a target of 0.5 mol/L in 500 mL gives 14.61 g to weigh](docs/images/app-weigh.webp)

*No sign-up, no upload. The record of what you did stays in the panel on the right and survives a page reload.*

---

## Contents

- [Scope and model limits](#scope-and-model-limits) — read this first
- [Features](#features)
- [Why this exists](#why-this-exists)
- [How calculations are kept](#how-calculations-are-kept)
- [Where the uncertainty comes from](#where-the-uncertainty-comes-from)
- [Design decisions](#design-decisions)
- [Installation](#installation)
- [Development](#development)
- [Structure](#structure)
- [Credits](#credits)

## Scope and model limits

**This tool is for teaching, demonstration and everyday study. It is not for clinical, diagnostic, production or any regulated use.**

The full notice appears on first launch and can be reopened from the footer at any time. It states the specific model limitations rather than offering a blanket disclaimer.

That is written out not to cover anyone legally, but because a result that *looks* authoritative while assuming ideal solutions gets trusted well past what it deserves.

### What is corrected

Buffer, pH and concentrated-reagent tabs:

| Item | Method | Range |
|---|---|---|
| Activity coefficients | Davies equation `log₁₀γ = −A·z²(√I/(1+√I) − 0.3I)` | I ≤ 0.5 mol/L; flagged beyond |
| Temperature dependence of pKa | van 't Hoff integrated form, ΔH for 11 common buffer systems | 0–50 °C |
| Ionic strength | Counter-ions inferred from electroneutrality, not hard-coded 1:1 | as above |

The ratio-to-pH relationship is no longer plain Henderson–Hasselbalch: the hydrogen ion concentration is solved from the ratio first, then activity-corrected.

**A neutral acid's correction cancels.** γ_H and γ_A are equal, so acetic acid shifts by 0.0008 between I = 0 and I = 0.1. That is correct, not a bug — a calculator that "corrects" acetic acid by 0.05 is teaching the wrong mechanism.

The pH tab shows both numbers side by side: ideal and activity-corrected. The correction needs two inputs a pKa does not carry — the acid's charge z and the background ionic strength I, both defaulting to 0 (where the correction vanishes and the ideal answer is returned). **Only a charged acid moves.** At I = 0.1:

| Acid | z | Ideal | Corrected |
|---|---|---|---|
| Phosphate pKa₂ | −1 | 4.100 | 3.993 |
| Ammonium | +1 | 5.125 | 5.232 |
| Acetic acid | 0 | 2.880 | 2.884 |

The correction peaks near I ≈ 0.5 and falls off; the tab says so beyond that point.

**Measured**: Tris at 4 °C gives 7.37 by the ideal model and 8.08 corrected (pKa rises from 8.06 to 8.69, activity adds 0.08); a phosphate buffer at I = 0.2 shifts by −0.38.

### What is not modelled

No tab handles:

- Dissolved CO₂ (an open alkaline solution absorbs it and the pH drifts)
- Volume contraction on mixing (ethanol/water does not conserve volume)
- Impurities and complexation equilibria (EDTA, citrate and other ligands are not counted)
- Titration curves are approximate near an equivalence point

Tabs that answer with a preparation amount — weighing, dilution — still treat solutions as ideal, because **activity does not change a mass**.

Before any real preparation, **check against a textbook, a pharmacopoeia or the reagent's own specification.**

## Features

20 tabs, each covering one kind of calculation. Tabs with a mode selector (biology, analytical chemistry and others) switch between sub-calculations in place.

| Tab | What it works out |
|---|---|
| **Weighing** | How many grams of solid to weigh for a given concentration and volume |
| **Dilution** | How much stock and how much diluent for a target concentration |
| **Buffer** | Henderson–Hasselbalch: the acid/base ratio at a target pH |
| **Serial dilution** | A dilution series: which tube to take from, how much, how much diluent |
| **pH** | pH of a weak acid or base (pKa presets for common buffer systems, with the acid's charge); ideal and activity-corrected shown side by side |
| **Percent solution** | w/v percent ↔ molarity, with a warning past solubility |
| **Titration curve** | Weak, strong and polyprotic curves solved from charge balance, with every equivalence point marked |
| **Concentrated reagent** | From a stock reagent (37% HCl and the like): percent/density ↔ molarity, normality, molality, ionic strength |
| **Spectrophotometry** | Beer–Lambert both ways plus a standard-curve fit that back-calculates an unknown and checks the linear range |
| **Bench calculations** | Mole↔mass↔volume, plate counts (CFU/mL), nucleic acid concentration and copy number, Master Mix |
| **Colligative** | Boiling point elevation, freezing point depression, osmotic pressure, with the van 't Hoff factor; also molar mass from ΔT |
| **Unit conversion** | Mass, volume and concentration units (a cross-dimension conversion is refused, never silently wrong) |
| **Reaction stoichiometry** | Equation balancing (exact rational null space, not a least-squares fit), limiting reagent, yield, empirical formula |
| **Electrochemistry** | Nernst equation, cell EMF, equilibrium constant |
| **Periodic table** | 118 elements with electron configuration and valence count; coloured by category, block, mass or radius; arrow-key navigation; search by group ("halogens") |
| **Biology** | 8 sub-calculations: nucleic acid quantitation, 260/280 purity, dilution, oligo concentration, cell seeding volume, doubling time, RPM ↔ RCF, enzyme kinetics |
| **Uncertainty** | 3 sub-calculations: uncertainty of a molar mass, propagation, total uncertainty of a weighing preparation. See [below](#where-the-uncertainty-comes-from) |
| **Lab data** | Descriptive statistics on replicates (mean, SD, SEM, RSD, median, range, confidence interval), Grubbs and Dixon outlier tests, t test and F test |
| **Analytical chemistry** | 7 sub-calculations: EDTA complexometric titration, redox titration, gravimetric analysis, recovery and spiking, LOD and LOQ, chromatographic separation, solubility and complexation equilibria |
| **Physical chemistry** | 5 sub-calculations: reaction kinetics, Arrhenius activation energy, conductivity, thermodynamics, phase diagrams and eutectic points |

History exports as **Excel (.xlsx)**, **CSV** (with a BOM so Chinese text survives), **Markdown** (paste straight into a lab notebook), a **PDF report** (browser print, selectable vector text) or a **JSON backup** (re-importable, so a new machine loses nothing).

![The titration curve tab: 25 mL of 0.1 mol/L acetic acid titrated with 0.1 mol/L NaOH, the curve rising sharply at 25 mL with the equivalence point at pH 8.73 and the half-equivalence point at pH ≈ pKa 4.76](docs/images/app-curve.webp)

<details>
<summary>Expand: periodic table and uncertainty propagation</summary>

![The periodic table tab: 118 elements coloured by category, with sodium selected and its detail panel showing a relative atomic mass of 22.99 g/mol, electronegativity 0.93 and melting point 370.95 K](docs/images/app-elements.webp)

![The uncertainty propagation tab: three input quantities combine to give 1461 ± 0.9, a relative uncertainty of 0.0624%](docs/images/app-uncertainty.webp)

</details>

The Excel export puts every input and output in its own column, ready to sort, filter and plot; the PDF report carries field names in the interface language and is shaped to paste into a lab notebook.

### How the titration curve is solved

Not with `[H⁺] ≈ √(Ka·C)` — that assumes the acid barely dissociates, which fails completely near the equivalence point, and that is exactly where the curve matters. Instead the charge balance is solved at every titration volume:

```
[Na⁺] + [H⁺] = [OH⁻] + C_acid · z̄([H⁺])
```

`z̄` is the acid's mean charge, computed from the full distribution over protonation states. A monoprotic acid reduces to the familiar `[A⁻] = C·Ka/(Ka+[H⁺])`.

**Measured**: acetic acid's half-equivalence point is pH 4.76 = pKa; hydrochloric acid's equivalence point is pH 7.00; phosphoric acid's three equivalence points land at 25/50/75 mL, with the three half-equivalence points at pKa₁₂₃.

### Solubility and complexation: why it needs a simultaneous solve

A solubility product on its own does not give you a solubility. Measured: AgCl dissolves to 1.33×10⁻⁵ mol/L in pure water and 0.055 mol/L in 1 mol/L ammonia — **the same Ksp, a factor of 4000 apart.** The diamminesilver complex holds free Ag⁺ down at 5.4×10⁻⁹ mol/L, so the solid must keep dissolving to maintain the ion product.

CaCO₃ is a different coupling: the anion is itself a base. At pH 7 the carbonate is almost entirely HCO₃⁻, which does not appear in the Ksp expression, so the real solubility is 51× √Ksp.

There is no closed form, so the tab solves the equations directly: mass action for every species, mass balance for every component, the solubility product for every solid, all by Newton–Raphson. The unknowns are `pX = −log₁₀[X]` rather than concentrations — speciation spans seven orders of magnitude, so iterating on concentrations puts seven orders of magnitude between Jacobian columns and the linear solve rounds the small ones away.

The four built-in systems (AgCl/water, AgCl/ammonia, CaCO₃/water, Cu²⁺–NH₃ stepwise complexation) use 25 °C, I → 0 thermodynamic constants with their sources cited — the speciation is only as reliable as the constants, and a user who cannot check the inputs cannot check the result.

**Known limits**: there is no activity model (so the constants must be thermodynamic; feeding it conditional constants counts ionic strength twice), and metal hydrolysis, mixed ligands and ion pairs outside the list are not modelled. Every one of those makes the model **over**estimate solubility — the direction is "predicts more dissolving than actually happens", not the reverse.

### Diagrams after a calculation

Six tabs can expand a figure once a result exists. Those six and not others, judged by **whether the figure can change the conclusion** rather than by whether it looks good:

| Figure | Tab | What the figure says that the number cannot |
|---|---|---|
| Titration curve | Titration curve | How steep it is near the equivalence point — where the buffer capacity runs out |
| Standard curve + residuals | Spectrophotometry | Whether the fit actually describes the data or merely passes through a few points |
| Enzyme kinetics | Biology | Whether the substrate range spans Km. A fit whose five points all sit below Km has confident-looking parameters and no information about Vmax |
| Species distribution | pH | Where `[H⁺] ≈ √(Ka·C)` stops holding: once the acid form drops below 1% it is already wrong |
| Nernst line | Electrochemistry | How much further the reaction quotient can move before equilibrium. The slope is RT·ln10/nF, so changing the temperature or n visibly rotates the line about lg Q = 0 |
| Yield vs. charge | Reaction stoichiometry | Whether adding more of a reactant helps. The answer is that the line flattens at the stoichiometric ratio — excess stops paying, and that is invisible in a single result line |

**The Nernst line spans one order of magnitude either side of the working point**, never stretched to reach E = 0. The first version stretched it, on the reasoning that the crossing point is the interesting part — which is false for most cells: lg K = nE°/0.05916, so a Daniell cell (E° = 1.1 V, n = 2) reaches equilibrium at lg Q ≈ 37, and drawing 38 orders of magnitude squashes the line into a crack with 95% of the canvas empty. So the crossing is drawn only when it falls inside the window; otherwise the caption says "this cell is too far from equilibrium (lg K = …)". **The marker appearing is itself the statement "you are within an order of magnitude of equilibrium"** — a property of the cell, not an accident of the axis.

### The bench procedure flow

The four preparation tabs (weighing, dilution, buffer, serial dilution) can expand a flow diagram once a result exists: one box per step, joined by arrows, running downward.

The steps already existed as text — a numbered list in the Markdown export and the printed report. What the diagram adds is what a list cannot say: **step 2 depends on step 1, and the order does not commute.** Preparing a solution is a thing you get wrong once and start over, and a row of parallel-looking numbers does not convey that.

The stripe down each box's leading edge marks the kind of action (measure, transfer, adjust), so the weighing step is findable at a glance without reading all of them. The figure exports as a standalone SVG with its colours inlined, independent of this app.

## Why this exists

Solution calculators are everywhere, and they share one property: **the calculation is gone the moment it is done.**

A week later, wanting to know how that buffer was made, you dig through a paper notebook, scroll a chat log, or recompute it — and recomputing means re-entering every parameter and hoping you remembered the concentration right.

An electronic lab notebook (ELN) solves it, but it is heavy: create a project, pick a template, fill in a form. That is too much to pay for two lines of arithmetic.

**The layer in between is empty: a calculator that keeps what it calculated.**

That is the whole of this project's differentiation. The arithmetic is standard textbook formulae anyone can get right; **keeping the record** is the part nobody builds.

## How calculations are kept

| Capability | How |
|---|---|
| Automatic | Every calculation writes a record (`kind` / `inputs` / `outputs`) with no extra action |
| Search | By formula or by value |
| Replay | Restores the parameters and jumps to the tab that owns them |
| Batch scaling | Recomputes a saved preparation at a factor into a **new** record, leaving the original untouched — a 500 mL recipe at 2×, say |
| Deletion | A `deletedAt` tombstone plus a trash section and an immediate undo bar, rather than erasing |
| Groups and notes | Records can be grouped and annotated |
| Export | Excel / CSV / Markdown / PDF / JSON |

**Where it lives**: the browser's `localStorage`, with nothing uploaded. When storage is unavailable (Safari private mode, a full quota) it degrades to memory: the calculations still work, only the history is lost.

## Where the uncertainty comes from

This is what separates the tool from a general-purpose uncertainty calculator.

A general uncertainty calculator asks the user to **supply** the uncertainty of every quantity — which means the user must already know part of the answer. Lab Calc inverts that: the user enters experimental parameters (concentration, volume, flask grade) and the uncertainty is derived from built-in domain data.

| | General uncertainty calculator | Lab Calc |
|---|---|---|
| Input | The user supplies each quantity's uncertainty | The user supplies experimental parameters |
| Where uncertainty comes from | The user must **already know** | Built-in glassware tolerances and balance terms |
| Output | One combined value | A ± plus the contribution breakdown by source |
| Domain knowledge | None (a general expression) | Knows how much better a Class A flask is than Class B |

The built-in data:

| Item | Source |
|---|---|
| Volumetric flask (Class A) | ISO 1042 / ASTM E288 |
| One-mark transfer pipette (Class A) | ISO 648 / ASTM E969 |
| Balance (weighing term) | Eurachem QUAM:2012 §8.1.4 |

Tolerances convert to standard uncertainty through the **rectangular distribution** (ASTM E288 §1.1.3), which is the conservative direction: a rectangular assumption gives a larger standard uncertainty than a normal one.

Seven tabs report a result with a ± and the contribution breakdown: weighing, dilution, percent solution, concentrated reagent, spectrophotometry, titration curve and biology.

## Design decisions

**An unknown element is an error, not a silent skip.** `Xx2O` raises rather than reading as 2 oxygens. Skipping silently yields a molar mass that looks right and is not, with nothing for the user to notice.

**Impossible operations are refused.** A target concentration above the stock makes the dilution calculation raise — that is something dilution cannot do. Returning a number would have someone prepare a wrong solution from it. Likewise a mass-to-volume unit conversion raises: `1 g → mL` needs a density the conversion function cannot know, and since both factors are 1, dividing straight through would return the input unchanged.

**There is no "close enough" in a formula.** `Na0Cl` (subscript 0), `Ca()2` (empty parentheses), `H2O·5` (a hydrate dot with nothing after it) and `NaCl.` (trailing dot) all used to pass silently: a zero subscript means the atom is absent and the mass came out as pure chlorine, the empty group was filtered away, and `NaCl.` read as `NaCl`. Each returned a number that looked normal, so each became an error naming the specific reason.

**Isotopes and organic shorthand are read as chemistry, not literally.** `D2O` is heavy water (20.027), not water (18.015); `DMSO-d6`'s `-d6` replaces six hydrogens with deuterium, making it C₂D₆OS. Shorthand like `Me`/`Ph`/`Boc`/`TBS` expands. But `Pr`, `Ac`, `Ar`, `Ts` and `Am` are **deliberately not expanded** — they are also the symbols for praseodymium, actinium, argon, tennessine and americium, and reading `Pr2O3` as propyl would silently change the meaning of a formula that was already correct. The element reading wins.

**Element categories are explicit data, not derived from grid position.** Deriving a category from group and period looks tidy and is wrong: carbon, nitrogen, oxygen, phosphorus and sulfur share groups 14–16 with tin and lead, and a positional rule files them as post-transition metals; astatine in group 17 would be filed as a halogen. The metal/non-metal boundary is a **staircase running diagonally** across those columns, and no row/column rule catches it — 13 of 118 were wrong. The categories are now an explicit membership table, and `categoryOf` throws on an unclassified element rather than defaulting: a "reasonable-looking" default is exactly how those 13 wrong labels shipped, with nothing failing and the table simply stating something untrue.

**Buffer range is flagged.** Henderson–Hasselbalch happily computes a pH for a 1000:1 ratio, but that buffer has essentially no capacity. The arithmetic is fine and the buffer is useless — so it warns.

**The headline result is not monospaced.** Tried and dropped: in a monospace face the decimal point is a faint dot and `14.61` reads as `14 61`. Misreading a decimal point in a lab is a substantive problem, not an aesthetic one. It uses Inter's tabular figures instead, which align in columns while keeping the point legible.

**Anything without a lower bound uses `fmtSci`.** `fmt` keeps a fixed number of decimals, which is right for bounded quantities (molar mass, radius, percentage, temperature, R²). But **mass, amount of substance and concentration have no lower bound** — 1 mL of a 1 µM solution needs 5.844×10⁻⁸ g, which `fmt` renders as `0`, and `0` reads as "nothing" rather than "very little". So the two classes are separated: unbounded values go through `fmtSci` (switching to mantissa×10ⁿ outside 1e-3 to 1e5), bounded ones stay on `fmt`. `fmtSci` agrees with `fmt` on ordinary values, so the substitution is invisible except where it was wrong before. `test/ui-strings.test.mjs` scans for the pattern; where one field name is bounded in one place and unbounded in another, the call site carries a `Bounded:` comment recording the judgement rather than the scan being loosened.

## Installation

One codebase, four ways to get it. All fully offline, none uploading anything.

| Form | Size | How | Best for |
|---|---|---|---|
| **Web / PWA** | 0 (browser cache) | Open <https://acrot0.github.io/lab-calc/> and choose "Install app" / "Add to Home Screen" | Least effort. Phone, tablet or desktop, and it works offline once installed |
| **Android APK** | 3.6 MiB | Download `lab-calc-<version>.apk` from [Releases](https://github.com/acrot0/lab-calc/releases/latest) and tap to install | Handing it to someone, or a browser with no "Add to Home Screen" |
| **Windows installer (Tauri)** | 3.4 MiB | Download `Lab.Calc_<version>_x64-setup.exe` | **Recommended.** Small, low memory, uses the system WebView2 (present on Windows 11) |
| **Windows portable (Electron)** | 122 MiB | Download `labcalc-v<version>-win-x64.zip`, unzip and run `LabCalc.exe` | Fully self-contained: ships its own browser engine, depends on no system component |

All four ship as release assets alongside the tag, and `scripts/check-release-assets.mjs` compares this table against the actual attachments **before** publishing — a missing one fails the release. The table delivered a quarter of what it promised in both v0.9.1 and v0.9.2, and went unnoticed only because nobody clicked the link.

The Electron and Tauri builds are two packaging routes for one application, not two feature sets. The first carries a browser engine with it (hence the size, but identical on any Windows); the second uses the WebView2 already on the machine (hence the size, but it depends on that component being present). **Use Tauri by default; use Electron on a machine where WebView2 is missing or broken.**

The size column is measured, not estimated (in MiB; 1 MiB = 1.048576 MB): the APK and Electron figures come from `scripts/package-*.mjs` output on each build, the installer's from `gh release view` byte counts. Writing "about 5 MB" looks safer, but that "about" slowly covers for a number that has stopped being true.

**The Android build is signed with a real key**, certificate `CN=acrot0`, RSA 4096, valid to 2056. Fingerprints:

```
SHA-256  62:10:CE:17:86:74:A0:85:1D:77:5D:EB:42:88:1A:37:BE:20:78:B9:37:60:C2:5E:BF:9B:5E:F5:92:7C:CD:08
SHA-1    B8:2E:6B:A6:7F:FB:8D:34:31:37:FE:50:C3:AD:26:F3:69:C0:DB:D1
```

This is the identity of the published package, not a statement of format: whoever holds the key can publish an update that every installed copy accepts as genuine, and Android has no revocation mechanism. The keystore and passphrase stay out of the repository (see [docs/RELEASE.md](docs/RELEASE.md)) and are backed up elsewhere. To check whether an APK came from this project, compare the fingerprints above against `apksigner verify --print-certs` — matching means the same signature, and a mismatch means no source should install it.

On a phone the calculator is a bottom sheet, with touch targets ≥44px, and the sheet lifts out of the way when the soft keyboard appears; in landscape it becomes two columns with the keypad on the right and the inputs and readout on the left.

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # build to dist/, plain static files, hostable anywhere
npm test         # 2514 tests
npm run verify   # import integrity + icon metrics + licences + authorship + 20 smoke checks against known answers
```

| | |
|---|---|
| **Platforms** | Web (PWA) · Windows desktop (Tauri / Electron) · Android |
| **Languages** | 中文 / English |
| **Themes** | 10 (Catppuccin, Rosé Pine, Gruvbox, Solarized) + follow-system + custom accent, radius, density and motion |
| **Export** | Excel (.xlsx) · CSV · Markdown · PDF report · JSON backup (re-importable) |
| **Licence** | MIT |
| **Status** | v1.1.0 · 2514 tests passing / 124 files · all three platforms green in CI |

## Structure

```
src/
├── calc/              pure calculation functions, no side effects, no i18n
│   ├── solution.mjs     molar mass, weighing, dilution
│   ├── shorthand.mjs    isotope (D/T) and organic shorthand (Me/Ph/Boc…) expansion
│   ├── buffer.mjs       buffers, serial dilution, unit conversion
│   ├── titration.mjs    pH, equivalence points, percentage
│   ├── curve.mjs        titration curves (mono-, strong, polyprotic)
│   ├── reagent.mjs      concentrated reagents, normality, ionic strength, Beer–Lambert, standard curves
│   ├── colligative.mjs  boiling point elevation, freezing point depression, osmotic pressure
│   ├── lab.mjs          mole conversion, plate counts, nucleic acids, Master Mix
│   ├── reaction.mjs     equation balancing, limiting reagent, empirical formula
│   ├── electro.mjs      Nernst equation, cell EMF
│   ├── elements.mjs     118 elements + category/block/period assignment
│   ├── config.mjs       electron configuration (20 Madelung exceptions as explicit data)
│   ├── instruments.mjs  glassware tolerances and balance terms (ISO/ASTM/Eurachem)
│   ├── uncertainty.mjs  uncertainty propagation and combination
│   └── errors.mjs       error codes (the calc layer emits no user-visible prose)
└── ui/
    ├── App.jsx           application shell
    ├── LocaleContext.jsx language context
    ├── ThemeContext.jsx  theme context and switcher
    ├── i18n.mjs          translation layer
    ├── theme.mjs         theme resolution (dark/light/follow-system)
    ├── format.mjs        number display (fmt fixed decimals / fmtSci across magnitudes)
    ├── errors.mjs        error code → text in the current language
    ├── disclaimer.mjs    educational-use notice (content + acknowledgement state)
    ├── locales/          zh.mjs / en.mjs
    ├── summaries.mjs     history summaries (derived at render, not persisted)
    ├── history.mjs       history records (storage injected)
    ├── procedure.mjs     preparation steps (recipe cards, shared by export and the flow diagram)
    ├── procedure-flow.mjs flow diagram geometry (pure functions, no DOM)
    ├── scale-inputs.mjs  batch-scaling arithmetic and the conservation rules
    ├── export.mjs        Excel / CSV / Markdown / PDF export
    ├── xlsx.mjs          hand-written .xlsx generator (no dependencies)
    ├── palettes.mjs      10 theme palettes (Catppuccin / Rosé Pine / Gruvbox / Solarized)
    ├── styles.css        design tokens and component styles
    ├── tabs/             20 calculation tabs
    └── components/       form primitives, history panel, notice modal, SVG illustrations
```

Three deliberate separations:

**The calc layer emits no user-visible prose.** It throws `CalcError{code, params}` and the UI translates. Otherwise the error text stays Chinese after a switch to English, and calc-layer tests end up asserting prose that belongs to the presentation layer.

**Summaries are not persisted.** A record stores only `kind/inputs/outputs`; the summary is derived at render. So switching language **re-translates the existing history** — persisting it would leave old entries frozen in whatever language they were made in.

**`history.mjs` takes an injected storage object** rather than reaching for `localStorage`, so the history logic is fully testable in Node.

## Credits

| Purpose | Source | Licence |
|---|---|---|
| Interface icons | [Phosphor Icons](https://phosphoricons.com) | MIT |
| Typeface | [Inter](https://rsms.me/inter/) | OFL-1.1 |
| Application icon | Generated programmatically by `scripts/make-icons.mjs` | MIT |

All are usable commercially. The application icon is drawn by a script (`npm run icons`) rather than depending on external image assets, so its colours match the interface CSS variables exactly and it is reproducible text rather than an opaque binary.

## Licence

MIT
