/**
 * Ground-state electron configurations.
 *
 * The Madelung (n+l) rule — fill the lowest n+l, ties broken by lowest n —
 * predicts most of the table and is wrong for exactly twenty elements. Those
 * are not rounding errors or curiosities: chromium really is [Ar] 3d⁵ 4s¹ and
 * palladium really is [Kr] 4d¹⁰, because a half-filled or filled subshell sits
 * lower than the rule assumes. A generated table would be wrong in twenty
 * places and right-looking everywhere, which is the failure mode this project
 * keeps running into.
 *
 * So the twenty are explicit data and everything else is computed. The rule
 * carries the other 98, where it is reliable.
 *
 * Values follow the NIST Atomic Spectra Database ground-state configurations.
 */

/** Elements where the Madelung rule does not hold, as `[core] subshell` strings. */
const EXCEPTIONS = {
  24: '[Ar] 3d5 4s1', // Cr — half-filled d
  29: '[Ar] 3d10 4s1', // Cu — filled d
  41: '[Kr] 4d4 5s1', // Nb
  42: '[Kr] 4d5 5s1', // Mo — half-filled d
  44: '[Kr] 4d7 5s1', // Ru
  45: '[Kr] 4d8 5s1', // Rh
  46: '[Kr] 4d10', // Pd — no 5s at all
  47: '[Kr] 4d10 5s1', // Ag — filled d
  57: '[Xe] 5d1 6s2', // La — no 4f
  58: '[Xe] 4f1 5d1 6s2', // Ce
  64: '[Xe] 4f7 5d1 6s2', // Gd — half-filled f
  78: '[Xe] 4f14 5d9 6s1', // Pt
  79: '[Xe] 4f14 5d10 6s1', // Au — filled d
  89: '[Rn] 6d1 7s2', // Ac — no 5f
  90: '[Rn] 6d2 7s2', // Th
  91: '[Rn] 5f2 6d1 7s2', // Pa
  92: '[Rn] 5f3 6d1 7s2', // U
  93: '[Rn] 5f4 6d1 7s2', // Np
  96: '[Rn] 5f7 6d1 7s2', // Cm — half-filled f
  103: '[Rn] 5f14 7s2 7p1', // Lr
};

/** Noble-gas cores, by atomic number. */
const CORES = [
  { z: 86, symbol: 'Rn' },
  { z: 54, symbol: 'Xe' },
  { z: 36, symbol: 'Kr' },
  { z: 18, symbol: 'Ar' },
  { z: 10, symbol: 'Ne' },
  { z: 2, symbol: 'He' },
];

/** Subshell filling order under the Madelung rule: ascending n+l, then n. */
const FILL_ORDER = [
  [1, 's'], [2, 's'], [2, 'p'], [3, 's'], [3, 'p'], [4, 's'],
  [3, 'd'], [4, 'p'], [5, 's'], [4, 'd'], [5, 'p'], [6, 's'],
  [4, 'f'], [5, 'd'], [6, 'p'], [7, 's'], [5, 'f'], [6, 'd'],
  [7, 'p'],
];

const CAPACITY = { s: 2, p: 6, d: 10, f: 14 };

/**
 * Full configuration as an ordered list of `n l count` subshells.
 *
 * Ordered by principal quantum number, not by filling order: a configuration
 * is written 3d before 4s even though 4s fills first, because that is how the
 * shell structure reads. Filling order is a bookkeeping device, not a display
 * order.
 */
function fullConfig(z) {
  let left = z;
  const shells = new Map();
  for (const [n, l] of FILL_ORDER) {
    if (left <= 0) break;
    const take = Math.min(left, CAPACITY[l]);
    shells.set(`${n}${l}`, take);
    left -= take;
  }
  return shells;
}

/** Sort `n l` keys by principal number, then by s < p < d < f. */
const SUB_ORDER = { s: 0, p: 1, d: 2, f: 3 };
function sorted(keys) {
  return [...keys].sort((a, b) => {
    const [an, al] = [a.slice(0, -1), a.slice(-1)];
    const [bn, bl] = [b.slice(0, -1), b.slice(-1)];
    return Number(an) - Number(bn) || SUB_ORDER[al] - SUB_ORDER[bl];
  });
}

/** Parse `'[Ar] 3d5 4s1'` into a core symbol and an ordered subshell map. */
function parseShorthand(text) {
  const core = text.match(/^\[(\w+)\]/)?.[1] ?? null;
  const rest = text.replace(/^\[\w+\]\s*/, '');
  const shells = new Map();
  for (const m of rest.matchAll(/(\d)([spdf])(\d+)/g)) {
    shells.set(`${m[1]}${m[2]}`, Number(m[3]));
  }
  return { core, shells };
}

/**
 * Ground-state electron configuration for an atomic number.
 *
 * Returns both the full form and the noble-gas shorthand, because they answer
 * different questions: the shorthand is what fits on a periodic table, the full
 * form is what shows the shell structure.
 *
 * @param {number} z atomic number, 1-118
 * @returns {{z:number, full:string, shorthand:string, core:string|null,
 *            valence:string, shells:Array<{n:number,l:string,count:number}>}}
 */
export function electronConfig(z) {
  if (!Number.isInteger(z) || z < 1 || z > 118) {
    throw new Error(`config: atomic number must be an integer 1-118, got ${String(z)}`);
  }

  const exception = EXCEPTIONS[z];
  /**
   * The full form is built from the exception's own core plus its stated
   * subshells, never from the exception string alone — `[Ar] 3d5 4s1` accounts
   * for 6 electrons, and chromium has 24. It is also never the Madelung fill
   * with the exception merged on top, because an exception can *remove* a
   * subshell the rule filled: palladium is `[Kr] 4d10` with no 5s at all.
   */
  const shells = exception
    ? (() => {
      const { core, shells: stated } = parseShorthand(exception);
      const base = fullConfig(CORES.find((c) => c.symbol === core)?.z ?? 0);
      for (const [key, count] of stated) base.set(key, count);
      return base;
    })()
    : fullConfig(z);

  const ordered = sorted([...shells.keys()]);
  const full = ordered.map((k) => `${k}${shells.get(k)}`).join(' ');
  const shellList = ordered.map((k) => ({
    n: Number(k.slice(0, -1)),
    l: k.slice(-1),
    count: shells.get(k),
  }));

  // Shorthand: drop everything the nearest lower noble gas already accounts
  // for. A hand-written exception states its own core, so it is used verbatim —
  // the printed form then matches the source exactly.
  //
  // Hydrogen and helium have no lower noble gas to shorten against, so they
  // stay in full and report no core.
  const core = exception
    ? CORES.find((c) => c.symbol === parseShorthand(exception).core)
    : CORES.find((c) => c.z < z);

  let shorthand = full;
  if (exception) {
    shorthand = exception;
  } else if (core) {
    const coreConfig = fullConfig(core.z);
    const rest = ordered
      .filter((k) => shells.get(k) !== (coreConfig.get(k) ?? 0))
      .map((k) => `${k}${shells.get(k)}`);
    shorthand = rest.length > 0 ? `[${core.symbol}] ${rest.join(' ')}` : `[${core.symbol}]`;
  }

  // Valence electrons: everything outside the noble-gas core. This is the
  // number that matters for bonding, and it is not simply the last subshell.
  const coreConfig = core ? fullConfig(core.z) : new Map();
  const valenceCount = ordered.reduce(
    (sum, k) => sum + (shells.get(k) ?? 0) - (coreConfig.get(k) ?? 0),
    0,
  );

  return {
    z,
    full,
    shorthand,
    core: core?.symbol ?? null,
    valence: valenceCount,
    shells: shellList,
  };
}
