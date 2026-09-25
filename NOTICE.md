# Third-party notices

This project is MIT-licensed (see [LICENSE](LICENSE)). It incorporates data and
code from the sources below. Each entry records what was taken and under what
terms, so the provenance of any given file stays answerable.

---

## chemistry/chemical-libraries

- **Source:** https://github.com/chemistry/chemical-libraries
- **Licence:** MIT — Copyright (c) 2017-2026 Volodymyr Vreshch
- **Used in:** `src/calc/elements.mjs`
- **What was taken:** the periodic-table layout (group/period grid coordinates),
  covalent radii, van der Waals radii, maximum bond counts, and the CPK element
  colours, for all 118 elements. Atomic masses for the 35 elements this project
  did not previously carry (Tc, Pm, Po–Og) also come from here.
- **What was NOT taken:** the atomic masses for the other 83 elements. That
  library uses older IUPAC values; this project already had IUPAC 2021 standard
  atomic weights and the two tables disagree for 58 elements (e.g. S 32.06 vs
  32.065, Zn 65.38 vs 65.409). Keeping the existing table avoids silently
  changing every molar mass the calculator produces. The `massSource` field on
  each element records which source its mass came from.

## PubChem periodic table

- **Source:** https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON
- **Operator:** US National Center for Biotechnology Information (NCBI), part of
  the National Library of Medicine / NIH
- **Licence:** **public domain** — US government work, no copyright
- **Used in:** `src/calc/element-properties.mjs` (generated)
- **What was taken:** electronegativity (Pauling), oxidation states, melting and
  boiling points, density, first ionization energy, and year of discovery, for
  all 118 elements.
- **How:** fetched by `scripts/fetch-element-properties.mjs`, which is committed
  alongside the generated file so any value can be re-derived rather than
  trusted. The generated file is committed so the app itself needs no network.
- **Why PubChem rather than a community dataset:** it is the only source
  consulted that is both authoritative and unencumbered. It is also the only one
  that carries oxidation states, which is the property a student reaches for
  first.

## Discovery years and discoverers — hand-curated, correcting PubChem

- **Source:** `src/calc/element-discovery.mjs`, written for this project.
- **Licence:** MIT, like the rest of this repository. No third-party table was
  copied — see "What is not copied" below.
- **Why it exists:** PubChem's `YearDiscovered` column is wrong for five
  elements. Aluminium and calcium are both marked `"Ancient"` — a string, which
  the generator turned into `null`, which the detail panel rendered as "known
  since antiquity". Both were isolated in the 1800s. Fluorine is dated to
  Scheele's 1670 observation of the acid rather than Moissan's 1886 isolation of
  the element, silicon is put at 1854 instead of 1823, and ruthenium at 1827
  instead of 1844. A user checking when aluminium was discovered got a wrong
  answer.
- **What the years mean:** the year the element was first **isolated** as a
  substance, not the year its existence was first suspected. That is the
  convention in the textbooks this app is used alongside, and it is why several
  entries differ from a "discovery" date looked up elsewhere — Davy prepared
  calcium in 1808 though lime had been known for millennia. Twelve elements have
  no year at all: they carry an approximate era of earliest surviving use
  instead, because dating them to a year would claim a precision archaeology
  does not have.
- **What is not copied:** a name and a year are facts, and facts are not
  copyrightable. The wording, the selection and the arrangement of a table are.
  Every discoverer and date here was checked across multiple sources and written
  out by hand; no table was transcribed, and no source's prose appears. The
  sources consulted for cross-checking were Wikipedia's "Timeline of chemical
  element discoveries" (CC BY-SA 3.0) and Los Alamos National Laboratory's
  periodic table (all rights reserved) — neither licence permits copying their
  data into an MIT project, which is precisely why only the facts were taken.
- **Cross-checking:** `test/element-discovery.test.mjs` pins the values against
  known textbook years rather than against the data file, and checks that the
  table agrees with the `yearDiscovered` column the generator produces — the two
  are written from different places, so drift between them is a test failure.

## Bowserinator/Periodic-Table-JSON — evaluated, not used

- **Source:** https://github.com/Bowserinator/Periodic-Table-JSON
- **Licence:** **CC BY-SA 3.0** (ShareAlike)
- **Why it was rejected:** the ShareAlike term is viral — incorporating that data
  would oblige this project to license its derived work under CC BY-SA as well,
  which is incompatible with the MIT licence it ships under. Its richer fields
  (melting/boiling points, discovery year, Wikipedia summaries) were not worth
  the licence change. Recorded here so the same evaluation is not repeated.

---

## Reference data used without incorporation

Standard atomic weights follow IUPAC 2021. Physical constants (Avogadro's
number, the gas constant, the Faraday constant) follow CODATA 2018. These are
facts rather than creative works and are not copyrightable, but the edition is
named so a future reader can check a value against its source.
