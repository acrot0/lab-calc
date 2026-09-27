/*
 * Worked examples, one click each.
 *
 * ## Why this exists
 *
 * Every tab opens with a blank-ish form. The defaults are sensible, but they
 * are a blank-ish form nonetheless: a reviewer, a student, or anyone who has
 * not used this exact tab has to invent an experiment before they can see what
 * the tab does. That is a real cost — the fastest way to lose someone is to
 * hand them an empty input and no question.
 *
 * A scenario is a question. "You need 500 mL of 0.5 M NaCl" is a thing a person
 * actually has to do, and the tab answers it. One click fills the form and runs
 * the calculation, so the first thing anyone sees is a worked example rather
 * than an empty box.
 *
 * ## Why the data is separate from the tabs
 *
 * `restored` is already the mechanism the history replay uses to seed a tab
 * from stored inputs, and every tab already reads it. A scenario is the same
 * shape, so this file needs no new plumbing in any tab — it hands the tab a
 * `restored` object and the tab does what it always does.
 *
 * That also makes the whole set testable without a DOM: every scenario is a
 * plain object, and `test/scenarios.test.mjs` asserts each one names a real tab
 * and carries the keys that tab reads.
 *
 * ## The values are real
 *
 * Every number here is something a bench actually does — PBS is 137 mM NaCl,
 * a 1:1000 antibody dilution is standard, a 0.1 M acetic acid titration is the
 * textbook example. A scenario with invented numbers teaches the wrong thing,
 * and the point of the feature is that a reader can trust what they see.
 */

/**
 * One entry per tab, in the rail's own order.
 *
 * `tab` must match a tab id in `App.jsx`; `inputs` is the `restored` object.
 * `title`/`why` are bilingual: the title is the experiment, the `why` is the
 * one sentence that says what the tab shows that a formula cannot.
 */
export const SCENARIOS = [
  {
    tab: 'weigh',
    title: { zh: '配 500 mL 生理盐水', en: 'Make 500 mL of saline' },
    why: {
      zh: '0.9% NaCl 是最常见的等渗溶液，称多少、定容到多少一步算出。',
      en: '0.9% NaCl is the standard isotonic solution — how much to weigh, and to what volume.',
    },
    inputs: { formula: 'NaCl', molarity: 0.154, volumeMl: 500 },
  },
  {
    tab: 'dilute',
    title: { zh: '把 1 M 母液稀释到 0.1 M', en: 'Dilute 1 M stock to 0.1 M' },
    why: {
      zh: 'C₁V₁ = C₂V₂，顺带给出要补多少稀释剂。',
      en: 'C₁V₁ = C₂V₂, plus how much diluent to add.',
    },
    inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
  },
  {
    tab: 'buffer',
    title: { zh: '配 pH 7.4 的磷酸缓冲液', en: 'Make pH 7.4 phosphate buffer' },
    why: {
      zh: 'H-H 方程给出共轭酸碱比例，以及这个 pH 是否在缓冲区内。',
      en: 'Henderson–Hasselbalch gives the acid/base ratio and whether this pH is even buffered.',
    },
    inputs: { preset: 'phosphate2', pKa: 7.2, targetPh: 7.4, totalConc: 0.1, tempC: 25 },
  },
  {
    tab: 'series',
    title: { zh: '10 倍梯度稀释 6 管', en: 'Six-step 10× serial dilution' },
    why: {
      zh: '每管浓度与转移体积，含最后一管的浓度范围。',
      en: 'Each tube’s concentration and transfer volume, down to the last one.',
    },
    inputs: { stockConc: 1, factor: 10, steps: 6, stepVolumeMl: 100 },
  },
  {
    tab: 'ph',
    title: { zh: '0.1 M 醋酸的 pH', en: 'pH of 0.1 M acetic acid' },
    why: {
      zh: '弱酸解离平衡精确解，并与 √(Ka·C) 近似对比。',
      en: 'The exact weak-acid equilibrium, next to the √(Ka·C) approximation.',
    },
    inputs: { kind: 'acid', pk: 4.76, conc: 0.1, charge: 0, salt: 0 },
  },
  {
    tab: 'percent',
    title: { zh: '配 10% (w/v) NaOH 500 mL', en: 'Make 500 mL of 10% (w/v) NaOH' },
    why: {
      zh: '质量体积百分浓度换算成摩尔浓度，以及要不要按纯度折算。',
      en: 'Mass/volume percent converted to molarity, and whether purity matters.',
    },
    inputs: { mode: 'prepare', formula: 'NaOH', percent: 10, volumeMl: 500 },
  },
  {
    tab: 'curve',
    title: { zh: '0.1 M 醋酸用 0.1 M NaOH 滴定', en: 'Titrate 0.1 M acetic acid with 0.1 M NaOH' },
    why: {
      zh: '电荷平衡精确解出的曲线，等当点 pH 与半等当点 pH = pKa 一眼可见。',
      en: 'The charge-balance curve, where the equivalence pH and the half-equivalence pH = pKa are visible.',
    },
    inputs: { acidType: 'weakAcid', pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
  },
  {
    tab: 'reagent',
    title: { zh: '用浓盐酸配 1 M HCl', en: 'Make 1 M HCl from the concentrated acid' },
    why: {
      zh: '按密度与质量分数折算，给出要量取多少毫升浓酸。',
      en: 'Converted through density and mass fraction, to the volume of concentrated acid to measure.',
    },
    inputs: { mode: 'stock', formula: 'HCl', percent: 37, density: 1.19, targetMolarity: 1, targetVolumeMl: 500 },
  },
  {
    tab: 'spectro',
    title: { zh: '由标准曲线反算浓度', en: 'Read a concentration off a calibration curve' },
    why: {
      zh: '五个标准点的线性拟合、R²，以及待测吸光度对应的浓度与不确定度。',
      en: 'A five-point fit with R², then the concentration behind a measured absorbance, with its uncertainty.',
    },
    inputs: {
      mode: 'concentration',
      pathCm: 1,
      reading: 0.412,
      ptsText: '0.1, 0.102\n0.2, 0.205\n0.3, 0.301\n0.4, 0.408\n0.5, 0.499',
    },
  },
  {
    tab: 'lab',
    title: { zh: '配 24 管 PCR 反应体系', en: 'Set up 24 PCR reactions' },
    why: {
      zh: '按每管用量乘以管数再乘过量系数，给出每种组分的分装体积。',
      en: 'Per-reaction volumes scaled by tube count and an excess factor, to what to pipette of each.',
    },
    inputs: {
      mode: 'mix',
      components: [
        { name: '2× Master Mix', perReaction: '10' },
        { name: 'Primer F', perReaction: '0.5' },
        { name: 'Primer R', perReaction: '0.5' },
        { name: 'Template', perReaction: '1' },
      ],
      reactions: 24,
      excessPercent: 10,
    },
  },
  {
    tab: 'colligative',
    title: { zh: '0.1 m 溶液的凝固点下降', en: 'Freezing point of a 0.1 m solution' },
    why: {
      zh: '依数性与范托夫因子 i，并给出该浓度下的渗透压。',
      en: 'The colligative shift with its van’t Hoff factor, and the osmotic pressure at that concentration.',
    },
    inputs: { mode: 'shift', solvent: 'water', molality: 0.1, i: 1 },
  },
  {
    tab: 'bio',
    title: { zh: '测 dsDNA 浓度与纯度', en: 'Measure dsDNA concentration and purity' },
    why: {
      zh: 'A260 换算浓度，A260/A280 判断蛋白污染。',
      en: 'A260 to concentration, and A260/A280 as a protein-contamination check.',
    },
    inputs: { mode: 'nucleic', a260: 0.85, naType: 'dsDNA', pathCm: 1, dilution: 1 },
  },
  {
    tab: 'reaction',
    title: { zh: '配平高锰酸钾氧化反应', en: 'Balance a permanganate oxidation' },
    why: {
      zh: '半反应法配平，给出完整系数与限量试剂。',
      en: 'Half-reaction balancing, to the full set of coefficients.',
    },
    inputs: { mode: 'balance', equation: 'KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2' },
  },
  {
    tab: 'electro',
    title: { zh: '丹尼尔电池的电动势', en: 'EMF of the Daniell cell' },
    why: {
      zh: 'Nernst 方程给出非标准条件下的电动势，以及 ΔG 与 K。',
      en: 'The Nernst equation at non-standard conditions, with ΔG and K.',
    },
    inputs: { mode: 'cell', cathode: 'Cu2+/Cu', anode: 'Zn2+/Zn', tempC: 25 },
  },
  {
    tab: 'convert',
    title: { zh: '把 1 atm 换算成 Pa', en: 'Convert 1 atm to Pa' },
    why: {
      zh: '单位换算保留有效数字，并同时给出常用单位下的值。',
      en: 'Unit conversion with significant figures, showing the value in the units you actually use.',
    },
    inputs: {},
  },
  {
    tab: 'uncertainty',
    title: { zh: '称量与定容的不确定度合成', en: 'Combine weighing and volumetric uncertainty' },
    why: {
      zh: '把天平与容量瓶的分量按传播公式合成，指出哪一项占主导。',
      en: 'The balance and flask contributions propagated together, with the dominant term named.',
    },
    inputs: { mode: 'weigh', formula: 'NaCl', targetMass: 1.461, balanceUnc: 0.0001, volumeMl: 100, volumeUnc: 0.08 },
  },
  {
    tab: 'stats',
    title: { zh: '两组数据的 t 检验', en: 't-test between two sets' },
    why: {
      zh: '给出 t 值、自由度与 p 值，判断两组是否有显著差异。',
      en: 'The t statistic, degrees of freedom and p value, to say whether the sets differ.',
    },
    inputs: { seriesA: '10.2, 10.4, 10.1, 10.3, 10.2', seriesB: '10.8, 11.0, 10.7, 10.9, 11.1' },
  },
  {
    tab: 'analytical',
    title: { zh: 'EDTA 滴定 0.01 M Ca²⁺', en: 'EDTA titration of 0.01 M Ca²⁺' },
    why: {
      zh: '条件稳定常数与 pH 的关系，以及终点时的 pCa。',
      en: 'The conditional formation constant against pH, and pCa at the end point.',
    },
    // Strings, not numbers: `AnalyticalTab` seeds these states with `??`
    // without a `String()` call, so a number would go straight into a
    // controlled input's `value`.
    inputs: { mode: 'edta', metal: 'Ca', edtaPh: '10', edtaConc: '0.01', edtaVol: '25', sampleVol: '25' },
  },
  {
    tab: 'physical',
    title: { zh: '一级反应的速率常数', en: 'Rate constant of a first-order reaction' },
    why: {
      zh: '由浓度-时间数据拟合出 k 与半衰期，并给出 R²。',
      en: 'k and the half-life fitted from concentration against time, with R².',
    },
    /*
     * `kinPoints` is one `time, concentration` pair per line — `parsePairs`
     * reads two columns and reports a line it cannot split, which is how the
     * first version of this scenario surfaced as an error message. `kinTime` is
     * the single time to predict at, not the interval.
     */
    inputs: {
      mode: 'kinetics',
      kinPoints: '0, 1.00\n10, 0.82\n20, 0.67\n30, 0.55\n40, 0.45',
      kinTime: '60',
    },
  },
];

/** The scenario for a tab id, or null. */
export function scenarioFor(tabId) {
  return SCENARIOS.find((s) => s.tab === tabId) ?? null;
}

/** Every tab id that has a scenario. */
export function scenarioTabs() {
  return SCENARIOS.map((s) => s.tab);
}
