/**
 * The dimension and unit registry — the single source of truth.
 *
 * ## Why this file replaced three tables
 *
 * The first version had three parallel tables in `units.mjs`: `DIMENSIONS`
 * (base unit per dimension), `EXPONENTS` (the exponent vector per dimension),
 * and `UNITS` (a flat symbol → {dim, factor} map). Adding one unit meant
 * editing one table, but adding one *dimension* meant editing three, and
 * nothing stopped the three from disagreeing — a dimension could have a base
 * unit in one table, a vector in another, and no units at all in the third.
 * Three tests existed purely to catch those disagreements, which is a sign the
 * shape was wrong: the invariants should be unrepresentable, not merely
 * checked.
 *
 * Here a dimension declares everything about itself in one place — its base,
 * its vector, its label, and its units — and `units.mjs` derives the old
 * tables from it. There is now one place to add a unit and one place to add a
 * dimension, and a dimension cannot be half-declared.
 *
 * ## The vector order
 *
 * `[M, L, T, N, I, K]` — mass, length, time, amount, electric current,
 * thermodynamic temperature. These are the seven SI base quantities minus
 * luminous intensity, which nothing in a chemistry lab measures.
 *
 * ## What is deliberately NOT a separate dimension
 *
 * Three pairs are dimensionally identical, and inventing separate dimensions
 * for them would make the algebra wrong rather than richer:
 *
 *   - **density** and mass concentration are both M·L⁻³. `g/mL` and `g/L`
 *     differ by a factor of 1000, not by a dimension.
 *   - **Bq** and **Hz** are both T⁻¹. A decay rate and a frequency are the same
 *     kind of quantity; the unit is named differently for the reader, not for
 *     the arithmetic.
 *   - **Gy** and **Sv** are both L²·T⁻². Absorbed dose and equivalent dose
 *     differ by a radiation weighting factor, which is a property of the
 *     radiation, not of the quantity.
 *
 * Each is handled by putting both units in one dimension, which is what a
 * converter needs and what the exponent algebra already does correctly.
 *
 * ## `expr: false`
 *
 * A few dimensions exist for the converter but must not enter expression
 * algebra. Angle is the clear case: a radian is genuinely dimensionless, so
 * giving it a vector of all zeroes would make `dimensionFromExponents` label
 * every plain number an angle. Marking it `expr: false` keeps it out of the
 * vector lookup while still letting the converter offer it.
 *
 * Pure data. No imports, no logic, nothing that can fail at load.
 */

/**
 * One dimension.
 *
 * @typedef {object} Dimension
 * @property {string}  id       Stable key, used in stored records.
 * @property {string}  base     Display base unit — what a result is reported in.
 * @property {string}  siBase   The unit `factor` is measured against.
 * @property {number[]|null} exp Exponent vector, or null when `expr` is false.
 * @property {boolean} [expr]   False to exclude from expression algebra.
 * @property {boolean} [affine] True for scales with an offset (temperature).
 * @property {{zh:string,en:string}} label
 * @property {{zh:string,en:string}} [note] Shown in the converter's help.
 * @property {Array} units
 */

/**
 * A unit.
 *
 * @typedef {object} Unit
 * @property {string} sym    The symbol as typed and displayed.
 * @property {number} [factor] Multiplier to `siBase`. Omitted for affine units.
 * @property {{zh:string,en:string}} name Spelled out, for the picker.
 * @property {string[]} [aka] Alternative spellings accepted in expressions.
 */

/** @type {Dimension[]} */
export const REGISTRY = [
  /* ---------------------------------------------------------------------
   * Mass — SI base kg, displayed in g
   * ------------------------------------------------------------------ */
  {
    id: 'mass',
    base: 'g',
    siBase: 'kg',
    exp: [1, 0, 0, 0, 0, 0],
    label: { zh: '质量', en: 'Mass' },
    units: [
      { sym: 'kg', factor: 1, name: { zh: '千克', en: 'kilogram' } },
      { sym: 'g', factor: 1e-3, name: { zh: '克', en: 'gram' } },
      { sym: 'mg', factor: 1e-6, name: { zh: '毫克', en: 'milligram' } },
      { sym: 'ug', factor: 1e-9, name: { zh: '微克', en: 'microgram' }, aka: ['µg', 'mcg'] },
      { sym: 'ng', factor: 1e-12, name: { zh: '纳克', en: 'nanogram' } },
      { sym: 'pg', factor: 1e-15, name: { zh: '皮克', en: 'picogram' } },
      { sym: 'fg', factor: 1e-18, name: { zh: '飞克', en: 'femtogram' } },
      { sym: 't', factor: 1e3, name: { zh: '吨', en: 'tonne' } },
      { sym: 'lb', factor: 0.45359237, name: { zh: '磅', en: 'pound' } },
      { sym: 'oz', factor: 0.028349523125, name: { zh: '盎司', en: 'ounce' } },
      { sym: 'gr', factor: 6.479891e-5, name: { zh: '格令', en: 'grain' } },
      { sym: 'Da', factor: 1.66053906660e-27, name: { zh: '道尔顿', en: 'dalton' }, aka: ['u', 'amu'] },
      /*
       * Chinese market units (市制).
       *
       * The mainland's statutory values, which are the metric ones rounded to a
       * round decimal: 1 斤 = 500 g exactly, 1 两 = 50 g, 1 钱 = 5 g. These are
       * NOT the Qing or Republican values (1 斤 ≈ 596.8 g, 1 两 ≈ 37.3 g) and
       * not the Taiwanese 台斤 (600 g) — a conversion that silently used one of
       * those would be wrong by 20% in a way nobody could see.
       *
       * They are labelled in Chinese only where the English is a transliteration
       * (`jin`, `liang`) rather than a translation, because a reader of the
       * English UI is more likely to recognise the romanisation than a gloss
       * like "catty" — which is real but obscure.
       *
       * The factors are in **kg**, this dimension's `siBase`, not in grams —
       * matching `lb` at 0.45359237 rather than the 500 the unit is defined as.
       * Written as 0.5 and not 500: the first attempt used grams, and every
       * conversion came out 1000× too large while looking entirely plausible.
       */
      { sym: 'jin', factor: 0.5, name: { zh: '斤', en: 'jin (500 g)' }, aka: ['市斤'] },
      { sym: 'liang', factor: 0.05, name: { zh: '两', en: 'liang (50 g)' }, aka: ['市两'] },
      { sym: 'qian', factor: 0.005, name: { zh: '钱', en: 'qian (5 g)' }, aka: ['市钱'] },
    ],
  },

  /* ---------------------------------------------------------------------
   * Volume — SI base m³, displayed in L
   * ------------------------------------------------------------------ */
  {
    id: 'volume',
    base: 'L',
    siBase: 'm3',
    exp: [0, 3, 0, 0, 0, 0],
    label: { zh: '体积', en: 'Volume' },
    units: [
      { sym: 'm3', factor: 1, name: { zh: '立方米', en: 'cubic metre' } },
      { sym: 'L', factor: 1e-3, name: { zh: '升', en: 'litre' }, aka: ['l'] },
      { sym: 'dL', factor: 1e-4, name: { zh: '分升', en: 'decilitre' } },
      { sym: 'cL', factor: 1e-5, name: { zh: '厘升', en: 'centilitre' } },
      { sym: 'mL', factor: 1e-6, name: { zh: '毫升', en: 'millilitre' }, aka: ['ml'] },
      { sym: 'uL', factor: 1e-9, name: { zh: '微升', en: 'microlitre' }, aka: ['µL', 'ul'] },
      { sym: 'nL', factor: 1e-12, name: { zh: '纳升', en: 'nanolitre' } },
      { sym: 'pL', factor: 1e-15, name: { zh: '皮升', en: 'picolitre' } },
      { sym: 'fL', factor: 1e-18, name: { zh: '飞升', en: 'femtolitre' } },
      { sym: 'cm3', factor: 1e-6, name: { zh: '立方厘米', en: 'cubic centimetre' }, aka: ['cc'] },
      { sym: 'mm3', factor: 1e-9, name: { zh: '立方毫米', en: 'cubic millimetre' } },
      { sym: 'dm3', factor: 1e-3, name: { zh: '立方分米', en: 'cubic decimetre' } },
      // The two gallons are different volumes and a lab in the UK means the
      // second. Kept apart rather than aliased.
      { sym: 'gal', factor: 3.785411784e-3, name: { zh: '加仑（美）', en: 'gallon (US)' } },
      { sym: 'galUK', factor: 4.54609e-3, name: { zh: '加仑（英）', en: 'gallon (UK)' }, aka: ['galImp'] },
      { sym: 'qt', factor: 9.46352946e-4, name: { zh: '夸脱（美）', en: 'quart (US)' } },
      { sym: 'pt', factor: 4.73176473e-4, name: { zh: '品脱（美）', en: 'pint (US)' } },
      { sym: 'floz', factor: 2.95735295625e-5, name: { zh: '液盎司（美）', en: 'fluid ounce (US)' } },
      { sym: 'tbsp', factor: 1.478676478125e-5, name: { zh: '汤匙', en: 'tablespoon' } },
      { sym: 'tsp', factor: 4.92892159375e-6, name: { zh: '茶匙', en: 'teaspoon' } },
      { sym: 'cup', factor: 2.365882365e-4, name: { zh: '杯', en: 'cup' } },
      { sym: 'bbl', factor: 0.158987294928, name: { zh: '桶（石油）', en: 'barrel (oil)' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Amount of substance — base mol
   * ------------------------------------------------------------------ */
  {
    id: 'amount',
    base: 'mol',
    siBase: 'mol',
    exp: [0, 0, 0, 1, 0, 0],
    label: { zh: '物质的量', en: 'Amount of substance' },
    units: [
      { sym: 'mol', factor: 1, name: { zh: '摩尔', en: 'mole' } },
      { sym: 'kmol', factor: 1e3, name: { zh: '千摩尔', en: 'kilomole' } },
      { sym: 'mmol', factor: 1e-3, name: { zh: '毫摩尔', en: 'millimole' } },
      { sym: 'umol', factor: 1e-6, name: { zh: '微摩尔', en: 'micromole' }, aka: ['µmol'] },
      { sym: 'nmol', factor: 1e-9, name: { zh: '纳摩尔', en: 'nanomole' } },
      { sym: 'pmol', factor: 1e-12, name: { zh: '皮摩尔', en: 'picomole' } },
      { sym: 'fmol', factor: 1e-15, name: { zh: '飞摩尔', en: 'femtomole' } },
      { sym: 'eq', factor: 1, name: { zh: '当量', en: 'equivalent' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Molarity — mol/m³, displayed in M
   *
   * NOT the same dimension as mass concentration. mol/L is [0,-3,0,1,0,0] and
   * g/L is [1,-3,0,0,0,0]; merging them behind a "family" tag let a factor
   * table claim both had factor 1 against one base, which is true of only one.
   * ------------------------------------------------------------------ */
  {
    id: 'molarity',
    base: 'M',
    siBase: 'mol/m3',
    exp: [0, -3, 0, 1, 0, 0],
    label: { zh: '摩尔浓度', en: 'Molarity' },
    note: { zh: '每升溶液中的物质的量', en: 'Amount of solute per litre of solution' },
    units: [
      // 1 M is 1 mol/L = 1000 mol/m³, so M is the larger unit and its factor
      // is 1000. Getting this backwards made every molarity out by 10³.
      { sym: 'M', factor: 1e3, name: { zh: '摩尔每升', en: 'molar' } },
      { sym: 'mM', factor: 1, name: { zh: '毫摩尔每升', en: 'millimolar' } },
      { sym: 'uM', factor: 1e-3, name: { zh: '微摩尔每升', en: 'micromolar' }, aka: ['µM'] },
      { sym: 'nM', factor: 1e-6, name: { zh: '纳摩尔每升', en: 'nanomolar' } },
      { sym: 'pM', factor: 1e-9, name: { zh: '皮摩尔每升', en: 'picomolar' } },
      { sym: 'fM', factor: 1e-12, name: { zh: '飞摩尔每升', en: 'femtomolar' } },
      { sym: 'mol/L', factor: 1e3, name: { zh: '摩尔每升', en: 'mole per litre' } },
      { sym: 'mmol/L', factor: 1, name: { zh: '毫摩尔每升', en: 'millimole per litre' } },
      { sym: 'umol/L', factor: 1e-3, name: { zh: '微摩尔每升', en: 'micromole per litre' }, aka: ['µmol/L'] },
      { sym: 'mol/m3', factor: 1, name: { zh: '摩尔每立方米', en: 'mole per cubic metre' } },
      // Normality: equivalents per litre. Equal to molarity times the number of
      // equivalents per mole, which is a property of the substance and not
      // something this converter can know — so it is offered as a unit of the
      // same dimension and the factor is 1 equivalent per mole.
      { sym: 'N', factor: 1e3, name: { zh: '当量浓度', en: 'normality' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Mass concentration — kg/m³, displayed in g/L
   *
   * This is also what a density is. g/mL and g/L differ by 1000, not by a
   * dimension, so density units live here rather than in a table of their own.
   * ------------------------------------------------------------------ */
  {
    id: 'massConcentration',
    base: 'g/L',
    siBase: 'kg/m3',
    exp: [1, -3, 0, 0, 0, 0],
    label: { zh: '质量浓度', en: 'Mass concentration' },
    note: { zh: '也用于密度：g/mL 与 g/L 是同一量纲', en: 'Also density: g/mL and g/L are one dimension' },
    units: [
      // 1 g/L is 1e-3 kg / 1e-3 m³ = exactly 1 kg/m³, which is why g/L and
      // mg/mL share a factor. Not a coincidence — it is why both are common.
      { sym: 'g/L', factor: 1, name: { zh: '克每升', en: 'gram per litre' } },
      { sym: 'mg/L', factor: 1e-3, name: { zh: '毫克每升', en: 'milligram per litre' } },
      { sym: 'ug/L', factor: 1e-6, name: { zh: '微克每升', en: 'microgram per litre' }, aka: ['µg/L'] },
      { sym: 'ng/L', factor: 1e-9, name: { zh: '纳克每升', en: 'nanogram per litre' } },
      { sym: 'pg/L', factor: 1e-12, name: { zh: '皮克每升', en: 'picogram per litre' } },
      { sym: 'mg/mL', factor: 1, name: { zh: '毫克每毫升', en: 'milligram per millilitre' } },
      { sym: 'ug/mL', factor: 1e-3, name: { zh: '微克每毫升', en: 'microgram per millilitre' }, aka: ['µg/mL'] },
      { sym: 'ng/mL', factor: 1e-6, name: { zh: '纳克每毫升', en: 'nanogram per millilitre' } },
      { sym: 'pg/mL', factor: 1e-9, name: { zh: '皮克每毫升', en: 'picogram per millilitre' } },
      { sym: 'kg/L', factor: 1e3, name: { zh: '千克每升', en: 'kilogram per litre' } },
      { sym: 'g/mL', factor: 1e3, name: { zh: '克每毫升', en: 'gram per millilitre' } },
      { sym: 'g/cm3', factor: 1e3, name: { zh: '克每立方厘米', en: 'gram per cubic centimetre' } },
      { sym: 'kg/m3', factor: 1, name: { zh: '千克每立方米', en: 'kilogram per cubic metre' } },
      { sym: 'g/dL', factor: 10, name: { zh: '克每分升', en: 'gram per decilitre' } },
      { sym: 'mg/dL', factor: 1e-2, name: { zh: '毫克每分升', en: 'milligram per decilitre' } },
      { sym: 'ug/dL', factor: 1e-5, name: { zh: '微克每分升', en: 'microgram per decilitre' }, aka: ['µg/dL'] },
      // %w/v is 1 g per 100 mL, which is 10 g/L — a mass concentration and
      // nothing else. ppm and ppb are the same statement scaled down.
      { sym: '%w/v', factor: 10, name: { zh: '质量体积百分比', en: 'weight per volume percent' } },
      { sym: 'ppm', factor: 1e-3, name: { zh: '百万分之一', en: 'parts per million' } },
      { sym: 'ppb', factor: 1e-6, name: { zh: '十亿分之一', en: 'parts per billion' } },
      { sym: 'ppt', factor: 1e-9, name: { zh: '万亿分之一', en: 'parts per trillion' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Molality — mol/kg
   * ------------------------------------------------------------------ */
  {
    id: 'molality',
    base: 'mol/kg',
    siBase: 'mol/kg',
    exp: [-1, 0, 0, 1, 0, 0],
    label: { zh: '质量摩尔浓度', en: 'Molality' },
    note: { zh: '每千克溶剂中的物质的量，不随温度变化', en: 'Per kilogram of solvent; unlike molarity it does not change with temperature' },
    units: [
      { sym: 'mol/kg', factor: 1, name: { zh: '摩尔每千克', en: 'mole per kilogram' } },
      { sym: 'mmol/kg', factor: 1e-3, name: { zh: '毫摩尔每千克', en: 'millimole per kilogram' } },
      { sym: 'umol/kg', factor: 1e-6, name: { zh: '微摩尔每千克', en: 'micromole per kilogram' }, aka: ['µmol/kg'] },
    ],
  },

  /* ---------------------------------------------------------------------
   * Length — base m
   * ------------------------------------------------------------------ */
  {
    id: 'length',
    base: 'm',
    siBase: 'm',
    exp: [0, 1, 0, 0, 0, 0],
    label: { zh: '长度', en: 'Length' },
    units: [
      { sym: 'km', factor: 1e3, name: { zh: '千米', en: 'kilometre' } },
      { sym: 'm', factor: 1, name: { zh: '米', en: 'metre' } },
      { sym: 'dm', factor: 0.1, name: { zh: '分米', en: 'decimetre' } },
      { sym: 'cm', factor: 0.01, name: { zh: '厘米', en: 'centimetre' } },
      { sym: 'mm', factor: 1e-3, name: { zh: '毫米', en: 'millimetre' } },
      { sym: 'um', factor: 1e-6, name: { zh: '微米', en: 'micrometre' }, aka: ['µm', 'micron'] },
      { sym: 'nm', factor: 1e-9, name: { zh: '纳米', en: 'nanometre' } },
      { sym: 'pm', factor: 1e-12, name: { zh: '皮米', en: 'picometre' } },
      { sym: 'fm', factor: 1e-15, name: { zh: '飞米', en: 'femtometre' } },
      // Ångström is not SI, but it is the unit bond lengths are quoted in. A
      // chemistry tool that makes you convert to nanometres gets put down.
      { sym: 'A', factor: 1e-10, name: { zh: '埃', en: 'ångström' }, aka: ['Å', 'angstrom'] },
      { sym: 'in', factor: 0.0254, name: { zh: '英寸', en: 'inch' } },
      { sym: 'ft', factor: 0.3048, name: { zh: '英尺', en: 'foot' } },
      { sym: 'yd', factor: 0.9144, name: { zh: '码', en: 'yard' } },
      { sym: 'mi', factor: 1609.344, name: { zh: '英里', en: 'mile' } },
      { sym: 'nmi', factor: 1852, name: { zh: '海里', en: 'nautical mile' } },
      /*
       * Chinese market units (市制), mainland statutory values.
       *
       * 1 尺 = 1/3 m exactly and 1 寸 = 1/30 m, so the two are consistent with
       * each other and with 丈 (not listed — nothing in a lab measures in 丈).
       * 1 里 = 500 m, which is also the mainland value and not the imperial
       * mile it resembles in name only.
       */
      { sym: 'chi', factor: 1 / 3, name: { zh: '尺', en: 'chi (1/3 m)' }, aka: ['市尺'] },
      { sym: 'cun', factor: 1 / 30, name: { zh: '寸', en: 'cun (1/30 m)' }, aka: ['市寸'] },
      { sym: 'li', factor: 500, name: { zh: '里', en: 'li (500 m)' }, aka: ['市里'] },
    ],
  },

  /* ---------------------------------------------------------------------
   * Area — base m²
   * ------------------------------------------------------------------ */
  {
    id: 'area',
    base: 'm2',
    siBase: 'm2',
    exp: [0, 2, 0, 0, 0, 0],
    label: { zh: '面积', en: 'Area' },
    units: [
      { sym: 'm2', factor: 1, name: { zh: '平方米', en: 'square metre' } },
      { sym: 'dm2', factor: 0.01, name: { zh: '平方分米', en: 'square decimetre' } },
      { sym: 'cm2', factor: 1e-4, name: { zh: '平方厘米', en: 'square centimetre' } },
      { sym: 'mm2', factor: 1e-6, name: { zh: '平方毫米', en: 'square millimetre' } },
      { sym: 'um2', factor: 1e-12, name: { zh: '平方微米', en: 'square micrometre' }, aka: ['µm2'] },
      { sym: 'nm2', factor: 1e-18, name: { zh: '平方纳米', en: 'square nanometre' } },
      { sym: 'ha', factor: 1e4, name: { zh: '公顷', en: 'hectare' } },
      { sym: 'in2', factor: 6.4516e-4, name: { zh: '平方英寸', en: 'square inch' } },
      { sym: 'ft2', factor: 0.09290304, name: { zh: '平方英尺', en: 'square foot' } },
      /*
       * 1 亩 = 60 平方丈 = 666⅔ m² exactly, which is 10000/15.
       *
       * Written as the fraction rather than as 666.6666… so the value is exact:
       * a lab converting a plot area is not a common case, but a rounded
       * constant here would be a wrong number in the table forever, and the
       * exact form costs nothing.
       */
      { sym: 'mu', factor: 10000 / 15, name: { zh: '亩', en: 'mu (666⅔ m²)' }, aka: ['市亩'] },
    ],
  },

  /* ---------------------------------------------------------------------
   * Time — base s
   * ------------------------------------------------------------------ */
  {
    id: 'time',
    base: 's',
    siBase: 's',
    exp: [0, 0, 1, 0, 0, 0],
    label: { zh: '时间', en: 'Time' },
    units: [
      { sym: 'ns', factor: 1e-9, name: { zh: '纳秒', en: 'nanosecond' } },
      { sym: 'us', factor: 1e-6, name: { zh: '微秒', en: 'microsecond' }, aka: ['µs'] },
      { sym: 'ms', factor: 1e-3, name: { zh: '毫秒', en: 'millisecond' } },
      { sym: 's', factor: 1, name: { zh: '秒', en: 'second' } },
      { sym: 'min', factor: 60, name: { zh: '分钟', en: 'minute' } },
      { sym: 'h', factor: 3600, name: { zh: '小时', en: 'hour' } },
      { sym: 'd', factor: 86400, name: { zh: '天', en: 'day' } },
      { sym: 'wk', factor: 604800, name: { zh: '周', en: 'week' } },
      { sym: 'yr', factor: 31557600, name: { zh: '年（儒略）', en: 'year (Julian)' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Temperature — affine, no factor table
   *
   * The one dimension whose units cannot be expressed as a multiplier: 0 °C is
   * 273.15 K, not 0 K. Fitting it into a factor would make `convert(0,'C','K')`
   * return 0 — a wrong answer that looks like a right one.
   * ------------------------------------------------------------------ */
  {
    id: 'temperature',
    base: 'K',
    siBase: 'K',
    exp: [0, 0, 0, 0, 0, 1],
    affine: true,
    label: { zh: '温度', en: 'Temperature' },
    units: [
      { sym: 'K', factor: 1, name: { zh: '开尔文', en: 'kelvin' } },
      { sym: 'C', factor: 1, name: { zh: '摄氏度', en: 'degree Celsius' }, aka: ['°C', 'degC'] },
      { sym: 'F', factor: 1, name: { zh: '华氏度', en: 'degree Fahrenheit' }, aka: ['°F', 'degF'] },
      { sym: 'R', factor: 1, name: { zh: '兰氏度', en: 'degree Rankine' }, aka: ['°R'] },
    ],
  },

  /* ---------------------------------------------------------------------
   * Pressure — base Pa
   * ------------------------------------------------------------------ */
  {
    id: 'pressure',
    base: 'Pa',
    siBase: 'Pa',
    exp: [1, -1, -2, 0, 0, 0],
    label: { zh: '压强', en: 'Pressure' },
    units: [
      { sym: 'Pa', factor: 1, name: { zh: '帕斯卡', en: 'pascal' } },
      { sym: 'hPa', factor: 100, name: { zh: '百帕', en: 'hectopascal' } },
      { sym: 'kPa', factor: 1e3, name: { zh: '千帕', en: 'kilopascal' } },
      { sym: 'MPa', factor: 1e6, name: { zh: '兆帕', en: 'megapascal' } },
      { sym: 'GPa', factor: 1e9, name: { zh: '吉帕', en: 'gigapascal' } },
      { sym: 'bar', factor: 1e5, name: { zh: '巴', en: 'bar' } },
      { sym: 'mbar', factor: 100, name: { zh: '毫巴', en: 'millibar' } },
      { sym: 'atm', factor: 101325, name: { zh: '标准大气压', en: 'standard atmosphere' } },
      // mmHg and torr differ by 1 part in 7 million — mmHg is defined against
      // mercury density, torr is exactly 1/760 atm. Kept apart because a
      // physics text and a physiology text mean different things.
      { sym: 'mmHg', factor: 133.322387415, name: { zh: '毫米汞柱', en: 'millimetre of mercury' } },
      { sym: 'torr', factor: 133.322368421, name: { zh: '托', en: 'torr' } },
      { sym: 'psi', factor: 6894.757293168, name: { zh: '磅每平方英寸', en: 'pound per square inch' } },
      { sym: 'inHg', factor: 3386.389, name: { zh: '英寸汞柱', en: 'inch of mercury' } },
      { sym: 'cmH2O', factor: 98.0665, name: { zh: '厘米水柱', en: 'centimetre of water' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Energy — base J
   * ------------------------------------------------------------------ */
  {
    id: 'energy',
    base: 'J',
    siBase: 'J',
    exp: [1, 2, -2, 0, 0, 0],
    label: { zh: '能量', en: 'Energy' },
    units: [
      { sym: 'J', factor: 1, name: { zh: '焦耳', en: 'joule' } },
      { sym: 'mJ', factor: 1e-3, name: { zh: '毫焦', en: 'millijoule' } },
      { sym: 'uJ', factor: 1e-6, name: { zh: '微焦', en: 'microjoule' }, aka: ['µJ'] },
      { sym: 'kJ', factor: 1e3, name: { zh: '千焦', en: 'kilojoule' } },
      { sym: 'MJ', factor: 1e6, name: { zh: '兆焦', en: 'megajoule' } },
      // The thermochemical calorie is exactly 4.184 J, which is the one a
      // chemistry course uses. The 4.1868 "international table" calorie is a
      // different unit and is not offered, because a chemistry tool quoting it
      // would be quoting the wrong one.
      { sym: 'cal', factor: 4.184, name: { zh: '卡', en: 'calorie' } },
      { sym: 'kcal', factor: 4184, name: { zh: '千卡', en: 'kilocalorie' } },
      { sym: 'Wh', factor: 3600, name: { zh: '瓦时', en: 'watt-hour' } },
      { sym: 'kWh', factor: 3.6e6, name: { zh: '千瓦时', en: 'kilowatt-hour' } },
      { sym: 'eV', factor: 1.602176634e-19, name: { zh: '电子伏', en: 'electronvolt' } },
      { sym: 'keV', factor: 1.602176634e-16, name: { zh: '千电子伏', en: 'kiloelectronvolt' } },
      { sym: 'MeV', factor: 1.602176634e-13, name: { zh: '兆电子伏', en: 'megaelectronvolt' } },
      { sym: 'erg', factor: 1e-7, name: { zh: '尔格', en: 'erg' } },
      { sym: 'BTU', factor: 1055.05585262, name: { zh: '英热单位', en: 'British thermal unit' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Voltage, resistance, current — the electrochemistry set
   * ------------------------------------------------------------------ */
  {
    id: 'voltage',
    base: 'V',
    siBase: 'V',
    exp: [1, 2, -3, 0, -1, 0],
    label: { zh: '电压', en: 'Voltage' },
    units: [
      { sym: 'V', factor: 1, name: { zh: '伏特', en: 'volt' } },
      { sym: 'mV', factor: 1e-3, name: { zh: '毫伏', en: 'millivolt' } },
      { sym: 'uV', factor: 1e-6, name: { zh: '微伏', en: 'microvolt' }, aka: ['µV'] },
      { sym: 'nV', factor: 1e-9, name: { zh: '纳伏', en: 'nanovolt' } },
      { sym: 'kV', factor: 1e3, name: { zh: '千伏', en: 'kilovolt' } },
      { sym: 'MV', factor: 1e6, name: { zh: '兆伏', en: 'megavolt' } },
    ],
  },
  {
    id: 'resistance',
    base: 'ohm',
    siBase: 'ohm',
    exp: [1, 2, -3, 0, -2, 0],
    label: { zh: '电阻', en: 'Resistance' },
    units: [
      { sym: 'ohm', factor: 1, name: { zh: '欧姆', en: 'ohm' }, aka: ['Ω'] },
      { sym: 'mohm', factor: 1e-3, name: { zh: '毫欧', en: 'milliohm' }, aka: ['mΩ'] },
      { sym: 'kohm', factor: 1e3, name: { zh: '千欧', en: 'kiloohm' }, aka: ['kΩ'] },
      { sym: 'Mohm', factor: 1e6, name: { zh: '兆欧', en: 'megaohm' }, aka: ['MΩ'] },
      { sym: 'Gohm', factor: 1e9, name: { zh: '吉欧', en: 'gigaohm' }, aka: ['GΩ'] },
    ],
  },
  {
    id: 'current',
    base: 'A',
    siBase: 'A',
    exp: [0, 0, 0, 0, 1, 0],
    label: { zh: '电流', en: 'Current' },
    units: [
      { sym: 'A', factor: 1, name: { zh: '安培', en: 'ampere' } },
      { sym: 'mA', factor: 1e-3, name: { zh: '毫安', en: 'milliampere' } },
      { sym: 'uA', factor: 1e-6, name: { zh: '微安', en: 'microampere' }, aka: ['µA'] },
      { sym: 'nA', factor: 1e-9, name: { zh: '纳安', en: 'nanoampere' } },
      { sym: 'pA', factor: 1e-12, name: { zh: '皮安', en: 'picoampere' } },
      { sym: 'kA', factor: 1e3, name: { zh: '千安', en: 'kiloampere' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Charge and conductance — the rest of the electrochemistry set
   * ------------------------------------------------------------------ */
  {
    id: 'charge',
    base: 'C',
    siBase: 'C',
    exp: [0, 0, 1, 0, 1, 0],
    label: { zh: '电荷量', en: 'Electric charge' },
    units: [
      { sym: 'C', factor: 1, name: { zh: '库仑', en: 'coulomb' } },
      { sym: 'mC', factor: 1e-3, name: { zh: '毫库仑', en: 'millicoulomb' } },
      { sym: 'uC', factor: 1e-6, name: { zh: '微库仑', en: 'microcoulomb' }, aka: ['µC'] },
      { sym: 'nC', factor: 1e-9, name: { zh: '纳库仑', en: 'nanocoulomb' } },
      { sym: 'Ah', factor: 3600, name: { zh: '安时', en: 'ampere-hour' } },
      { sym: 'mAh', factor: 3.6, name: { zh: '毫安时', en: 'milliampere-hour' } },
      { sym: 'F', factor: 96485.33212, name: { zh: '法拉第常数', en: 'faraday' } },
    ],
  },
  {
    id: 'conductance',
    base: 'S',
    siBase: 'S',
    exp: [-1, -2, 3, 0, 2, 0],
    label: { zh: '电导', en: 'Conductance' },
    units: [
      { sym: 'S', factor: 1, name: { zh: '西门子', en: 'siemens' } },
      { sym: 'mS', factor: 1e-3, name: { zh: '毫西门子', en: 'millisiemens' } },
      { sym: 'uS', factor: 1e-6, name: { zh: '微西门子', en: 'microsiemens' }, aka: ['µS'] },
      { sym: 'nS', factor: 1e-9, name: { zh: '纳西门子', en: 'nanosiemens' } },
      { sym: 'mho', factor: 1, name: { zh: '姆欧', en: 'mho' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Force, power, frequency — the physics a bench instrument reports
   * ------------------------------------------------------------------ */
  {
    id: 'force',
    base: 'N',
    siBase: 'N',
    exp: [1, 1, -2, 0, 0, 0],
    label: { zh: '力', en: 'Force' },
    units: [
      { sym: 'N', factor: 1, name: { zh: '牛顿', en: 'newton' } },
      { sym: 'mN', factor: 1e-3, name: { zh: '毫牛', en: 'millinewton' } },
      { sym: 'uN', factor: 1e-6, name: { zh: '微牛', en: 'micronewton' }, aka: ['µN'] },
      { sym: 'kN', factor: 1e3, name: { zh: '千牛', en: 'kilonewton' } },
      { sym: 'dyn', factor: 1e-5, name: { zh: '达因', en: 'dyne' } },
      { sym: 'kgf', factor: 9.80665, name: { zh: '千克力', en: 'kilogram-force' } },
      { sym: 'lbf', factor: 4.4482216152605, name: { zh: '磅力', en: 'pound-force' } },
    ],
  },
  {
    id: 'power',
    base: 'W',
    siBase: 'W',
    exp: [1, 2, -3, 0, 0, 0],
    label: { zh: '功率', en: 'Power' },
    units: [
      { sym: 'W', factor: 1, name: { zh: '瓦特', en: 'watt' } },
      { sym: 'mW', factor: 1e-3, name: { zh: '毫瓦', en: 'milliwatt' } },
      { sym: 'uW', factor: 1e-6, name: { zh: '微瓦', en: 'microwatt' }, aka: ['µW'] },
      { sym: 'kW', factor: 1e3, name: { zh: '千瓦', en: 'kilowatt' } },
      { sym: 'MW', factor: 1e6, name: { zh: '兆瓦', en: 'megawatt' } },
      { sym: 'hp', factor: 745.6998715822702, name: { zh: '马力', en: 'horsepower' } },
    ],
  },
  {
    id: 'frequency',
    base: 'Hz',
    siBase: 'Hz',
    exp: [0, 0, -1, 0, 0, 0],
    label: { zh: '频率', en: 'Frequency' },
    note: { zh: '与放射性活度 Bq 同量纲（都是 T⁻¹）', en: 'Same dimension as radioactivity Bq — both are T⁻¹' },
    units: [
      { sym: 'Hz', factor: 1, name: { zh: '赫兹', en: 'hertz' } },
      { sym: 'kHz', factor: 1e3, name: { zh: '千赫', en: 'kilohertz' } },
      { sym: 'MHz', factor: 1e6, name: { zh: '兆赫', en: 'megahertz' } },
      { sym: 'GHz', factor: 1e9, name: { zh: '吉赫', en: 'gigahertz' } },
      { sym: 'rpm', factor: 1 / 60, name: { zh: '转每分', en: 'revolution per minute' } },
      // Radioactive decay. Dimensionally a frequency, which is what it is.
      { sym: 'Bq', factor: 1, name: { zh: '贝可勒尔', en: 'becquerel' } },
      { sym: 'kBq', factor: 1e3, name: { zh: '千贝可', en: 'kilobecquerel' } },
      { sym: 'MBq', factor: 1e6, name: { zh: '兆贝可', en: 'megabecquerel' } },
      { sym: 'GBq', factor: 1e9, name: { zh: '吉贝可', en: 'gigabecquerel' } },
      { sym: 'Ci', factor: 3.7e10, name: { zh: '居里', en: 'curie' } },
      { sym: 'mCi', factor: 3.7e7, name: { zh: '毫居里', en: 'millicurie' } },
      { sym: 'uCi', factor: 3.7e4, name: { zh: '微居里', en: 'microcurie' }, aka: ['µCi'] },
      { sym: 'dpm', factor: 1 / 60, name: { zh: '每分钟衰变', en: 'disintegration per minute' } },
      { sym: 'cpm', factor: 1 / 60, name: { zh: '每分钟计数', en: 'count per minute' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Dose, viscosity, surface tension, heat — instrument readouts
   * ------------------------------------------------------------------ */
  {
    id: 'dose',
    base: 'Gy',
    siBase: 'Gy',
    exp: [0, 2, -2, 0, 0, 0],
    label: { zh: '吸收剂量', en: 'Absorbed dose' },
    note: { zh: 'Gy 与 Sv 同量纲，差一个辐射权重因子', en: 'Gy and Sv share a dimension; they differ by a radiation weighting factor' },
    units: [
      { sym: 'Gy', factor: 1, name: { zh: '戈瑞', en: 'gray' } },
      { sym: 'mGy', factor: 1e-3, name: { zh: '毫戈瑞', en: 'milligray' } },
      { sym: 'uGy', factor: 1e-6, name: { zh: '微戈瑞', en: 'microgray' }, aka: ['µGy'] },
      { sym: 'rad', factor: 0.01, name: { zh: '拉德', en: 'rad' } },
      { sym: 'Sv', factor: 1, name: { zh: '希沃特', en: 'sievert' } },
      { sym: 'mSv', factor: 1e-3, name: { zh: '毫希沃特', en: 'millisievert' } },
      { sym: 'uSv', factor: 1e-6, name: { zh: '微希沃特', en: 'microsievert' }, aka: ['µSv'] },
      { sym: 'rem', factor: 0.01, name: { zh: '雷姆', en: 'rem' } },
    ],
  },
  {
    id: 'viscosity',
    base: 'Pa.s',
    siBase: 'Pa.s',
    exp: [1, -1, -1, 0, 0, 0],
    label: { zh: '动力黏度', en: 'Dynamic viscosity' },
    units: [
      { sym: 'Pa.s', factor: 1, name: { zh: '帕斯卡秒', en: 'pascal-second' } },
      { sym: 'mPa.s', factor: 1e-3, name: { zh: '毫帕秒', en: 'millipascal-second' } },
      { sym: 'P', factor: 0.1, name: { zh: '泊', en: 'poise' } },
      { sym: 'cP', factor: 1e-3, name: { zh: '厘泊', en: 'centipoise' } },
    ],
  },
  {
    id: 'kinematicViscosity',
    base: 'm2/s',
    siBase: 'm2/s',
    exp: [0, 2, -1, 0, 0, 0],
    label: { zh: '运动黏度', en: 'Kinematic viscosity' },
    units: [
      { sym: 'm2/s', factor: 1, name: { zh: '平方米每秒', en: 'square metre per second' } },
      { sym: 'mm2/s', factor: 1e-6, name: { zh: '平方毫米每秒', en: 'square millimetre per second' } },
      { sym: 'St', factor: 1e-4, name: { zh: '斯', en: 'stokes' } },
      { sym: 'cSt', factor: 1e-6, name: { zh: '厘斯', en: 'centistokes' } },
    ],
  },
  {
    id: 'surfaceTension',
    base: 'N/m',
    siBase: 'N/m',
    exp: [1, 0, -2, 0, 0, 0],
    label: { zh: '表面张力', en: 'Surface tension' },
    units: [
      { sym: 'N/m', factor: 1, name: { zh: '牛顿每米', en: 'newton per metre' } },
      { sym: 'mN/m', factor: 1e-3, name: { zh: '毫牛每米', en: 'millinewton per metre' } },
      { sym: 'dyn/cm', factor: 1e-3, name: { zh: '达因每厘米', en: 'dyne per centimetre' } },
    ],
  },
  {
    id: 'heatCapacity',
    base: 'J/K',
    siBase: 'J/K',
    exp: [1, 2, -2, 0, 0, -1],
    label: { zh: '热容', en: 'Heat capacity' },
    units: [
      { sym: 'J/K', factor: 1, name: { zh: '焦每开', en: 'joule per kelvin' } },
      { sym: 'kJ/K', factor: 1e3, name: { zh: '千焦每开', en: 'kilojoule per kelvin' } },
      { sym: 'cal/K', factor: 4.184, name: { zh: '卡每开', en: 'calorie per kelvin' } },
    ],
  },
  {
    id: 'specificHeat',
    base: 'J/(kg.K)',
    siBase: 'J/(kg.K)',
    exp: [0, 2, -2, 0, 0, -1],
    label: { zh: '比热容', en: 'Specific heat capacity' },
    note: { zh: '水的比热容约 4184 J/(kg·K)', en: "Water is about 4184 J/(kg·K)" },
    units: [
      { sym: 'J/(kg.K)', factor: 1, name: { zh: '焦每千克开', en: 'joule per kilogram kelvin' } },
      { sym: 'kJ/(kg.K)', factor: 1e3, name: { zh: '千焦每千克开', en: 'kilojoule per kilogram kelvin' } },
      { sym: 'cal/(g.C)', factor: 4184, name: { zh: '卡每克度', en: 'calorie per gram degree' } },
      { sym: 'J/(g.C)', factor: 1000, name: { zh: '焦每克度', en: 'joule per gram degree' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * The per-mole family — thermodynamics on a molar basis
   * ------------------------------------------------------------------ */
  {
    id: 'molarMass',
    base: 'g/mol',
    siBase: 'kg/mol',
    exp: [1, 0, 0, -1, 0, 0],
    label: { zh: '摩尔质量', en: 'Molar mass' },
    units: [
      { sym: 'g/mol', factor: 1e-3, name: { zh: '克每摩尔', en: 'gram per mole' } },
      { sym: 'kg/mol', factor: 1, name: { zh: '千克每摩尔', en: 'kilogram per mole' } },
      { sym: 'mg/mol', factor: 1e-6, name: { zh: '毫克每摩尔', en: 'milligram per mole' } },
      { sym: 'mg/mmol', factor: 1e-3, name: { zh: '毫克每毫摩尔', en: 'milligram per millimole' } },
      { sym: 'g/mmol', factor: 1, name: { zh: '克每毫摩尔', en: 'gram per millimole' } },
      { sym: 'kg/kmol', factor: 1e-3, name: { zh: '千克每千摩尔', en: 'kilogram per kilomole' } },
      // The dalton is declared in `mass`, where a molecular mass in Da is
      // actually read. Repeating it here would be the same unit twice, which
      // is what `EXPR_PREFERRED` exists to stop — and a converter that offers
      // Da under both mass and molar mass is offering one unit twice.
    ],
  },
  {
    id: 'molarEnergy',
    base: 'kJ/mol',
    siBase: 'J/mol',
    exp: [1, 2, -2, -1, 0, 0],
    label: { zh: '摩尔能量', en: 'Molar energy' },
    note: { zh: '焓、吉布斯自由能、活化能都是这个量纲', en: 'Enthalpy, Gibbs energy and activation energy are all this dimension' },
    units: [
      { sym: 'J/mol', factor: 1, name: { zh: '焦每摩尔', en: 'joule per mole' } },
      { sym: 'kJ/mol', factor: 1e3, name: { zh: '千焦每摩尔', en: 'kilojoule per mole' } },
      { sym: 'MJ/mol', factor: 1e6, name: { zh: '兆焦每摩尔', en: 'megajoule per mole' } },
      { sym: 'cal/mol', factor: 4.184, name: { zh: '卡每摩尔', en: 'calorie per mole' } },
      { sym: 'kcal/mol', factor: 4184, name: { zh: '千卡每摩尔', en: 'kilocalorie per mole' } },
      { sym: 'eV/atom', factor: 96485.33212, name: { zh: '电子伏每原子', en: 'electronvolt per atom' } },
    ],
  },
  {
    id: 'molarVolume',
    base: 'L/mol',
    siBase: 'm3/mol',
    exp: [0, 3, 0, -1, 0, 0],
    label: { zh: '摩尔体积', en: 'Molar volume' },
    note: { zh: '理想气体在标准状况下为 22.414 L/mol', en: 'An ideal gas is 22.414 L/mol at STP' },
    units: [
      { sym: 'L/mol', factor: 1e-3, name: { zh: '升每摩尔', en: 'litre per mole' } },
      { sym: 'm3/mol', factor: 1, name: { zh: '立方米每摩尔', en: 'cubic metre per mole' } },
      { sym: 'mL/mol', factor: 1e-6, name: { zh: '毫升每摩尔', en: 'millilitre per mole' } },
      { sym: 'cm3/mol', factor: 1e-6, name: { zh: '立方厘米每摩尔', en: 'cubic centimetre per mole' } },
      { sym: 'L/kmol', factor: 1e-6, name: { zh: '升每千摩尔', en: 'litre per kilomole' } },
    ],
  },
  {
    id: 'molarEntropy',
    base: 'J/(mol.K)',
    siBase: 'J/(mol.K)',
    exp: [1, 2, -2, -1, 0, -1],
    label: { zh: '摩尔熵', en: 'Molar entropy' },
    units: [
      { sym: 'J/(mol.K)', factor: 1, name: { zh: '焦每摩尔开', en: 'joule per mole kelvin' } },
      { sym: 'kJ/(mol.K)', factor: 1e3, name: { zh: '千焦每摩尔开', en: 'kilojoule per mole kelvin' } },
      { sym: 'cal/(mol.K)', factor: 4.184, name: { zh: '卡每摩尔开', en: 'calorie per mole kelvin' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Spectroscopy and wave quantities
   * ------------------------------------------------------------------ */
  {
    id: 'wavenumber',
    base: 'cm-1',
    siBase: '1/m',
    exp: [0, -1, 0, 0, 0, 0],
    label: { zh: '波数', en: 'Wavenumber' },
    note: { zh: '红外光谱的横轴单位', en: 'The x-axis unit of an IR spectrum' },
    units: [
      { sym: '1/m', factor: 1, name: { zh: '每米', en: 'per metre' } },
      { sym: 'cm-1', factor: 100, name: { zh: '每厘米', en: 'per centimetre' } },
      { sym: 'm-1', factor: 1, name: { zh: '每米', en: 'per metre' } },
    ],
  },
  {
    id: 'velocity',
    base: 'm/s',
    siBase: 'm/s',
    exp: [0, 1, -1, 0, 0, 0],
    label: { zh: '速度', en: 'Velocity' },
    units: [
      { sym: 'm/s', factor: 1, name: { zh: '米每秒', en: 'metre per second' } },
      { sym: 'cm/s', factor: 0.01, name: { zh: '厘米每秒', en: 'centimetre per second' } },
      { sym: 'mm/s', factor: 1e-3, name: { zh: '毫米每秒', en: 'millimetre per second' } },
      { sym: 'km/h', factor: 1 / 3.6, name: { zh: '千米每小时', en: 'kilometre per hour' } },
      { sym: 'mph', factor: 0.44704, name: { zh: '英里每小时', en: 'mile per hour' } },
      { sym: 'rpm', factor: 1 / 60, name: { zh: '转每分', en: 'revolution per minute' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Catalytic activity — amount per time
   * ------------------------------------------------------------------ */
  {
    id: 'catalyticActivity',
    base: 'kat',
    siBase: 'kat',
    exp: [0, 0, -1, 1, 0, 0],
    label: { zh: '催化活性', en: 'Catalytic activity' },
    units: [
      { sym: 'kat', factor: 1, name: { zh: '开特', en: 'katal' } },
      { sym: 'ukat', factor: 1e-6, name: { zh: '微开特', en: 'microkatal' }, aka: ['µkat'] },
      { sym: 'U', factor: 1.6666666666666667e-8, name: { zh: '酶活力单位', en: 'enzyme unit' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Dimensionless ratios, kept for the converter
   *
   * These have no exponent vector — a mole fraction really is a plain number,
   * and giving it a vector would collide with every dimensionless result in
   * the expression evaluator. `expr: false` keeps them out of that lookup.
   * ------------------------------------------------------------------ */
  {
    id: 'ratio',
    base: '%',
    siBase: '1',
    exp: null,
    expr: false,
    label: { zh: '比值', en: 'Ratio' },
    note: { zh: '无单位的比值：百分比、ppm、摩尔分数', en: 'Dimensionless ratios: percent, ppm, mole fraction' },
    units: [
      { sym: '1', factor: 1, name: { zh: '纯数', en: 'pure number' } },
      { sym: '%', factor: 0.01, name: { zh: '百分比', en: 'percent' } },
      { sym: 'permille', factor: 0.001, name: { zh: '千分比', en: 'per mille' }, aka: ['‰'] },
      { sym: 'ppm', factor: 1e-6, name: { zh: '百万分之一', en: 'parts per million' } },
      { sym: 'ppb', factor: 1e-9, name: { zh: '十亿分之一', en: 'parts per billion' } },
      { sym: 'ppt', factor: 1e-12, name: { zh: '万亿分之一', en: 'parts per trillion' } },
      { sym: 'mol/mol', factor: 1, name: { zh: '摩尔分数', en: 'mole fraction' } },
    ],
  },

  /* ---------------------------------------------------------------------
   * Angle — dimensionless, converter only
   * ------------------------------------------------------------------ */
  {
    id: 'angle',
    base: 'deg',
    siBase: 'rad',
    exp: null,
    expr: false,
    label: { zh: '角度', en: 'Angle' },
    units: [
      { sym: 'rad', factor: 1, name: { zh: '弧度', en: 'radian' } },
      { sym: 'deg', factor: Math.PI / 180, name: { zh: '度', en: 'degree' }, aka: ['°'] },
      { sym: 'grad', factor: Math.PI / 200, name: { zh: '百分度', en: 'gradian' } },
      { sym: 'arcmin', factor: Math.PI / 10800, name: { zh: '角分', en: 'arcminute' } },
      { sym: 'arcsec', factor: Math.PI / 648000, name: { zh: '角秒', en: 'arcsecond' } },
      { sym: 'turn', factor: 2 * Math.PI, name: { zh: '转', en: 'turn' } },
    ],
  },
];
