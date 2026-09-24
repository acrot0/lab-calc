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
