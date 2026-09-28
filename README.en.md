# Lab Calc

**A lab solution calculator. 20 calculation tabs, and every calculation is kept.**

Built for everyday preparation and calculation work in chemistry, biology and
pharmacy labs. One thing separates it from the alternatives: **the calculation
is not thrown away.** Every input and result goes into a local record you can
search, replay and export.

[**Use it online**](https://acrot0.github.io/lab-calc/) · nothing to install · works offline (PWA) · your data never leaves your device

[中文说明](README.md) · [Releases](https://github.com/acrot0/lab-calc/releases/latest)

![The weighing tab: the formula NaCl resolves to a molar mass of 58.440 g/mol, and a target of 0.5 mol/L in 500 mL gives 14.61 g to weigh](docs/images/app-weigh.webp)

*No sign-up, no upload. The record of what you did stays in the panel on the right and survives a page reload.*

| | |
|---|---|
| **Platforms** | Web (PWA) · Windows desktop (Tauri) · Android |
| **Languages** | 中文 / English |
| **Themes** | 10 (Catppuccin, Rosé Pine, Gruvbox, Solarized) + follow-system + custom accent, radius, density and motion |
| **Export** | Excel (.xlsx) · CSV · Markdown · PDF report · JSON backup (re-importable) |
| **Licence** | MIT |
| **Status** | v1.0.0 · 2499 tests passing / 124 files · all three platforms green in CI |

```bash
npm install
npm run dev      # dev server
npm run build    # build to dist/, plain static files, hostable anywhere
npm test         # 2499 tests
npm run verify   # import integrity + icon metrics + licences + authorship + 20 smoke checks against known answers
```

---

## ⚠️ For teaching and learning only

**This tool is for teaching, demonstration and everyday study. It is not for
clinical, diagnostic, production or any regulated use.**

The full notice appears on first launch and can be reopened from the footer at
any time. It states the specific model limitations rather than offering a
blanket disclaimer.

That is written out not to cover anyone legally, but because a result that
*looks* authoritative while assuming ideal solutions gets trusted well past
what it deserves.

## What is corrected, and what is not modelled

The distinction matters: describing something that *is* corrected as
"ignored" is also untrue, and it teaches a user to distrust a number that is
actually better.

**Corrected** (buffer, pH and concentrated-reagent tabs):

| Item | Method | Range |
|---|---|---|
| Activity coefficients | Davies equation `log₁₀γ = −A·z²(√I/(1+√I) − 0.3I)` | I ≤ 0.5 mol/L; flagged beyond |
| Temperature effect on pKa | van 't Hoff integral, ΔH for 11 common buffer systems | 0–50 °C |
| Ionic strength | Counter-ions inferred from electroneutrality, not assumed 1:1 | as above |

The ratio-to-pH relationship is no longer plain Henderson–Hasselbalch: the
hydrogen ion concentration is solved from the ratio first, then activity
corrections are applied. For a neutral acid (acetic) the correction **cancels**
— γ_H and γ_A are equal, and the pH shift is 0.0008 across I from 0 to 0.1.
That is correct rather than a bug: a calculator that "corrected" acetic acid by
0.05 would be teaching the wrong mechanism.

The pH tab shows both numbers side by side, ideal and activity-corrected. The
correction needs two inputs a pKa does not carry — the acid's charge z and the
background ionic strength I, both defaulting to 0, at which the correction is
identically zero. **Only a charged acid moves**: at I = 0.1, phosphate pKa₂
(z = −1) goes 4.100 → 3.993, ammonium (z = +1) 5.125 → 5.232, acetic (z = 0)
2.880 → 2.884. The shift peaks near I ≈ 0.5 and falls off past it, where the
interface marks the value as unreliable.

**Not modelled** (all tabs):

- CO₂ dissolution — an open basic solution absorbs CO₂ and the pH drifts
- Solvent volume contraction — ethanol/water mixtures do not conserve volume
- Impurity and complexation equilibria — EDTA, citrate and other ligands are
  not included in the general case
- Tabs that answer "how much do I weigh out" still treat the solution as ideal;
  activity does not change how many grams you need
- Titration curves are approximate near the equivalence point

**Measured**: Tris at 4 °C — the ideal calculation gives 7.37, corrected 8.08
(pKa moves 8.06 → 8.69, activity another 0.08); phosphate buffer at I = 0.2
shifts pH by −0.38.

**Check any result against a textbook, a pharmacopoeia or the reagent's own
datasheet before you prepare anything.**

## Why this exists

Solution calculators are everywhere and they share one property: **the
calculation is gone the moment it is done.**

A week later you want to know how you made that buffer, and your options are a
paper notebook, a chat history, or doing the arithmetic again — which means
re-entering every parameter and hoping you remembered the concentration.

Electronic lab notebooks solve this, but they are heavy: create a project,
choose a template, fill in a form. That is too much ceremony for two lines of
arithmetic.

**The middle is empty: a calculator that quietly keeps what you did.**

That is the whole of this project's differentiation. The arithmetic is standard
textbook formula that anyone can get right. **Keeping it** is the part nobody
builds.

## Features

| Tab | What it computes |
|---|---|
| **Weighing** | How many grams of solid for a given concentration and volume |
| **Dilution** | How much stock and how much diluent for a target concentration |
| **Buffer** | Henderson–Hasselbalch: the acid/base ratio at a target pH |
| **Serial dilution** | Step-by-step series: which tube, how much, how much diluent |
| **pH** | Weak acid/base pH with pKa presets and acid charge; ideal and activity-corrected side by side; expandable speciation curves |
| **Percent solutions** | w/v percent ↔ molarity, with a warning past solubility |
| **Titration curve** | Weak, strong and polyprotic acid curves solved from charge balance, with every equivalence point marked |
| **Concentrated reagents** | From 37% HCl and the like: percent/density ↔ molarity, normality, molality, ionic strength |
| **Spectrophotometry** | Beer–Lambert both ways plus a standard-curve fit, with a linearity-range check |
| **Bench calculations** | Mole ↔ mass ↔ volume, CFU/mL plate counts, nucleic acid concentration and copy number, master mix |
| **Colligative properties** | Boiling point elevation, freezing point depression, osmotic pressure with the van 't Hoff factor; molar mass from ΔT |
| **Stoichiometry** | Equation balancing by exact rational null space (not least-squares), limiting reagent, yield, empirical formula; expandable yield-versus-charge curve |
| **Electrochemistry** | Nernst equation, cell EMF, equilibrium constant; expandable E–lg Q line showing how far the cell is from equilibrium |
| **Periodic table** | 118 elements with electron configuration and valence count; coloured by category, block, mass or radius; keyboard navigation; search by group name |
| **Solubility and complexation** | Coupled Ksp and stepwise complexation (inside the analytical tab): AgCl in ammonia, CaCO₃ with anion hydrolysis, the tetraamminecopper(II) system — with full speciation |
| **Unit conversion** | Mass, volume and concentration units, refusing cross-dimension conversions rather than silently returning a wrong number |

The history exports as **Excel (.xlsx)**, **CSV** (with a BOM so Excel reads
the Chinese correctly), **Markdown** (paste straight into a lab notebook),
**PDF** (the browser's print dialog, so the text stays vector and searchable)
or a **JSON backup** that can be re-imported on another machine.

Markdown exports carry a provenance table — software version, export time,
record count, data format version — and, for the four genuinely procedural
calculations, a **recipe card**: weigh this much, transfer to a flask this size,
make up to the mark. Every result can also be saved as a **share image**.

![The titration curve tab: 25 mL of 0.1 mol/L acetic acid titrated with 0.1 mol/L NaOH, the curve rising steeply at 25 mL with the equivalence point at pH 8.73 and the half-equivalence point at pH ≈ pKa 4.76](docs/images/app-curve.webp)

<details>
<summary>More screenshots: periodic table and uncertainty propagation</summary>

![The periodic table tab: 118 elements coloured by category, with sodium selected showing a relative atomic mass of 22.99 g/mol, electronegativity 0.93 and a melting point of 370.95 K](docs/images/app-elements.webp)

![The uncertainty propagation tab: three inputs combining to 1461 ± 0.9, a relative uncertainty of 0.0624%](docs/images/app-uncertainty.webp)

</details>

## How the titration curve is solved

Not with `[H⁺] ≈ √(Ka·C)`. That approximation assumes the acid is barely
dissociated, which fails completely near the equivalence point — the exact
region the curve exists to show. Instead the charge balance is solved at each
titrant volume:

*(the derivation is in the Chinese README and in `src/calc/curve.mjs`)*

## Design decisions

**An unknown element is an error, not a silent skip.** `Xx2O` fails rather than
being read as two oxygens. Skipping gives a molar mass that looks right and is
not, with nothing to tell the user.

**Impossible operations are refused.** Diluting to a concentration above the
stock is an error, because dilution cannot do it and returning a number would
have someone prepare a solution that cannot work. Converting a mass unit to a
volume unit is likewise an error: `1 g → mL` needs a density the converter does
not have, and both factors are 1, so dividing returns the input unchanged.

**No "close enough" in a formula.** `Na0Cl` (subscript zero), `Ca()2` (empty
parentheses), `H2O·5` (a hydrate dot with nothing after it) and `NaCl.` (a
trailing dot) all used to parse silently: subscript zero means the atom is
absent so the mass came out as pure chlorine, empty segments were filtered out,
and the trailing dot read as plain `NaCl`. Every one of them returned a
plausible number, so every one is now an error with the specific reason.

**Isotopes and organic abbreviations are read as chemistry, not literally.**
`D2O` is heavy water (20.027), not water (18.015). The `-d6` in `DMSO-d6` means
six hydrogens replaced by deuterium, so it is C₂D₆OS. Organic shorthand —
`Me`, `Ph`, `Boc`, `TBS` — is expanded. But `Pr`, `Ac`, `Ar`, `Ts` and `Am` are
**deliberately not expanded**: they are also the symbols for praseodymium,
actinium, argon, tennessine and americium, and reading `Pr2O3` as propyl would
silently change the meaning of a formula that was already correct. The element
reading wins.

**Element categories are explicit data, not derived from grid position.**
Deriving them from group and period looks tidy and is wrong: carbon, nitrogen,
oxygen, phosphorus and sulfur share groups 14–16 with tin and lead and would be
classified as post-transition metals, and astatine sits in group 17 and would
be called a halogen. The metal/non-metal boundary is a **staircase** cutting
diagonally across those columns, which no row-and-column rule can capture —
measured, 13 of 118 were wrong. Categories are now an explicit membership
table, and `categoryOf` throws on an unclassified element rather than returning
a default: a plausible-looking default is exactly how those 13 shipped, with
nothing failing and the table simply stating something false.

**Buffer range is flagged.** Henderson–Hasselbalch happily computes a pH for a
1000:1 ratio, but that buffer has essentially no capacity. The arithmetic is
right and the buffer is useless, so it warns.

**The headline result is not monospaced.** It was tried and abandoned: in a
monospace face the decimal point is a very faint dot and `14.61` reads as
`14 61`. Misreading a decimal point at the bench is a real problem, not an
aesthetic one. Inter's tabular figures align the columns and keep the point
legible.

## Data

- Atomic masses: IUPAC 2021 standard atomic weights
- All calculations are pure functions (`src/calc/`), no I/O, independently testable
- History is stored in `localStorage` — **nothing is uploaded**

When storage is unavailable (Safari private mode, quota exhausted) it degrades
to in-memory: the calculations keep working and only the history is lost.

## Installation

One codebase, four ways to get it. All fully offline, none of them upload
anything.

| Form | Size | How | Best for |
|---|---|---|---|
| **Web / PWA** | 0 (browser cache) | Open <https://acrot0.github.io/lab-calc/>, then "Install app" / "Add to home screen" | Easiest. Installs on phone, tablet or desktop, and works offline afterwards |
| **Android APK** | 3.6 MB | Download `lab-calc-<version>.apk` from [Releases](https://github.com/acrot0/lab-calc/releases/latest) and open it on the phone | Sending it to someone else, or a browser with no install option |
| **Windows installer (Tauri)** | 3.4 MB | Download `Lab.Calc_<version>_x64-setup.exe` | **Recommended.** Small, low memory, uses the system WebView2 (present on Windows 11) |
| **Windows portable (Electron)** | 125 MB | Download `labcalc-v<version>-win-x64.zip` and run `LabCalc.exe` | Fully self-contained: bundles the browser engine, depends on nothing |

All four ship as release assets, and `scripts/check-release-assets.mjs`
compares this table against the actual attachments **before** publishing —
a missing one fails the check.

The Electron and Tauri builds are two packaging paths for one application, not
two feature sets. Electron bundles the browser engine (hence large, but
identical on every Windows machine); Tauri uses the WebView2 already on the
system (hence small, but dependent on that component being present). **Default
to Tauri; use Electron where WebView2 is missing or broken.**

The sizes are measured, not estimated: the APK and Electron figures come from
each build's own output in `scripts/package-*.mjs`, the installer from
`gh release view` byte counts.

**The Android build is signed with a real release key** — certificate
`CN=acrot0`, RSA 4096, valid until 2056:

```
SHA-256  62:10:CE:17:86:74:A0:85:1D:77:5D:EB:42:88:1A:37:BE:20:78:B9:37:60:C2:5E:BF:9B:5E:F5:92:7C:CD:08
SHA-1    B8:2E:6B:A6:7F:FB:8D:34:31:37:FE:50:C3:AD:26:F3:69:C0:DB:D1
```

This is the package's identity, not a format claim: whoever holds the key can
publish an update that every installed copy accepts as genuine, and Android has
no revocation mechanism. The keystore and its password are not in the
repository (see [docs/RELEASE.md](docs/RELEASE.md)) and are backed up
elsewhere. To check whether an APK came from this project, run
`apksigner verify --print-certs` and compare the fingerprint above — matching
means the same signature; a mismatch means it should not be installed from any
source.

## Structure

```
src/
├── calc/              pure calculation functions, no side effects, no i18n
├── ui/
│   ├── tabs/          one component per tab
│   ├── components/    shared form primitives, charts, panels
│   ├── locales/       zh.mjs / en.mjs, key sets enforced identical by test
│   └── *.mjs          export, history, field templates, scenarios, share cards
├── calc/docs/         the derivation behind each model
└── ui/tools/          icon audit, locale diff
```

**The calculation layer never emits user-facing prose.** It throws
`CalcError { code, params }` and the UI translates — which is what lets the
same calculation render in two languages, and why no calc module contains a
string a translator would need to find.

**`history.mjs` takes an injected storage object** rather than reaching for
`localStorage`, so the history logic is fully testable under Node.

**Charts draw themselves.** Seven canvases reveal their curve on mount, and
every annotation — equivalence points, Km, the eutectic, the reading line —
waits until the sweep reaches its x. A dashed line marking where a titration
bends, sitting on an empty grid, gives away the answer before the curve has
drawn it.

### Number display: anything without a lower bound uses `fmtSci`

`fmt` keeps a fixed number of decimals, which is right for quantities with a
floor (molar mass, radius, percentage, temperature, R²). But **mass, amount of
substance and concentration have no floor** — 1 mL of a 1 µM solution needs
5.844×10⁻⁸ g, which `fmt` renders as `0`, and `0` reads as "nothing there"
rather than "very little".

So the two are separated: unbounded quantities go through `fmtSci` (switching
to mantissa × 10ⁿ outside 1e-3 to 1e5), bounded ones stay on `fmt`. For
ordinary values `fmtSci` is identical to `fmt`, so the change is invisible
everywhere it was not previously wrong.

`test/ui-strings.test.mjs` scans for this pattern. Where one field name is
bounded in one place and unbounded in another — `molarity` means both a
concentrated reagent and a trace standard — the call site carries a
`Bounded:` comment recording the judgement, rather than the rule being relaxed.

## Credits

| Use | Source | Licence |
|---|---|---|
| Interface icons | [Phosphor Icons](https://phosphoricons.com) | MIT |
| Typeface | [Inter](https://rsms.me/inter/) | OFL-1.1 |
| Application icon | Generated by `scripts/make-icons.mjs` | MIT |

All commercially usable. The application icon is drawn by a script
(`npm run icons`) rather than sourced as an image, so its colours are the
interface's own CSS variables and it is reproducible text rather than an opaque
binary.

## Licence

MIT
