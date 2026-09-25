/**
 * Who discovered each element, and when.
 *
 * Separate from element-properties.mjs because it is a different kind of data
 * with a different provenance. That file is machine-generated from PubChem and
 * must stay transcription-free. This one cannot be: PubChem's periodic table has
 * no discoverer column, and its YearDiscovered cell is wrong for five elements —
 * aluminium and calcium are both marked "Ancient", fluorine is dated to Scheele's
 * 1670 observation of the acid rather than Moissan's 1886 isolation, silicon is
 * put at 1854 and ruthenium at 1827.
 *
 * The years here are ISOLATION years: when the element was first obtained as a
 * substance, not when its existence was first suspected. That is the convention
 * students meet in textbooks, and it is why several entries differ from a
 * "discovery" date one might look up elsewhere — Davy prepared calcium in 1808
 * though lime had been known for millennia, and Moissan isolated fluorine in
 * 1886 though Scheele had recognised the acid in 1771.
 *
 * Facts (a name and a year) are not copyrightable; the wording and selection of
 * any table are. Nothing here is copied from a source table — see NOTICE.md.
 *
 * `year` is null for the twelve elements known since antiquity, which carry an
 * `era` instead: the approximate date of the earliest surviving use. An era is
 * deliberately not a year — "9000 BC" is an archaeological estimate with a
 * margin of centuries, and rendering it beside 1825 would imply a precision it
 * does not have.
 */

/**
 * `kind` says how to read `years`, because the numbers run in both directions
 * from the epoch and a bare integer cannot say which side it is on:
 *   bce         — that many years before the common era
 *   bceBefore   — "before <year> BC", an upper bound rather than a point
 *   ceCirca     — approximately that year of the common era
 */
export const ERA_KINDS = ['bce', 'bceBefore', 'ceCirca'];

/** @type {Array<{number:number,year:number|null,by:string,era?:{years:number,kind:string}}>} */
export const DISCOVERY = [
  { number:   1, year: 1766, by: 'H. Cavendish' },
  { number:   2, year: 1868, by: 'N. Lockyer' },
  { number:   3, year: 1817, by: 'A. Arfwedson' },
  { number:   4, year: 1798, by: 'N. Vauquelin' },
  { number:   5, year: 1808, by: 'H. Davy' },
  { number:   6, year: null, by: 'Earliest humans', era: { years: 26000, kind: 'bce' } },
  { number:   7, year: 1772, by: 'D. Rutherford' },
  { number:   8, year: 1774, by: 'J. Priestley' },
  { number:   9, year: 1886, by: 'H. Moissan' },
  { number:  10, year: 1898, by: 'W. Ramsay and W. Travers' },
  { number:  11, year: 1807, by: 'H. Davy' },
  { number:  12, year: 1808, by: 'H. Davy' },
  { number:  13, year: 1825, by: 'H. C. Ørsted' },
  { number:  14, year: 1823, by: 'J. Berzelius' },
  { number:  15, year: 1669, by: 'H. Brand' },
  { number:  16, year: null, by: 'Middle East', era: { years: 2000, kind: 'bceBefore' } },
  { number:  17, year: 1774, by: 'W. Scheele' },
  { number:  18, year: 1894, by: 'Lord Rayleigh and W. Ramsay' },
  { number:  19, year: 1807, by: 'H. Davy' },
  { number:  20, year: 1808, by: 'H. Davy' },
  { number:  21, year: 1879, by: 'F. Nilson' },
  { number:  22, year: 1791, by: 'W. Gregor' },
  { number:  23, year: 1801, by: 'A. M. del Río' },
  { number:  24, year: 1797, by: 'N. Vauquelin' },
  { number:  25, year: 1774, by: 'J. G. Gahn' },
  { number:  26, year: null, by: 'Middle East', era: { years: 5000, kind: 'bceBefore' } },
  { number:  27, year: 1735, by: 'G. Brandt' },
  { number:  28, year: 1751, by: 'F. Cronstedt' },
  { number:  29, year: null, by: 'Middle East', era: { years: 9000, kind: 'bce' } },
  { number:  30, year: 1746, by: 'A. S. Marggraf' },
  { number:  31, year: 1875, by: 'P. E. L. de Boisbaudran' },
  { number:  32, year: 1886, by: 'C. A. Winkler' },
  { number:  33, year: null, by: 'Egyptians', era: { years: 300, kind: 'ceCirca' } },
  { number:  34, year: 1817, by: 'J. Berzelius and G. Gahn' },
  { number:  35, year: 1826, by: 'A. J. Balard' },
  { number:  36, year: 1898, by: 'W. Ramsay and W. Travers' },
  { number:  37, year: 1861, by: 'G. R. Kirchhoff and R. Bunsen' },
  { number:  38, year: 1790, by: 'A. Crawford' },
  { number:  39, year: 1794, by: 'J. Gadolin' },
  { number:  40, year: 1789, by: 'H. Klaproth' },
  { number:  41, year: 1801, by: 'C. Hatchett' },
  { number:  42, year: 1778, by: 'W. Scheele' },
  { number:  43, year: 1937, by: 'C. Perrier and E. Segrè' },
  { number:  44, year: 1844, by: 'K. Claus' },
  { number:  45, year: 1803, by: 'W. H. Wollaston' },
  { number:  46, year: 1803, by: 'W. H. Wollaston' },
  { number:  47, year: null, by: 'Asia Minor', era: { years: 5000, kind: 'bceBefore' } },
  { number:  48, year: 1817, by: 'S. L Hermann, F. Stromeyer, and J.C.H. Roloff' },
  { number:  49, year: 1863, by: 'F. Reich and T. Richter' },
  { number:  50, year: null, by: 'Asia Minor', era: { years: 3500, kind: 'bce' } },
  { number:  51, year: null, by: 'Sumerians', era: { years: 3000, kind: 'bce' } },
  { number:  52, year: 1782, by: 'F.-J.M. von Reichenstein' },
  { number:  53, year: 1811, by: 'B. Courtois' },
  { number:  54, year: 1898, by: 'W. Ramsay and W. Travers' },
  { number:  55, year: 1860, by: 'G. R. Kirchhoff and R. Bunsen' },
  { number:  56, year: 1808, by: 'H. Davy' },
  { number:  57, year: 1839, by: 'G. Mosander' },
  { number:  58, year: 1803, by: 'H. Klaproth, W. Hisinger, and J. Berzelius' },
  { number:  59, year: 1885, by: 'C. A. von Welsbach' },
  { number:  60, year: 1885, by: 'C. A. von Welsbach' },
  { number:  61, year: 1945, by: 'Jacob A. Marinsky, Lawrence E. Glendenin, and Charles D. Coryell' },
  { number:  62, year: 1879, by: 'P.E.L. de Boisbaudran' },
  { number:  63, year: 1901, by: 'E.-A. Demarçay' },
  { number:  64, year: 1880, by: 'J. C. G. de Marignac' },
  { number:  65, year: 1843, by: 'G. Mosander' },
  { number:  66, year: 1886, by: 'P.E.L. de Boisbaudran' },
  { number:  67, year: 1878, by: 'J.-L. Soret and M. Delafontaine' },
  { number:  68, year: 1843, by: 'G. Mosander' },
  { number:  69, year: 1879, by: 'T. Cleve' },
  { number:  70, year: 1878, by: 'J.C.G. de Marignac' },
  { number:  71, year: 1907, by: 'G. Urbain' },
  { number:  72, year: 1923, by: 'D. Coster and G. von Hevesy' },
  { number:  73, year: 1802, by: 'G. Ekeberg' },
  { number:  74, year: 1783, by: 'J. and F. Elhuyar' },
  { number:  75, year: 1925, by: 'W. Noddack, I. Tacke and O. Berg' },
  { number:  76, year: 1803, by: 'S. Tennant' },
  { number:  77, year: 1803, by: 'S. Tennant and H.-V. Collet-Descotils' },
  { number:  78, year: 1735, by: 'A. de Ulloa' },
  { number:  79, year: null, by: 'Earliest humans', era: { years: 40000, kind: 'bce' } },
  { number:  80, year: null, by: 'Egyptians', era: { years: 1500, kind: 'bce' } },
  { number:  81, year: 1861, by: 'W. Crookes' },
  { number:  82, year: null, by: 'Asia Minor', era: { years: 7000, kind: 'bce' } },
  { number:  83, year: 1753, by: 'C. J. Geoffroy' },
  { number:  84, year: 1898, by: 'P. and M. Curie' },
  { number:  85, year: 1940, by: 'D. R. Corson, K. R. MacKenzie and E. Segrè' },
  { number:  86, year: 1900, by: 'F. E. Dorn' },
  { number:  87, year: 1939, by: 'M. Perey' },
  { number:  88, year: 1898, by: 'P. and M. Curie' },
  { number:  89, year: 1899, by: 'A. Debierne' },
  { number:  90, year: 1828, by: 'J. Berzelius' },
  { number:  91, year: 1913, by: 'K. Fajans and O. H. Göhring' },
  { number:  92, year: 1789, by: 'H. Klaproth' },
  { number:  93, year: 1940, by: 'E.M. McMillan and H. Abelson' },
  { number:  94, year: 1940, by: 'G. T. Seaborg et al.' },
  { number:  95, year: 1944, by: 'G. T. Seaborg, R. A. James, O. Morgan and A. Ghiorso' },
  { number:  96, year: 1944, by: 'Glenn T. Seaborg, Ralph A. James and Albert Ghiorso' },
  { number:  97, year: 1949, by: 'G. Thompson, A. Ghiorso and G. T. Seaborg' },
  { number:  98, year: 1950, by: 'S. G. Thompson, K. Street, Jr., A. Ghiorso and G. T. Seaborg' },
  { number:  99, year: 1952, by: 'A. Ghiorso et al.' },
  { number: 100, year: 1952, by: 'A. Ghiorso et al.' },
  { number: 101, year: 1955, by: 'A. Ghiorso, G. Harvey, G. R. Choppin, S. G. Thompson and G. T. Seaborg' },
  { number: 102, year: 1957, by: 'Nobel Institute, Stockholm' },
  { number: 103, year: 1961, by: 'A. Ghiorso, T. Sikkeland, E. Larsh and M. Latimer' },
  { number: 104, year: 1964, by: 'A. Ghiorso et al. and I. Zvara et al.' },
  { number: 105, year: 1967, by: 'V. A. Druin et al. and A. Ghiorso et al.' },
  { number: 106, year: 1974, by: 'A. Ghiorso et al.' },
  { number: 107, year: 1976, by: 'Y. Oganessian et al.' },
  { number: 108, year: 1984, by: 'G. Münzenberg, P. Armbruster et al.' },
  { number: 109, year: 1982, by: 'G. Münzenberg, P. Armbruster et al.' },
  { number: 110, year: 1994, by: 'S. Hofmann et al.' },
  { number: 111, year: 1994, by: 'S. Hofmann et al.' },
  { number: 112, year: 1996, by: 'S. Hofmann et al.' },
  { number: 113, year: 2004, by: 'K. Morita et al.' },
  { number: 114, year: 1998, by: 'Y. Oganessian et al.' },
  { number: 115, year: 2003, by: 'Y. Oganessian et al.' },
  { number: 116, year: 2000, by: 'Y. Oganessian et al.' },
  { number: 117, year: 2010, by: 'Y. Oganessian et al.' },
  { number: 118, year: 2006, by: 'Y. Oganessian et al.' },
];

/** Discovery data for one atomic number, or null if it is out of range. */
export function discoveryOf(atomicNumber) {
  return DISCOVERY[atomicNumber - 1] ?? null;
}
