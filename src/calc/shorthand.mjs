/**
 * Formula shorthand: isotope symbols, organic group abbreviations, and the
 * deuterium-label suffix.
 *
 * These are expanded into plain element notation before the formula parser
 * sees them, so the parser stays about element counting and this stays about
 * notation. Expanding first also means the expansions are ordinary formulas
 * that the same tests already cover.
 *
 * Pure data and string rewriting, no I/O.
 */

/**
 * Hydrogen isotopes, which have their own symbols in chemistry.
 *
 * D and T are not element symbols and are not in ATOMIC_WEIGHTS: a formula
 * containing them is still hydrogen, just a heavier one, and adding them to the
 * element table would make `elementBySymbol('D')` return something and quietly
 * change what "the elements" means everywhere else. They are recognised only
 * here, where a formula is being read.
 *
 * Masses are the nuclide masses (not the standard atomic weight of the
 * element), because that is what a molar mass of D2O actually uses.
 */
export const ISOTOPES = {
  D: { element: 'H', massNumber: 2, mass: 2.014101778, name: 'deuterium', zh: '氘' },
  T: { element: 'H', massNumber: 3, mass: 3.016049282, name: 'tritium', zh: '氚' },
};

/**
 * Organic group abbreviations, expanded to the group they stand for.
 *
 * The expansion is the substituent as written in a formula, so `MeOH` becomes
 * `CH3OH` and `Me2CO` becomes `(CH3)2CO`.
 *
 * ## What is deliberately absent
 *
 * Ac, Ar, Pr, Ts and Am are NOT here, even though acetyl, aryl, propyl, tosyl
 * and amyl are all common. Each of those is also a real element symbol —
 * actinium, argon, praseodymium, tennessine, americium — and a formula parser
 * cannot tell `Pr2O3` (praseodymium oxide) from a propyl group. Expanding them
 * would silently change the meaning of formulas that are already correct, which
 * is the one failure this project refuses everywhere else. The element reading
 * wins; write `CH3CO` for acetyl, `C3H7` for propyl.
 *
 * Bz is included as benzoyl. Older literature sometimes uses it for benzyl, but
 * the modern convention is Bz = benzoyl and Bn = benzyl, and following the
 * modern one is the only way to be right more often than not.
 */
export const ABBREVIATIONS = {
  // --- alkyl ---
  Me: { expansion: 'CH3', note: 'methyl' },
  Et: { expansion: 'C2H5', note: 'ethyl' },
  nPr: { expansion: 'C3H7', note: 'n-propyl' },
  iPr: { expansion: 'C3H7', note: 'isopropyl' },
  nBu: { expansion: 'C4H9', note: 'n-butyl' },
  iBu: { expansion: 'C4H9', note: 'isobutyl' },
  sBu: { expansion: 'C4H9', note: 'sec-butyl' },
  tBu: { expansion: 'C4H9', note: 'tert-butyl' },
  Bu: { expansion: 'C4H9', note: 'butyl (isomer unspecified)' },

  // --- aryl ---
  Ph: { expansion: 'C6H5', note: 'phenyl' },
  Bn: { expansion: 'C7H7', note: 'benzyl, C6H5CH2' },
  Bz: { expansion: 'C7H5O', note: 'benzoyl, C6H5CO' },
  Mes: { expansion: 'C9H11', note: 'mesityl, 2,4,6-trimethylphenyl' },
  Tol: { expansion: 'C7H7', note: 'tolyl, CH3C6H4' },

  // --- protecting groups and silyl ethers ---
  Boc: { expansion: 'C5H9O2', note: 'tert-butoxycarbonyl' },
  Cbz: { expansion: 'C8H7O2', note: 'benzyloxycarbonyl' },
  Fmoc: { expansion: 'C15H11O2', note: '9-fluorenylmethoxycarbonyl' },
  Alloc: { expansion: 'C4H5O2', note: 'allyloxycarbonyl' },
  TMS: { expansion: 'C3H9Si', note: 'trimethylsilyl' },
  TBS: { expansion: 'C6H15Si', note: 'tert-butyldimethylsilyl' },
  TBDMS: { expansion: 'C6H15Si', note: 'tert-butyldimethylsilyl' },
  TIPS: { expansion: 'C9H21Si', note: 'triisopropylsilyl' },

  // --- acyl and sulfonyl ---
  Ms: { expansion: 'CH3O2S', note: 'mesyl, CH3SO2' },
  Tf: { expansion: 'CF3O2S', note: 'triflyl, CF3SO2' },

  // --- solvents and common reagents, as people actually type them ---
  DMSO: { expansion: 'C2H6OS', note: 'dimethyl sulfoxide' },
  DMF: { expansion: 'C3H7NO', note: 'N,N-dimethylformamide' },
  THF: { expansion: 'C4H8O', note: 'tetrahydrofuran' },
  DCM: { expansion: 'CH2Cl2', note: 'dichloromethane' },
  DCE: { expansion: 'C2H4Cl2', note: '1,2-dichloroethane' },
  NMP: { expansion: 'C5H9NO', note: 'N-methyl-2-pyrrolidone' },
  ACN: { expansion: 'C2H3N', note: 'acetonitrile' },
  EtOAc: { expansion: 'C4H8O2', note: 'ethyl acetate' },
  TEA: { expansion: 'C6H15N', note: 'triethylamine' },
  Py: { expansion: 'C5H5N', note: 'pyridine' },
};

/** Longest first, so `TBDMS` is not read as `TBS`, and `iPr` not as a stray `i`. */
const KEYS = Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length);

/**
 * The deuterium-label suffix, as in `DMSO-d6` or `THF-d8`.
 *
 * In NMR solvent labels the number counts hydrogens that have been replaced by
 * deuterium, so the label is an instruction about the base formula rather than
 * part of it: DMSO is C2H6OS and DMSO-d6 is C2D6OS. Reading it any other way
 * gets the mass wrong by six neutrons.
 */
const DEUTERIUM_LABEL = /-d(\d*)$/;

/**
 * Rewrite shorthand into plain element notation.
 *
 * Returns the rewritten formula plus a record of what was expanded, so a caller
 * can show its work rather than silently transforming the input.
 *
 * @param {string} input formula as typed
 * @returns {{formula:string, applied:Array<{abbr:string,expansion:string}>,
 *            deuterated:number}}
 */
export function expandShorthand(input) {
  const applied = [];
  let src = input;

  // The deuterium label comes off first: it describes the finished molecule,
  // and its `-` would otherwise be an unexpected character to the parser.
  let deuterated = 0;
  const label = DEUTERIUM_LABEL.exec(src);
  if (label) {
    deuterated = label[1] === '' ? 1 : Number(label[1]);
    src = src.slice(0, label.index);
  }

  let out = '';
  let i = 0;
  while (i < src.length) {
    const abbr = KEYS.find((k) => src.startsWith(k, i));
    if (!abbr) {
      out += src[i];
      i++;
      continue;
    }

    let j = i + abbr.length;
    let digits = '';
    while (j < src.length && /\d/.test(src[j])) {
      digits += src[j];
      j++;
    }

    // Parenthesised only when subscripted. `MeOH` reads better as `CH3OH` than
    // as `(CH3)OH`, and the two parse identically; `Me2CO` needs the brackets
    // or the 2 would attach to the hydrogen instead of the group.
    const { expansion } = ABBREVIATIONS[abbr];
    out += digits ? `(${expansion})${digits}` : expansion;
    applied.push({ abbr, expansion, count: digits || '1' });
    i = j;
  }

  return { formula: out, applied, deuterated };
}
