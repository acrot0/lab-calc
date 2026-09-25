/**
 * Human labels for the record keys.
 *
 * A stored record's `inputs` and `outputs` are keyed by the names the
 * calculation modules use — `massG`, `volumeMl`, `molarity`. Those are correct
 * for code and wrong for a document: a printed report that says
 * `massG    14.61` is a data dump, and one that says
 * `应称取质量 (g)    14.61` is a lab record. The difference is the whole
 * reason a printed report is worth having.
 *
 * ## Why a map here rather than in the locale files
 *
 * The locale files are keyed by translation key, and these are not translation
 * keys — they are the record's own field names, which are part of the stored
 * data format and must not change when a label is reworded. Keeping them
 * separate means a label can be edited without touching the format, and a new
 * field can be added to a calculation without a matching locale entry.
 *
 * The fallback is the raw key. That is deliberate: an unlabelled field is
 * visible and gets fixed, whereas a field silently dropped from the report is
 * data loss nobody notices. `test/field-labels.test.mjs` asserts that every
 * key the calculation modules actually emit has a label, so the fallback
 * should never be reached in practice.
 */

/** Shared across several tabs, so named once. */
const COMMON = {
  formula: { zh: '化学式', en: 'Formula' },
  acidType: { zh: '酸的种类', en: 'Acid type' },
  reactants: { zh: '反应物', en: 'Reactants' },
  products: { zh: '生成物', en: 'Products' },
  balanced: { zh: '配平后的方程式', en: 'Balanced equation' },
  boilingPoint: { zh: '沸点', en: 'Boiling point' },
  freezingPoint: { zh: '凝固点', en: 'Freezing point' },
  diluteWarning: { zh: '稀释假设提示', en: 'Dilution assumption' },
  particles: { zh: '粒子数', en: 'Particles' },
  linearityWarning: { zh: '线性范围提示', en: 'Linearity warning' },
  gramsPerL: { zh: '克每升', en: 'Grams per litre' },
  series: { zh: '稀释系列', en: 'Dilution series' },
  acidConc: { zh: '酸浓度 (mol/L)', en: 'Acid concentration (mol/L)' },
  baseConc: { zh: '碱浓度 (mol/L)', en: 'Base concentration (mol/L)' },
  epsilon: { zh: '摩尔吸光系数', en: 'Molar absorptivity' },
  pathCm: { zh: '光程 (cm)', en: 'Path length (cm)' },
  ptsText: { zh: '标准点数据', en: 'Standard points' },
  reading: { zh: '测得吸光度', en: 'Measured absorbance' },
  abs: { zh: '吸光度', en: 'Absorbance' },
  fit: { zh: '拟合结果', en: 'Fitted curve' },
  pred: { zh: '预测浓度', en: 'Predicted concentration' },
  analyteConc: { zh: '待测物浓度 (mol/L)', en: 'Analyte concentration (mol/L)' },
  analyteVolumeMl: { zh: '待测物体积 (mL)', en: 'Analyte volume (mL)' },
  titrantConc: { zh: '滴定剂浓度 (mol/L)', en: 'Titrant concentration (mol/L)' },
  solvent: { zh: '溶剂', en: 'Solvent' },
  i: { zh: "van't Hoff 因子 i", en: "van 't Hoff factor i" },
  solventKg: { zh: '溶剂质量 (kg)', en: 'Solvent mass (kg)' },
  equation: { zh: '化学方程式', en: 'Chemical equation' },
  percentYield: { zh: '产率', en: 'Percent yield' },
  molarity: { zh: '摩尔浓度 (mol/L)', en: 'Molarity (mol/L)' },
  volumeMl: { zh: '体积 (mL)', en: 'Volume (mL)' },
  targetVolumeMl: { zh: '目标体积 (mL)', en: 'Target volume (mL)' },
  targetMolarity: { zh: '目标浓度 (mol/L)', en: 'Target concentration (mol/L)' },
  massG: { zh: '质量 (g)', en: 'Mass (g)' },
  molarMass: { zh: '摩尔质量 (g/mol)', en: 'Molar mass (g/mol)' },
  moles: { zh: '物质的量 (mol)', en: 'Amount (mol)' },
  finalVolumeMl: { zh: '定容体积 (mL)', en: 'Final volume (mL)' },
  stockMolarity: { zh: '母液浓度 (mol/L)', en: 'Stock concentration (mol/L)' },
  stockVolumeMl: { zh: '母液体积 (mL)', en: 'Stock volume (mL)' },
  percent: { zh: '质量分数 (%)', en: 'Mass percent (%)' },
  density: { zh: '密度 (g/mL)', en: 'Density (g/mL)' },
  purity: { zh: '纯度', en: 'Purity' },
  pk: { zh: 'pKa / pKb', en: 'pKa / pKb' },
  pka: { zh: 'pKa', en: 'pKa' },
  // The calc modules use `pKa` (capital A); `pka` above is the lowercased
  // form some older records carry. Both are labelled so neither prints raw.
  pKa: { zh: 'pKa', en: 'pKa' },
  conc: { zh: '浓度 (mol/L)', en: 'Concentration (mol/L)' },
  ph: { zh: 'pH', en: 'pH' },
  poh: { zh: 'pOH', en: 'pOH' },
  kind: { zh: '类型', en: 'Type' },
  ratio: { zh: '配比', en: 'Ratio' },
  dilutionFactor: { zh: '稀释倍数', en: 'Dilution factor' },
  steps: { zh: '梯度级数', en: 'Steps' },
  temperatureC: { zh: '温度 (°C)', en: 'Temperature (°C)' },
  temperatureK: { zh: '温度 (K)', en: 'Temperature (K)' },
  // The colligative and electrochemistry tabs emit `tempC`, not
  // `temperatureC`. Both are labelled: the two names are in the stored format
  // and renaming one would invalidate every record already saved.
  tempC: { zh: '温度 (°C)', en: 'Temperature (°C)' },
  pressure: { zh: '压力', en: 'Pressure' },
  wavelength: { zh: '波长 (nm)', en: 'Wavelength (nm)' },
  absorbance: { zh: '吸光度', en: 'Absorbance' },
  pathLength: { zh: '光程 (cm)', en: 'Path length (cm)' },
  extinction: { zh: '摩尔吸光系数', en: 'Molar absorptivity' },
  concentration: { zh: '浓度', en: 'Concentration' },
  volume: { zh: '体积', en: 'Volume' },
  mass: { zh: '质量', en: 'Mass' },
  time: { zh: '时间', en: 'Time' },
  timeH: { zh: '时间 (h)', en: 'Time (h)' },
  timeMin: { zh: '时间 (min)', en: 'Time (min)' },
  cfu: { zh: '菌落数 (CFU)', en: 'Colonies (CFU)' },
  dilution: { zh: '稀释度', en: 'Dilution' },
  plateVolumeMl: { zh: '涂布体积 (mL)', en: 'Plated volume (mL)' },
  a260: { zh: 'A260', en: 'A260' },
  a280: { zh: 'A280', en: 'A280' },
  purityRatio: { zh: 'A260/A280', en: 'A260/A280' },
  iFactor: { zh: "van't Hoff 因子 i", en: "van't Hoff factor i" },
  molality: { zh: '质量摩尔浓度 (mol/kg)', en: 'Molality (mol/kg)' },
  kf: { zh: 'Kf (K·kg/mol)', en: 'Kf (K·kg/mol)' },
  kb: { zh: 'Kb (K·kg/mol)', en: 'Kb (K·kg/mol)' },
  deltaTf: { zh: '凝固点降低 (K)', en: 'Freezing-point depression (K)' },
  deltaTb: { zh: '沸点升高 (K)', en: 'Boiling-point elevation (K)' },
  freezingPointC: { zh: '凝固点 (°C)', en: 'Freezing point (°C)' },
  boilingPointC: { zh: '沸点 (°C)', en: 'Boiling point (°C)' },
  osmoticPressure: { zh: '渗透压 (atm)', en: 'Osmotic pressure (atm)' },
  limiting: { zh: '限量试剂', en: 'Limiting reagent' },
  excess: { zh: '过量试剂', en: 'Excess reagent' },
  yieldG: { zh: '理论产量 (g)', en: 'Theoretical yield (g)' },
  extent: { zh: '反应进度 (mol)', en: 'Extent of reaction (mol)' },
  e0: { zh: '标准电动势 E° (V)', en: 'Standard EMF E° (V)' },
  ecell: { zh: '电池电动势 E (V)', en: 'Cell EMF E (V)' },
  n: { zh: '电子数 n', en: 'Electrons n' },
  q: { zh: '反应商 Q', en: 'Reaction quotient Q' },
  deltaG: { zh: 'ΔG (kJ/mol)', en: 'ΔG (kJ/mol)' },
  /*
   * The Nernst and colligative outputs.
   *
   * Found by extending the coverage test's call list to those two modules —
   * the same gap that hid `tempC`. Every one of these was reaching the printed
   * report and the spreadsheet header as a bare code identifier.
   *
   * `e` is the cell potential in the Nernst result and `e0` the standard one;
   * they are different quantities and get different labels.
   */
  e: { zh: '电池电动势 E (V)', en: 'Cell potential E (V)' },
  tempK: { zh: '温度 (K)', en: 'Temperature (K)' },
  logQ: { zh: 'lg Q', en: 'log Q' },
  slope: { zh: '能斯特斜率 (V)', en: 'Nernst slope (V)' },
  deltaGKJ: { zh: 'ΔG (kJ/mol)', en: 'ΔG (kJ/mol)' },
  equilibriumK: { zh: '平衡常数 K', en: 'Equilibrium constant K' },
  log10K: { zh: 'lg K', en: 'log K' },
  spontaneous: { zh: '是否自发', en: 'Spontaneous' },
  osmolarity: { zh: '渗透浓度 (osmol/L)', en: 'Osmolarity (osmol/L)' },
  atm: { zh: '渗透压 (atm)', en: 'Osmotic pressure (atm)' },
  kPa: { zh: '渗透压 (kPa)', en: 'Osmotic pressure (kPa)' },
  anode: { zh: '阳极', en: 'Anode' },
  cathode: { zh: '阴极', en: 'Cathode' },
  from: { zh: '原单位', en: 'From unit' },
  to: { zh: '目标单位', en: 'To unit' },
  value: { zh: '数值', en: 'Value' },
  result: { zh: '结果', en: 'Result' },
  unit: { zh: '单位', en: 'Unit' },
  element: { zh: '元素', en: 'Element' },
  gasConstant: { zh: '气体常数', en: 'Gas constant' },
  volumeMlFinal: { zh: '最终体积 (mL)', en: 'Final volume (mL)' },
  waterMl: { zh: '加水体积 (mL)', en: 'Water added (mL)' },
  totalVolumeMl: { zh: '总体积 (mL)', en: 'Total volume (mL)' },

  /* --- Added after the coverage test ran the modules and listed what was
     actually missing. Every one of these was reaching a printed report as a
     raw camelCase key. --- */
  stockConc: { zh: '母液浓度', en: 'Stock concentration' },
  targetConc: { zh: '目标浓度', en: 'Target concentration' },
  targetPh: { zh: '目标 pH', en: 'Target pH' },
  totalConc: { zh: '总浓度 (mol/L)', en: 'Total concentration (mol/L)' },
  diluentVolumeMl: { zh: '稀释剂体积 (mL)', en: 'Diluent volume (mL)' },
  stepVolumeMl: { zh: '每级体积 (mL)', en: 'Volume per step (mL)' },
  foldDilution: { zh: '稀释倍数', en: 'Fold dilution' },
  step: { zh: '级数', en: 'Step' },
  volumeUl: { zh: '体积 (µL)', en: 'Volume (µL)' },
  titrantVolumeMl: { zh: '滴定剂体积 (mL)', en: 'Titrant volume (mL)' },
  molesAnalyte: { zh: '待测物物质的量 (mol)', en: 'Analyte amount (mol)' },
  colonies: { zh: '菌落数', en: 'Colony count' },
  platedVolumeMl: { zh: '涂布体积 (mL)', en: 'Plated volume (mL)' },
  components: { zh: '组分', en: 'Components' },
  reactions: { zh: '反应', en: 'Reactions' },
  excessPercent: { zh: '过量百分比 (%)', en: 'Excess (%)' },
  factor: { zh: '倍数', en: 'Factor' },
  lengthBp: { zh: '碱基对数 (bp)', en: 'Length (bp)' },
  mode: { zh: '模式', en: 'Mode' },
  inRange: { zh: '在范围内', en: 'In range' },
  solubilityWarning: { zh: '溶解度提示', en: 'Solubility note' },
  equivalenceMl: { zh: '等当点体积 (mL)', en: 'Equivalence volume (mL)' },
  equivalencePh: { zh: '等当点 pH', en: 'Equivalence pH' },
  dilutionRatio: { zh: '稀释比', en: 'Dilution ratio' },
  finalConc: { zh: '终浓度', en: 'Final concentration' },
};


/**
 * The label for a field, in the given locale.
 *
 * Falls back to the raw key so a new field is visible in the report rather
 * than silently absent — see the note above.
 */
export function fieldLabel(key, locale = 'zh') {
  const entry = COMMON[key];
  if (!entry) return key;
  return locale === 'zh' ? entry.zh : entry.en;
}

/** Every key this module knows a label for. Used by the coverage test. */
export const LABELLED_KEYS = Object.keys(COMMON);

/**
 * Keys whose correct label *is* the key.
 *
 * `pKa` is the name of the quantity in both languages — there is no Chinese
 * word for it, and inventing one would be worse than the symbol. The coverage
 * test asserts a label differs from its key, because a label identical to the
 * key is usually the fallback wearing a costume; these are the legitimate
 * exceptions, listed here so the rule stays strict for everything else.
 */
export const SYMBOL_KEYS = new Set(['pKa', 'pka', 'ph', 'poh', 'a260', 'a280', 'e0', 'n', 'q']);
