/**
 * The periodic table — 118 elements with the data a lab actually uses.
 *
 * Layout, covalent and van der Waals radii, and the CPK colours come from
 * chemistry/chemical-libraries (MIT, © Volodymyr Vreshch); see NOTICE.md.
 *
 * Atomic masses are deliberately NOT all from that source. This project already
 * had IUPAC 2021 standard atomic weights for 83 elements, and the two tables
 * disagree for 58 of them (S: 32.06 vs 32.065, Zn: 65.38 vs 65.409, and so on).
 * Silently adopting the other table would have changed every molar mass the
 * calculator produces. So the IUPAC values are kept and the 35 elements this
 * project never had — Tc, Pm, and everything past Bi — are filled from the
 * library. The `massSource` field records which is which.
 *
 * Group and period are grid coordinates, not chemistry: the f-block is drawn on
 * two detached rows below the main table (periods 9 and 10), which is why those
 * two exceed the familiar 1-7.
 *
 * Pure data, no I/O. Kept separate from solution.mjs so the arithmetic module
 * stays about arithmetic.
 */

export const ELEMENT_COUNT = 118;

export const ELEMENTS = [
  { number: 1, symbol: 'H', name: "Hydrogen", zh: '氢', mass: 1.008, group: 1, period: 1, rcow: 0.37, rvdw: 1.2, color: '#FFFFFF', color2: '#808080', massSource: 'iupac' },
  { number: 2, symbol: 'He', name: "Helium", zh: '氦', mass: 4.0026, group: 18, period: 1, rcow: 0.32, rvdw: 1.4, color: '#D9FFFF', color2: '#849B9B', massSource: 'iupac' },
  { number: 3, symbol: 'Li', name: "Lithium", zh: '锂', mass: 6.94, group: 1, period: 2, rcow: 1.34, rvdw: 2.2, color: '#CC80FF', color2: '#C87EFA', massSource: 'iupac' },
  { number: 4, symbol: 'Be', name: "Beryllium", zh: '铍', mass: 9.0122, group: 2, period: 2, rcow: 0.9, rvdw: 1.9, color: '#C2FF00', color2: '#82AB00', massSource: 'iupac' },
  { number: 5, symbol: 'B', name: "Boron", zh: '硼', mass: 10.81, group: 13, period: 2, rcow: 0.82, rvdw: 1.8, color: '#FFB5B5', color2: '#F090A0', massSource: 'iupac' },
  { number: 6, symbol: 'C', name: "Carbon", zh: '碳', mass: 12.011, group: 14, period: 2, rcow: 0.77, rvdw: 1.7, color: '#909090', color2: '#000000', massSource: 'iupac' },
  { number: 7, symbol: 'N', name: "Nitrogen", zh: '氮', mass: 14.007, group: 15, period: 2, rcow: 0.75, rvdw: 1.6, color: '#3050F8', color2: '#304FF7', massSource: 'iupac' },
  { number: 8, symbol: 'O', name: "Oxygen", zh: '氧', mass: 15.999, group: 16, period: 2, rcow: 0.73, rvdw: 1.55, color: '#FF0D0D', color2: '#FF0D0D', massSource: 'iupac' },
  { number: 9, symbol: 'F', name: "Fluorine", zh: '氟', mass: 18.998, group: 17, period: 2, rcow: 0.71, rvdw: 1.5, color: '#90E050', color2: '#228B22', massSource: 'iupac' },
  { number: 10, symbol: 'Ne', name: "Neon", zh: '氖', mass: 20.18, group: 18, period: 2, rcow: 0.69, rvdw: 1.54, color: '#B3E3F5', color2: '#7B9CA8', massSource: 'iupac' },
  { number: 11, symbol: 'Na', name: "Sodium", zh: '钠', mass: 22.99, group: 1, period: 3, rcow: 1.54, rvdw: 2.4, color: '#AB5CF2', color2: '#AB5CF2', massSource: 'iupac' },
  { number: 12, symbol: 'Mg', name: "Magnesium", zh: '镁', mass: 24.305, group: 2, period: 3, rcow: 1.3, rvdw: 2.2, color: '#8AFF00', color2: '#61B400', massSource: 'iupac' },
  { number: 13, symbol: 'Al', name: "Aluminium", zh: '铝', mass: 26.982, group: 13, period: 3, rcow: 1.18, rvdw: 2.1, color: '#BFA6A6', color2: '#A79191', massSource: 'iupac' },
  { number: 14, symbol: 'Si', name: "Silicon", zh: '硅', mass: 28.085, group: 14, period: 3, rcow: 1.11, rvdw: 2.1, color: '#F0C8A0', color2: '#B09276', massSource: 'iupac' },
  { number: 15, symbol: 'P', name: "Phosphorus", zh: '磷', mass: 30.974, group: 15, period: 3, rcow: 1.06, rvdw: 1.95, color: '#FF8000', color2: '#FF8000', massSource: 'iupac' },
  { number: 16, symbol: 'S', name: "Sulfur", zh: '硫', mass: 32.06, group: 16, period: 3, rcow: 1.02, rvdw: 1.8, color: '#FFFF30', color2: '#FFC832', massSource: 'iupac' },
  { number: 17, symbol: 'Cl', name: "Chlorine", zh: '氯', mass: 35.45, group: 17, period: 3, rcow: 0.99, rvdw: 1.8, color: '#1FF01F', color2: '#1DC51D', massSource: 'iupac' },
  { number: 18, symbol: 'Ar', name: "Argon", zh: '氩', mass: 39.948, group: 18, period: 3, rcow: 0.97, rvdw: 1.88, color: '#80D1E3', color2: '#63A2B0', massSource: 'iupac' },
  { number: 19, symbol: 'K', name: "Potassium", zh: '钾', mass: 39.098, group: 1, period: 4, rcow: 1.96, rvdw: 2.8, color: '#8F40D4', color2: '#8F40D4', massSource: 'iupac' },
  { number: 20, symbol: 'Ca', name: "Calcium", zh: '钙', mass: 40.078, group: 2, period: 4, rcow: 1.74, rvdw: 2.4, color: '#3DFF00', color2: '#2FC300', massSource: 'iupac' },
  { number: 21, symbol: 'Sc', name: "Scandium", zh: '钪', mass: 44.956, group: 3, period: 4, rcow: 1.44, rvdw: 2.3, color: '#E6E6E6', color2: '#969696', massSource: 'iupac' },
  { number: 22, symbol: 'Ti', name: "Titanium", zh: '钛', mass: 47.867, group: 4, period: 4, rcow: 1.36, rvdw: 2.15, color: '#BFC2C7', color2: '#94969A', massSource: 'iupac' },
  { number: 23, symbol: 'V', name: "Vanadium", zh: '钒', mass: 50.942, group: 5, period: 4, rcow: 1.25, rvdw: 2.05, color: '#A6A6AB', color2: '#96969A', massSource: 'iupac' },
  { number: 24, symbol: 'Cr', name: "Chromium", zh: '铬', mass: 51.996, group: 6, period: 4, rcow: 1.27, rvdw: 2.05, color: '#8A99C7', color2: '#8796C3', massSource: 'iupac' },
  { number: 25, symbol: 'Mn', name: "Manganese", zh: '锰', mass: 54.938, group: 7, period: 4, rcow: 1.39, rvdw: 2.05, color: '#9C7AC7', color2: '#9C7AC7', massSource: 'iupac' },
  { number: 26, symbol: 'Fe', name: "Iron", zh: '铁', mass: 55.845, group: 8, period: 4, rcow: 1.25, rvdw: 2.05, color: '#E06633', color2: '#E06633', massSource: 'iupac' },
  { number: 27, symbol: 'Co', name: "Cobalt", zh: '钴', mass: 58.933, group: 9, period: 4, rcow: 1.26, rvdw: 2, color: '#F090A0', color2: '#DB8293', massSource: 'iupac' },
  { number: 28, symbol: 'Ni', name: "Nickel", zh: '镍', mass: 58.693, group: 10, period: 4, rcow: 1.21, rvdw: 2, color: '#50D050', color2: '#45B645', massSource: 'iupac' },
  { number: 29, symbol: 'Cu', name: "Copper", zh: '铜', mass: 63.546, group: 11, period: 4, rcow: 1.38, rvdw: 2, color: '#C88033', color2: '#C78033', massSource: 'iupac' },
  { number: 30, symbol: 'Zn', name: "Zinc", zh: '锌', mass: 65.38, group: 12, period: 4, rcow: 1.31, rvdw: 2.1, color: '#7D80B0', color2: '#7D80B0', massSource: 'iupac' },
  { number: 31, symbol: 'Ga', name: "Gallium", zh: '镓', mass: 69.723, group: 13, period: 4, rcow: 1.26, rvdw: 2.1, color: '#C28F8F', color2: '#BD8C8C', massSource: 'iupac' },
  { number: 32, symbol: 'Ge', name: "Germanium", zh: '锗', mass: 72.63, group: 14, period: 4, rcow: 1.22, rvdw: 2.1, color: '#668F8F', color2: '#668F8F', massSource: 'iupac' },
  { number: 33, symbol: 'As', name: "Arsenic", zh: '砷', mass: 74.922, group: 15, period: 4, rcow: 1.19, rvdw: 2.05, color: '#BD80E3', color2: '#BD80E3', massSource: 'iupac' },
  { number: 34, symbol: 'Se', name: "Selenium", zh: '硒', mass: 78.971, group: 16, period: 4, rcow: 1.16, rvdw: 1.9, color: '#FFA100', color2: '#E28F00', massSource: 'iupac' },
  { number: 35, symbol: 'Br', name: "Bromine", zh: '溴', mass: 79.904, group: 17, period: 4, rcow: 1.14, rvdw: 1.9, color: '#A62929', color2: '#A62929', massSource: 'iupac' },
  { number: 36, symbol: 'Kr', name: "Krypton", zh: '氪', mass: 83.798, group: 18, period: 4, rcow: 1.1, rvdw: 2.02, color: '#5CB8D1', color2: '#53A6BC', massSource: 'iupac' },
  { number: 37, symbol: 'Rb', name: "Rubidium", zh: '铷', mass: 85.468, group: 1, period: 5, rcow: 2.11, rvdw: 2.9, color: '#702EB0', color2: '#702EB0', massSource: 'iupac' },
  { number: 38, symbol: 'Sr', name: "Strontium", zh: '锶', mass: 87.62, group: 2, period: 5, rcow: 1.92, rvdw: 2.55, color: '#00FF00', color2: '#00D000', massSource: 'iupac' },
  { number: 39, symbol: 'Y', name: "Yttrium", zh: '钇', mass: 88.906, group: 3, period: 5, rcow: 1.62, rvdw: 2.4, color: '#94FFFF', color2: '#5FA4A4', massSource: 'iupac' },
  { number: 40, symbol: 'Zr', name: "Zirconium", zh: '锆', mass: 91.224, group: 4, period: 5, rcow: 1.48, rvdw: 2.3, color: '#94E0E0', color2: '#6BA2A2', massSource: 'iupac' },
  { number: 41, symbol: 'Nb', name: "Niobium", zh: '铌', mass: 92.906, group: 5, period: 5, rcow: 1.37, rvdw: 2.15, color: '#73C2C9', color2: '#61A4A9', massSource: 'iupac' },
  { number: 42, symbol: 'Mo', name: "Molybdenum", zh: '钼', mass: 95.95, group: 6, period: 5, rcow: 1.45, rvdw: 2.1, color: '#54B5B5', color2: '#4EA9A9', massSource: 'iupac' },
  { number: 43, symbol: 'Tc', name: "Technetium", zh: '锝', mass: 98, group: 7, period: 5, rcow: 1.56, rvdw: 2.05, color: '#3B9E9E', color2: '#4EA9A9', massSource: 'library' },
  { number: 44, symbol: 'Ru', name: "Ruthenium", zh: '钌', mass: 101.07, group: 8, period: 5, rcow: 1.26, rvdw: 2.05, color: '#248F8F', color2: '#248F8F', massSource: 'iupac' },
  { number: 45, symbol: 'Rh', name: "Rhodium", zh: '铑', mass: 102.91, group: 9, period: 5, rcow: 1.35, rvdw: 2, color: '#0A7D8C', color2: '#0A7D8C', massSource: 'iupac' },
  { number: 46, symbol: 'Pd', name: "Palladium", zh: '钯', mass: 106.42, group: 10, period: 5, rcow: 1.31, rvdw: 2.05, color: '#006985', color2: '#006985', massSource: 'iupac' },
  { number: 47, symbol: 'Ag', name: "Silver", zh: '银', mass: 107.87, group: 11, period: 5, rcow: 1.53, rvdw: 2.1, color: '#C0C0C0', color2: '#969696', massSource: 'iupac' },
  { number: 48, symbol: 'Cd', name: "Cadmium", zh: '镉', mass: 112.41, group: 12, period: 5, rcow: 1.48, rvdw: 2.2, color: '#FFD98F', color2: '#AE9462', massSource: 'iupac' },
  { number: 49, symbol: 'In', name: "Indium", zh: '铟', mass: 114.82, group: 13, period: 5, rcow: 1.44, rvdw: 2.2, color: '#A67573', color2: '#A67573', massSource: 'iupac' },
  { number: 50, symbol: 'Sn', name: "Tin", zh: '锡', mass: 118.71, group: 14, period: 5, rcow: 1.41, rvdw: 2.25, color: '#668080', color2: '#668080', massSource: 'iupac' },
  { number: 51, symbol: 'Sb', name: "Antimony", zh: '锑', mass: 121.76, group: 15, period: 5, rcow: 1.38, rvdw: 2.2, color: '#9E63B5', color2: '#9E63B5', massSource: 'iupac' },
  { number: 52, symbol: 'Te', name: "Tellurium", zh: '碲', mass: 127.6, group: 16, period: 5, rcow: 1.35, rvdw: 2.1, color: '#D47A00', color2: '#D47A00', massSource: 'iupac' },
  { number: 53, symbol: 'I', name: "Iodine", zh: '碘', mass: 126.9, group: 17, period: 5, rcow: 1.33, rvdw: 2.1, color: '#940094', color2: '#940094', massSource: 'iupac' },
  { number: 54, symbol: 'Xe', name: "Xenon", zh: '氙', mass: 131.29, group: 18, period: 5, rcow: 1.3, rvdw: 2.16, color: '#429EB0', color2: '#429EB0', massSource: 'iupac' },
  { number: 55, symbol: 'Cs', name: "Cesium", zh: '铯', mass: 132.91, group: 1, period: 6, rcow: 2.25, rvdw: 3, color: '#57178F', color2: '#57178F', massSource: 'iupac' },
  { number: 56, symbol: 'Ba', name: "Barium", zh: '钡', mass: 137.33, group: 2, period: 6, rcow: 1.98, rvdw: 2.7, color: '#00C900', color2: '#00C900', massSource: 'iupac' },
  { number: 57, symbol: 'La', name: "Lanthanum", zh: '镧', mass: 138.91, group: 3, period: 9, rcow: 1.69, rvdw: 2.5, color: '#70D4FF', color2: '#57A4C5', massSource: 'iupac' },
  { number: 58, symbol: 'Ce', name: "Cerium", zh: '铈', mass: 140.12, group: 4, period: 9, rcow: 1.6, rvdw: 2.48, color: '#FFFFC7', color2: '#989877', massSource: 'iupac' },
  { number: 59, symbol: 'Pr', name: "Praseodymium", zh: '镨', mass: 140.91, group: 5, period: 9, rcow: 1.6, rvdw: 2.47, color: '#D9FFC7', color2: '#869D7B', massSource: 'iupac' },
  { number: 60, symbol: 'Nd', name: "Neodymium", zh: '钕', mass: 144.24, group: 6, period: 9, rcow: 1.6, rvdw: 2.45, color: '#C7FFC7', color2: '#7DA07D', massSource: 'iupac' },
  { number: 61, symbol: 'Pm', name: "Promethium", zh: '钷', mass: 145, group: 7, period: 9, rcow: 1.6, rvdw: 2.43, color: '#A3FFC7', color2: '#69A581', massSource: 'library' },
  { number: 62, symbol: 'Sm', name: "Samarium", zh: '钐', mass: 150.36, group: 8, period: 9, rcow: 1.6, rvdw: 2.42, color: '#8FFFC7', color2: '#5EA883', massSource: 'iupac' },
  { number: 63, symbol: 'Eu', name: "Europium", zh: '铕', mass: 151.96, group: 9, period: 9, rcow: 1.6, rvdw: 2.4, color: '#61FFC7', color2: '#43B089', massSource: 'iupac' },
  { number: 64, symbol: 'Gd', name: "Gadolinium", zh: '钆', mass: 157.25, group: 10, period: 9, rcow: 1.6, rvdw: 2.38, color: '#45FFC7', color2: '#31B48D', massSource: 'iupac' },
  { number: 65, symbol: 'Tb', name: "Terbium", zh: '铽', mass: 158.93, group: 11, period: 9, rcow: 1.6, rvdw: 2.37, color: '#30FFC7', color2: '#23B890', massSource: 'iupac' },
  { number: 66, symbol: 'Dy', name: "Dysprosium", zh: '镝', mass: 162.5, group: 12, period: 9, rcow: 1.6, rvdw: 2.35, color: '#1FFFC7', color2: '#17BB92', massSource: 'iupac' },
  { number: 67, symbol: 'Ho', name: "Holmium", zh: '钬', mass: 164.93, group: 13, period: 9, rcow: 1.6, rvdw: 2.33, color: '#00FF9C', color2: '#00C578', massSource: 'iupac' },
  { number: 68, symbol: 'Er', name: "Erbium", zh: '铒', mass: 167.26, group: 14, period: 9, rcow: 1.6, rvdw: 2.32, color: '#00E675', color2: '#00C765', massSource: 'iupac' },
  { number: 69, symbol: 'Tm', name: "Thulium", zh: '铥', mass: 168.93, group: 15, period: 9, rcow: 1.6, rvdw: 2.3, color: '#00D452', color2: '#00C94E', massSource: 'iupac' },
  { number: 70, symbol: 'Yb', name: "Ytterbium", zh: '镱', mass: 173.05, group: 16, period: 9, rcow: 1.6, rvdw: 2.28, color: '#00BF38', color2: '#00BF38', massSource: 'iupac' },
  { number: 71, symbol: 'Lu', name: "Lutetium", zh: '镥', mass: 174.97, group: 17, period: 9, rcow: 1.6, rvdw: 2.27, color: '#00AB24', color2: '#00AB24', massSource: 'iupac' },
  { number: 72, symbol: 'Hf', name: "Hafnium", zh: '铪', mass: 178.49, group: 4, period: 6, rcow: 1.5, rvdw: 2.25, color: '#4DC2FF', color2: '#42A8DC', massSource: 'iupac' },
  { number: 73, symbol: 'Ta', name: "Tantalum", zh: '钽', mass: 180.95, group: 5, period: 6, rcow: 1.38, rvdw: 2.2, color: '#4DA6FF', color2: '#4BA2F9', massSource: 'iupac' },
  { number: 74, symbol: 'W', name: "Tungsten", zh: '钨', mass: 183.84, group: 6, period: 6, rcow: 1.46, rvdw: 2.1, color: '#2194D6', color2: '#2194D6', massSource: 'iupac' },
  { number: 75, symbol: 'Re', name: "Rhenium", zh: '铼', mass: 186.21, group: 7, period: 6, rcow: 1.59, rvdw: 2.05, color: '#267DAB', color2: '#267DAB', massSource: 'iupac' },
  { number: 76, symbol: 'Os', name: "Osmium", zh: '锇', mass: 190.23, group: 8, period: 6, rcow: 1.28, rvdw: 2, color: '#266696', color2: '#266696', massSource: 'iupac' },
  { number: 77, symbol: 'Ir', name: "Iridium", zh: '铱', mass: 192.22, group: 9, period: 6, rcow: 1.37, rvdw: 2, color: '#175487', color2: '#175487', massSource: 'iupac' },
  { number: 78, symbol: 'Pt', name: "Platinum", zh: '铂', mass: 195.08, group: 10, period: 6, rcow: 1.28, rvdw: 2.05, color: '#D0D0E0', color2: '#9595A0', massSource: 'iupac' },
  { number: 79, symbol: 'Au', name: "Gold", zh: '金', mass: 196.97, group: 11, period: 6, rcow: 1.44, rvdw: 2.1, color: '#FFD123', color2: '#B9981A', massSource: 'iupac' },
  { number: 80, symbol: 'Hg', name: "Mercury", zh: '汞', mass: 200.59, group: 12, period: 6, rcow: 1.49, rvdw: 2.05, color: '#B8B8D0', color2: '#9595A9', massSource: 'iupac' },
  { number: 81, symbol: 'Tl', name: "Thallium", zh: '铊', mass: 204.38, group: 13, period: 6, rcow: 1.48, rvdw: 2.2, color: '#A6544D', color2: '#A6544D', massSource: 'iupac' },
  { number: 82, symbol: 'Pb', name: "Lead", zh: '铅', mass: 207.2, group: 14, period: 6, rcow: 1.47, rvdw: 2.3, color: '#575961', color2: '#575961', massSource: 'iupac' },
  { number: 83, symbol: 'Bi', name: "Bismuth", zh: '铋', mass: 208.98, group: 15, period: 6, rcow: 1.46, rvdw: 2.3, color: '#9E4FB5', color2: '#9E4FB5', massSource: 'iupac' },
  { number: 84, symbol: 'Po', name: "Polonium", zh: '钋', mass: 209, group: 16, period: 6, rcow: 1.6, rvdw: 2, color: '#AB5C00', color2: '#AB5C00', massSource: 'library' },
  { number: 85, symbol: 'At', name: "Astatine", zh: '砹', mass: 210, group: 17, period: 6, rcow: 1.6, rvdw: 2, color: '#754F45', color2: '#754F45', massSource: 'library' },
  { number: 86, symbol: 'Rn', name: "Radon", zh: '氡', mass: 222, group: 18, period: 6, rcow: 1.45, rvdw: 2, color: '#428296', color2: '#428296', massSource: 'library' },
  { number: 87, symbol: 'Fr', name: "Francium", zh: '钫', mass: 223, group: 1, period: 7, rcow: 1.6, rvdw: 2, color: '#420066', color2: '#420066', massSource: 'library' },
  { number: 88, symbol: 'Ra', name: "Radium", zh: '镭', mass: 226, group: 2, period: 7, rcow: 1.6, rvdw: 2, color: '#007D00', color2: '#007D00', massSource: 'library' },
  { number: 89, symbol: 'Ac', name: "Actinium", zh: '锕', mass: 227, group: 3, period: 10, rcow: 1.6, rvdw: 2, color: '#70ABFA', color2: '#669CE4', massSource: 'library' },
  { number: 90, symbol: 'Th', name: "Thorium", zh: '钍', mass: 232.04, group: 4, period: 10, rcow: 1.6, rvdw: 2.4, color: '#00BAFF', color2: '#00B8FC', massSource: 'iupac' },
  { number: 91, symbol: 'Pa', name: "Protactinium", zh: '镤', mass: 231.03588, group: 5, period: 10, rcow: 1.6, rvdw: 2, color: '#00A1FF', color2: '#00A1FF', massSource: 'library' },
  { number: 92, symbol: 'U', name: "Uranium", zh: '铀', mass: 238.03, group: 6, period: 10, rcow: 1.6, rvdw: 2.3, color: '#008FFF', color2: '#008FFF', massSource: 'iupac' },
  { number: 93, symbol: 'Np', name: "Neptunium", zh: '镎', mass: 237, group: 7, period: 10, rcow: 1.6, rvdw: 2, color: '#0080FF', color2: '#0080FF', massSource: 'library' },
  { number: 94, symbol: 'Pu', name: "Plutonium", zh: '钚', mass: 244, group: 8, period: 10, rcow: 1.6, rvdw: 2, color: '#006BFF', color2: '#006BFF', massSource: 'library' },
  { number: 95, symbol: 'Am', name: "Americium", zh: '镅', mass: 243, group: 9, period: 10, rcow: 1.6, rvdw: 2, color: '#545CF2', color2: '#545CF2', massSource: 'library' },
  { number: 96, symbol: 'Cm', name: "Curium", zh: '锔', mass: 247, group: 10, period: 10, rcow: 1.6, rvdw: 2, color: '#785CE3', color2: '#785CE3', massSource: 'library' },
  { number: 97, symbol: 'Bk', name: "Berkelium", zh: '锫', mass: 247, group: 11, period: 10, rcow: 1.6, rvdw: 2, color: '#8A4FE3', color2: '#8A4FE3', massSource: 'library' },
  { number: 98, symbol: 'Cf', name: "Californium", zh: '锎', mass: 251, group: 12, period: 10, rcow: 1.6, rvdw: 2, color: '#A136D4', color2: '#A136D4', massSource: 'library' },
  { number: 99, symbol: 'Es', name: "Einsteinium", zh: '锿', mass: 252, group: 13, period: 10, rcow: 1.6, rvdw: 2, color: '#B31FD4', color2: '#B31FD4', massSource: 'library' },
  { number: 100, symbol: 'Fm', name: "Fermium", zh: '镄', mass: 257, group: 14, period: 10, rcow: 1.6, rvdw: 2, color: '#B31FBA', color2: '#B31FBA', massSource: 'library' },
  { number: 101, symbol: 'Md', name: "Mendelevium", zh: '钔', mass: 258, group: 15, period: 10, rcow: 1.6, rvdw: 2, color: '#B30DA6', color2: '#B30DA6', massSource: 'library' },
  { number: 102, symbol: 'No', name: "Nobelium", zh: '锘', mass: 259, group: 16, period: 10, rcow: 1.6, rvdw: 2, color: '#BD0D87', color2: '#BD0D87', massSource: 'library' },
  { number: 103, symbol: 'Lr', name: "Lawrencium", zh: '铹', mass: 262, group: 17, period: 10, rcow: 1.6, rvdw: 2, color: '#C70066', color2: '#C70066', massSource: 'library' },
  { number: 104, symbol: 'Rf', name: "Rutherfordium", zh: '𬬻', mass: 261, group: 4, period: 7, rcow: 1.6, rvdw: 2, color: '#CC0059', color2: '#42A8DC', massSource: 'library' },
  { number: 105, symbol: 'Db', name: "Dubnium", zh: '𬭊', mass: 262, group: 5, period: 7, rcow: 1.6, rvdw: 2, color: '#D1004F', color2: '#4BA2F9', massSource: 'library' },
  { number: 106, symbol: 'Sg', name: "Seaborgium", zh: '𬭳', mass: 266, group: 6, period: 7, rcow: 1.6, rvdw: 2, color: '#D90045', color2: '#2194D6', massSource: 'library' },
  { number: 107, symbol: 'Bh', name: "Bohrium", zh: '𬭛', mass: 264, group: 7, period: 7, rcow: 1.6, rvdw: 2, color: '#E00038', color2: '#267DAB', massSource: 'library' },
  { number: 108, symbol: 'Hs', name: "Hassium", zh: '𬭶', mass: 277, group: 8, period: 7, rcow: 1.6, rvdw: 2, color: '#E6002E', color2: '#266696', massSource: 'library' },
  { number: 109, symbol: 'Mt', name: "Meitnerium", zh: '鿏', mass: 268, group: 9, period: 7, rcow: 1.6, rvdw: 2, color: '#EB0026', color2: '#175487', massSource: 'library' },
  { number: 110, symbol: 'Ds', name: "Darmstadtium", zh: '𫟼', mass: 281, group: 10, period: 7, rcow: 1.6, rvdw: 2, color: '#FF1493', color2: '#9595A0', massSource: 'library' },
  { number: 111, symbol: 'Rg', name: "Roentgenium", zh: '𬬭', mass: 272, group: 11, period: 7, rcow: 1.6, rvdw: 2, color: '#FF1494', color2: '#B9981A', massSource: 'library' },
  { number: 112, symbol: 'Cn', name: "Copernicium", zh: '鿔', mass: 277, group: 12, period: 7, rcow: 1.6, rvdw: 2, color: '#FF1495', color2: '#9595A9', massSource: 'library' },
  { number: 113, symbol: 'Nh', name: "Nihonium", zh: '鿭', mass: 286, group: 13, period: 7, rcow: 1.36, rvdw: 2, color: '#D90045', color2: '#9595A9', massSource: 'library' },
  { number: 114, symbol: 'Fl', name: "Flerovium", zh: '𫓧', mass: 289, group: 14, period: 7, rcow: 1.43, rvdw: 2, color: '#D1004F', color2: '#9595A9', massSource: 'library' },
  { number: 115, symbol: 'Mc', name: "Moscovium", zh: '镆', mass: 290, group: 15, period: 7, rcow: 1.62, rvdw: 2, color: '#CC0059', color2: '#9595A9', massSource: 'library' },
  { number: 116, symbol: 'Lv', name: "Livermorium", zh: '𫟷', mass: 293, group: 16, period: 7, rcow: 1.75, rvdw: 2, color: '#C70066', color2: '#9595A9', massSource: 'library' },
  { number: 117, symbol: 'Ts', name: "Tennessine", zh: '鿬', mass: 294, group: 17, period: 7, rcow: 1.65, rvdw: 2, color: '#BD0D87', color2: '#9595A9', massSource: 'library' },
  { number: 118, symbol: 'Og', name: "Oganesson", zh: '鿫', mass: 294, group: 18, period: 7, rcow: 1.57, rvdw: 2, color: '#B30DA6', color2: '#9595A9', massSource: 'library' },
];

/**
 * Element categories, as explicit data rather than a rule over the grid.
 *
 * Deriving these from group and period looks tidy and is wrong. Carbon,
 * nitrogen, oxygen, phosphorus and sulfur sit in groups 14-16 alongside tin and
 * lead, so a positional rule files them as post-transition metals; astatine in
 * group 17 comes out a halogen when it is a metalloid. The staircase separating
 * metals from non-metals does not follow the column boundaries — it cuts
 * diagonally through them. Thirteen of the 118 were mislabelled that way.
 *
 * The f-block is the one case where position *is* the definition: periods 9 and
 * 10 exist in this table solely to hold the lanthanides and actinides.
 */
const CATEGORY_MEMBERS = {
  alkali: ['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'],
  alkaline: ['Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra'],
  transition: [
    'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
    'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
    'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
    'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn',
  ],
  postTransition: ['Al', 'Ga', 'In', 'Sn', 'Tl', 'Pb', 'Bi', 'Po', 'Nh', 'Fl', 'Mc', 'Lv'],
  metalloid: ['B', 'Si', 'Ge', 'As', 'Sb', 'Te', 'At'],
  nonmetal: ['H', 'C', 'N', 'O', 'P', 'S', 'Se'],
  halogen: ['F', 'Cl', 'Br', 'I', 'Ts'],
  noble: ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og'],
  lanthanide: [],
  actinide: [],
};

/** Category names in the order they read best across a legend. */
export const ELEMENT_CATEGORIES = Object.keys(CATEGORY_MEMBERS);

/**
 * One colour per category, for the "colour by category" view.
 *
 * The per-element CPK colours elsewhere in this file cannot serve here: they
 * distinguish 118 individual elements, so colouring by them produces 118 hues
 * and shows no grouping at all. These are the same hues as the conventional
 * periodic-table colouring, which is what a reader already recognises.
 */
export const CATEGORY_COLOR = {
  alkali: '#ff7a6b',
  alkaline: '#ffb15c',
  transition: '#8fa4bd',
  postTransition: '#7fb69b',
  metalloid: '#62c9c3',
  nonmetal: '#4ea1ff',
  halogen: '#8ee06a',
  noble: '#c78cf0',
  lanthanide: '#e08fc0',
  actinide: '#d9708a',
};

const CATEGORY_BY_SYMBOL = new Map();
for (const [category, symbols] of Object.entries(CATEGORY_MEMBERS)) {
  for (const symbol of symbols) CATEGORY_BY_SYMBOL.set(symbol, category);
}
for (const el of ELEMENTS) {
  if (el.period === 9) CATEGORY_BY_SYMBOL.set(el.symbol, 'lanthanide');
  else if (el.period === 10) CATEGORY_BY_SYMBOL.set(el.symbol, 'actinide');
}

/**
 * Category for an element, by symbol or by element object.
 *
 * Throws on an unassigned element rather than falling back to a default. A
 * quietly plausible default is exactly how the thirteen wrong labels above
 * shipped: nothing failed, the table just said something untrue.
 */
export function categoryOf(el) {
  const symbol = typeof el === 'string' ? el : el?.symbol;
  const category = CATEGORY_BY_SYMBOL.get(symbol);
  if (category === undefined) {
    throw new Error(`elements: no category assigned for ${String(symbol)}`);
  }
  return category;
}

/**
 * Block (s/p/d/f) — the one property where grid position really is the
 * definition, because the block names the subshell being filled and the grid
 * is laid out to show exactly that.
 *
 * Helium is the exception, and only helium: it sits in group 18 with the p-block
 * gases but its configuration is 1s², so it belongs to the s-block.
 */
export function blockOf(el) {
  const symbol = typeof el === 'string' ? el : el?.symbol;
  const found = typeof el === 'string' ? elementBySymbol(el) : el;
  if (!found) throw new Error(`elements: unknown element ${String(symbol)}`);
  if (found.period === 9 || found.period === 10) return 'f';
  if (symbol === 'He') return 's';
  const g = found.group;
  if (g <= 2) return 's';
  if (g >= 13) return 'p';
  return 'd';
}

/** Symbol to element. Returns null rather than throwing: callers render tables. */
export function elementBySymbol(symbol) {
  if (typeof symbol !== 'string' || symbol.length === 0) return null;
  return ELEMENTS.find((e) => e.symbol === symbol) ?? null;
}

/** Grid position for rendering, or null for an unknown symbol. */
export function gridPosition(symbol) {
  const el = elementBySymbol(symbol);
  return el ? { col: el.group, row: el.period } : null;
}
