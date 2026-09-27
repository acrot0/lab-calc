/**
 * Ready-made equilibrium systems, with their constants and their sources.
 *
 * ## Why presets at all
 *
 * The solver in `equilibrium.mjs` takes a system description, and a user who
 * can write one does not need this file. Everybody else needs it: assembling
 * AgCl plus ammonia plus the two ammine complexes plus the ammonia's own pKa
 * is four equilibria and three components before anything has been calculated,
 * and a tab that asks for that on first open is a tab nobody opens.
 *
 * ## Where the constants come from, and why each carries a reference
 *
 * Every number here is a literature value at 25 °C and zero ionic strength,
 * with the source named. That is not decoration: a speciation answer is only
 * as good as its constants, and a user who wants to check the arithmetic has
 * no way to check the inputs. Naming the source is what makes the check
 * possible.
 *
 * The values are deliberately the *thermodynamic* constants (I → 0), not the
 * conditional constants at a working ionic strength, because the solver has no
 * activity model — see the note in `equilibrium.mjs`. A conditional constant
 * fed to a solver that assumes ideality would be double-counting the ionic
 * strength, and the error runs in the direction of overestimating solubility.
 *
 * `check` is a value the preset must reproduce, asserted in the tests. It is
 * the preset's own answer to "does this still work" — a constant edited by
 * mistake changes it, and nothing else in the app would notice.
 */

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {{zh: string, en: string}} label
 * @property {{zh: string, en: string}} question  What this preset answers
 * @property {string} source
 * @property {object} spec                        Passed straight to `speciate`
 */

/** @type {Preset[]} */
export const EQUILIBRIUM_PRESETS = [
  {
    id: 'agcl-water',
    label: { zh: 'AgCl 在水中', en: 'AgCl in water' },
    question: {
      zh: '氯化银在纯水里溶解多少？',
      en: 'How much silver chloride dissolves in pure water?',
    },
    source: 'Ksp(AgCl) = 1.8×10⁻¹⁰，25 °C（CRC Handbook）',
    /*
     * The totals are far above the solubility so that solid is present at
     * equilibrium — the case the preset is about. A preset whose totals sat
     * below √Ksp would answer "all of it dissolved", which is correct and
     * useless.
     */
    spec: {
      ph: 7,
      components: [
        { id: 'Ag', charge: 1, total: 0.01, label: 'Ag⁺' },
        { id: 'Cl', charge: -1, total: 0.01, label: 'Cl⁻' },
      ],
      solids: [{ id: 'AgCl', logKsp: -9.75, ions: { Ag: 1, Cl: 1 } }],
    },
    check: { freeAg: 1.334e-5, unit: 'mol/L' },
  },
  {
    id: 'agcl-ammonia',
    label: { zh: 'AgCl 在氨水中', en: 'AgCl in ammonia' },
    question: {
      zh: '为什么氯化银溶于氨水？溶度积单独预测不了。',
      en: 'Why does silver chloride dissolve in ammonia? The solubility product alone cannot say.',
    },
    /*
     * IUPAC's recommended stepwise pair, log K₁ = 3.24 and log K₂ = 3.99,
     * whose sum is the overall log β₂ = 7.23 the tables also print. Both
     * numbers are in circulation and they are not interchangeable: quoting
     * β₁ = 3.31 alongside β₂ = 7.23 implies K₂ = 3.92, which is neither of the
     * tabulated values. The two are consistent here, which is what the source
     * line is claiming.
     */
    source: 'log K₁ = 3.24、log K₂ = 3.99 → log β₂ = 7.23（Ag⁺–NH₃，IUPAC，25 °C、I = 0）；NH₄⁺ pKa = 9.25',
    /*
     * The demonstration this whole module exists for. Ksp alone says the
     * solubility is √Ksp whatever else is in solution; the diammine complex
     * holds the free Ag⁺ down, so more solid dissolves to restore the product.
     * Same Ksp, different answer, and only a coupled solve gets both.
     */
    spec: {
      ph: 9.5,
      components: [
        { id: 'Ag', charge: 1, total: 0.1, label: 'Ag⁺' },
        { id: 'Cl', charge: -1, total: 0.1, label: 'Cl⁻' },
        {
          id: 'NH3',
          charge: 0,
          total: 1.0,
          label: 'NH₃',
          protonations: [{ n: 1, logK: 9.25, label: 'NH₄⁺' }],
        },
      ],
      complexes: [
        { id: 'AgNH3', metal: 'Ag', ligands: { NH3: 1 }, logK: 3.24, charge: 1, label: '[Ag(NH₃)]⁺', stepwise: [3.24] },
        { id: 'AgNH32', metal: 'Ag', ligands: { NH3: 2 }, logK: 3.24 + 3.99, charge: 1, label: '[Ag(NH₃)₂]⁺', stepwise: [3.24, 3.99] },
      ],
      solids: [{ id: 'AgCl', logKsp: -9.75, ions: { Ag: 1, Cl: 1 } }],
    },
    /*
     * The totals are 0.1 M, not 0.01 M, and that is load-bearing. From
     * S² = Ksp(1 + β₁[NH₃] + β₂[NH₃]²) with [NH₃] ≈ 1 M, the solubility in
     * 1 M ammonia is 0.055 M — so a 0.01 M total dissolves completely and the
     * preset would show no solid at all, demonstrating the opposite of its
     * point. At 0.1 M some remains, and the answer shows the contrast: free
     * Ag⁺ pinned near 4e-9 M while the total dissolved is four orders larger.
     */
    check: { freeAgBelow: 1e-7, solidPresent: true, unit: 'mol/L' },
  },
  {
    id: 'caco3-water',
    label: { zh: 'CaCO₃ 在水中', en: 'CaCO₃ in water' },
    question: {
      zh: '碳酸钙的溶解度，以及碳酸根水解带来的耦合。',
      en: 'The solubility of calcium carbonate, and the coupling its anion brings.',
    },
    source: 'Ksp(CaCO₃, 方解石) = 3.3×10⁻⁹（25 °C）；H₂CO₃ pKa₁ = 6.35、pKa₂ = 10.33',
    /*
     * The second coupling, and a different one from the ammine case: here the
     * anion is itself a base, so the solubility depends on the pH *through the
     * anion* rather than through a separate ligand. At pH 7 most carbonate is
     * HCO₃⁻, which does not appear in the Ksp, so far more calcite dissolves
     * than the square root would predict.
     */
    spec: {
      ph: 7,
      components: [
        { id: 'Ca', charge: 2, total: 0.01, label: 'Ca²⁺' },
        {
          id: 'CO3',
          charge: -2,
          total: 0.01,
          label: 'CO₃²⁻',
          protonations: [
            { n: 1, logK: 10.33, label: 'HCO₃⁻' },
            { n: 2, logK: 10.33 + 6.35, label: 'H₂CO₃' },
          ],
        },
      ],
      solids: [{ id: 'CaCO3', logKsp: -8.48, ions: { Ca: 1, CO3: 1 } }],
    },
    check: { freeCaAbove: 1e-5, unit: 'mol/L' },
  },
  {
    id: 'cu-ammonia',
    label: { zh: 'Cu²⁺ 与氨的逐级络合', en: 'Stepwise complexation of Cu²⁺ with ammonia' },
    question: {
      zh: '铜氨溶液的蓝色为什么随 pH 加深？四个络合物各占多少？',
      en: 'Why does the copper-ammine colour deepen with pH? How much of each of the four complexes is present?',
    },
    source: 'log K₁…K₄ = 4.13、3.48、2.87、2.11（Cu²⁺–NH₃，25 °C）；NH₄⁺ pKa = 9.25',
    /*
     * Stepwise constants, not overall. The solver takes log K for each
     * successive addition, which is how they are tabulated; converting to
     * overall constants first is a step where a wrong cumulative sum is easy
     * and invisible, so the preset keeps them in the form the source prints.
     */
    spec: {
      ph: 10,
      components: [
        { id: 'Cu', charge: 2, total: 0.01, label: 'Cu²⁺' },
        {
          id: 'NH3',
          charge: 0,
          total: 0.2,
          label: 'NH₃',
          protonations: [{ n: 1, logK: 9.25, label: 'NH₄⁺' }],
        },
      ],
      complexes: [
        { id: 'CuNH3', metal: 'Cu', ligands: { NH3: 1 }, logK: 4.13, charge: 2, label: '[Cu(NH₃)]²⁺' , stepwise: [4.13] },
        { id: 'CuNH32', metal: 'Cu', ligands: { NH3: 2 }, logK: 4.13 + 3.48, charge: 2, label: '[Cu(NH₃)₂]²⁺' , stepwise: [4.13, 3.48] },
        { id: 'CuNH33', metal: 'Cu', ligands: { NH3: 3 }, logK: 4.13 + 3.48 + 2.87, charge: 2, label: '[Cu(NH₃)₃]²⁺' , stepwise: [4.13, 3.48, 2.87] },
        { id: 'CuNH34', metal: 'Cu', ligands: { NH3: 4 }, logK: 4.13 + 3.48 + 2.87 + 2.11, charge: 2, label: '[Cu(NH₃)₄]²⁺' , stepwise: [4.13, 3.48, 2.87, 2.11] },
      ],
    },
    check: { dominantSpecies: 'CuNH34', unit: '' },
  },
];

/** Look a preset up by id, or undefined. */
export function presetById(id) {
  return EQUILIBRIUM_PRESETS.find((p) => p.id === id);
}
