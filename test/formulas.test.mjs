import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FORMULAS, formulaOf, allFieldKeys } from '../src/calc/data/formulas.mjs';
import { DIMENSIONS } from '../src/calc/units.mjs';
import { LABELLED_KEYS } from '../src/ui/field-labels.mjs';

/*
 * The registry declares what each calculation takes and returns. These tests
 * are what stops the declaration from becoming fiction.
 *
 * A registry that drifts from the code is worse than no registry: it reads as
 * authoritative, it is used to generate the form and the export header, and
 * nothing about it looks wrong. The only defence is to check every claim
 * against the thing it claims about — the tab components and the calc modules.
 */

const UI = path.resolve(import.meta.dirname, '../src/ui');
const CALC = path.resolve(import.meta.dirname, '../src/calc');

/** Every .jsx/.mjs file under a directory, recursively. */
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return filesUnder(p);
    return /\.(jsx|mjs)$/.test(e.name) ? [p] : [];
  });
}

describe('formula registry', () => {
  it('should declare each formula once', () => {
    const ids = FORMULAS.map((f) => f.id);
    expect(new Set(ids).size, 'a formula id appears twice').toBe(ids.length);
  });

  it('should give every formula the provenance it needs to be checkable', () => {
    // A chemistry answer with no stated origin is a rumour: the student cannot
    // check it, and the tool is asking to be trusted instead of verified.
    for (const f of FORMULAS) {
      expect(f.equation, `${f.id} equation`).toBeTruthy();
      expect(f.source, `${f.id} source`).toBeTruthy();
      expect(f.source.length, `${f.id} source is too short to be a citation`).toBeGreaterThan(20);
      expect(Array.isArray(f.assumptions), `${f.id} assumptions`).toBe(true);
      expect(f.assumptions.length, `${f.id} states no assumptions`).toBeGreaterThan(0);
    }
  });

  it('should give every input a type and a dimension that exists', () => {
    for (const f of FORMULAS) {
      for (const i of f.inputs) {
        expect(['number', 'text', 'select'], `${f.id}.${i.key} type`).toContain(i.type);
        if (i.unit !== null) {
          expect(DIMENSIONS[i.unit], `${f.id}.${i.key} unit "${i.unit}"`).toBeTruthy();
        }
      }
    }
  });

  it('should give every output a dimension that exists', () => {
    for (const f of FORMULAS) {
      expect(f.outputs.length, `${f.id} has no outputs`).toBeGreaterThan(0);
      for (const o of f.outputs) {
        if (o.unit !== null) {
          expect(DIMENSIONS[o.unit], `${f.id}.${o.key} unit "${o.unit}"`).toBeTruthy();
        }
      }
    }
  });

  it('should label every declared field', () => {
    // The registry is what the export header is built from, so an unlabelled
    // key here is a spreadsheet column reading `massG`.
    const unlabelled = allFieldKeys().filter((k) => !LABELLED_KEYS.includes(k));
    expect(unlabelled, `declared but unlabelled: ${unlabelled.join(', ')}`).toEqual([]);
  });

  it('should mark a select input with the table it draws from', () => {
    for (const f of FORMULAS) {
      for (const i of f.inputs) {
        if (i.type === 'select') {
          expect(i.options, `${f.id}.${i.key} is a select with no options table`).toBeTruthy();
        }
      }
    }
  });

  it('should give every numeric input a non-negative floor where one applies', () => {
    // A concentration, a mass, a volume: none can be negative, and a form that
    // lets one be typed produces a plausible wrong answer rather than an error.
    const mustBePositive = /conc|molarity|molality|mass|volume|percent|epsilon|density|factor|steps|n$|i$/i;
    for (const f of FORMULAS) {
      for (const i of f.inputs) {
        if (i.type !== 'number') continue;
        if (!mustBePositive.test(i.key)) continue;
        expect(typeof i.min, `${f.id}.${i.key} has no minimum`).toBe('number');
      }
    }
  });
});

describe('registry against the code', () => {
  it('should point every formula at a module that exists', () => {
    for (const f of FORMULAS) {
      if (!f.module) continue;
      expect(fs.existsSync(path.join(CALC, f.module)), `${f.id} -> ${f.module}`).toBe(true);
    }
  });

  it('should name only record keys the tabs actually write', () => {
    /*
     * Every declared key must appear somewhere in the UI as a recorded key.
     *
     * This is the check that makes the registry trustworthy. A key renamed in a
     * tab but not here would leave the export column header describing a field
     * that no longer exists, and the real field would export with its raw key —
     * exactly the `massG` problem this registry was built to end.
     *
     * Read from source rather than by running the components: the tabs write
     * `const inputs = { formula, molarity: n(molarity) }`, so the keys are
     * literals at the call site.
     */
    const source = filesUnder(UI).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
    const missing = [];
    for (const f of FORMULAS) {
      for (const field of [...f.inputs, ...f.outputs]) {
        // A key is written as `key:` in an object literal or read as `.key`.
        const written = new RegExp(`(^|[^\\w.])${field.key}\\s*[,:}]`).test(source);
        if (!written) missing.push(`${f.id}.${field.key}`);
      }
    }
    expect(missing, `declared but never written by any tab: ${missing.join(', ')}`).toEqual([]);
  });

  it('should not declare a field the field-label table has never heard of', () => {
    // The converse of the label test above, stated from the registry's side:
    // this catches a key invented here that no calculation produces.
    for (const f of FORMULAS) {
      for (const field of [...f.inputs, ...f.outputs]) {
        expect(
          LABELLED_KEYS.includes(field.key),
          `${f.id}.${field.key} is declared but has no label, so it is probably invented`,
        ).toBe(true);
      }
    }
  });
});

describe('formulaOf', () => {
  it('should find a formula by id', () => {
    expect(formulaOf('weigh')?.equation).toContain('m = c');
  });

  it('should return null rather than throwing for an unknown id', () => {
    expect(formulaOf('nope')).toBeNull();
    expect(formulaOf(undefined)).toBeNull();
  });
});
