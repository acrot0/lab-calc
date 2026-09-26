import React from 'react';
import { Result } from './Fields.jsx';

/**
 * The tab panel, split into a form column and a results column.
 *
 * ## The bug this exists to fix
 *
 * The card used to be a single grid with results placed in column 2 by
 * `grid-column`. That reads correctly and is wrong: **CSS Grid shares row
 * heights between columns.** A tall result in column 2 stretched row 1 for both
 * columns, so the primary button — which belongs in column 1, above the fold —
 * was pushed down by the full height of the result. Measured: a 282px result
 * moved the button 212px. That is the "the whole layout jumps down when I open
 * a result" complaint, and no amount of tuning `grid-auto-flow` fixes it,
 * because the shared row is what a grid *is*.
 *
 * Two columns that scroll past each other need two flow contexts. So the split
 * happens here: column 1 is one container, column 2 is another, and neither can
 * affect the other's internal layout.
 *
 * ## Why a component rather than editing thirteen tabs
 *
 * Every tab already ends with its `<Result>` elements in source order, but not
 * contiguously — Convert has a `<figure>` between two of them, and three tabs
 * wrap everything in a fragment and switch on a mode. Hand-moving the results
 * in each would be thirteen chances to misplace one, and the next tab added
 * would have to remember. Partitioning the children here means a tab is written
 * exactly as it reads, and the layout is decided once.
 */
export default function Card({ className = '', children }) {
  /*
   * Flatten fragments and wrappers into one list.
   *
   * Two shapes have to survive this. A tab that renders `<>…</>` around its
   * body would otherwise present one child — the fragment — and every element
   * inside it would land in the form column. And a `Result` wrapped in a plain
   * `<div>` (a conditional's wrapper, say) is not a direct child either, so a
   * non-recursive partition would miss it and the results column would never
   * open.
   *
   * Only fragments are unwrapped into the *same* list, because a fragment adds
   * no markup. A wrapper element is kept as a unit — moving a `Result` out of
   * its `<div>` would change the DOM the tab asked for — so the walk descends
   * to *find* results without relocating them, and a wrapper counts as a form
   * child if it holds no results.
   */
  const flat = [];
  const containsResult = (nodes) => React.Children.toArray(nodes).some((node) => {
    if (!React.isValidElement(node)) return false;
    if (node.type === Result) return true;
    // Fragments and host elements are both descended: a result can sit behind
    // either, and only the *type* of the result element itself decides.
    if (node.type === React.Fragment || typeof node.type === 'string') {
      return containsResult(node.props.children);
    }
    return false;
  });

  const walk = (nodes) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment) {
        walk(child.props.children);
        return;
      }
      flat.push(child);
    });
  };
  walk(children);

  /*
   * Partition on whether a child *holds* a result, not on whether it is one.
   *
   * The difference matters for a wrapped result: the wrapper must go in the
   * results column, or the result renders inside the form column and the split
   * is pointless.
   */
  const holdsResult = (node) => React.isValidElement(node) && containsResult([node]);
  const results = flat.filter(holdsResult);
  const form = flat.filter((c) => !holdsResult(c));

  /*
   * A `Result` with no value returns null, so a tab whose calculation has not
   * run yet has results in its markup and nothing on screen. Rendering the
   * column anyway is what produced an empty right half on ten of the fifteen
   * tabs — the "space is too empty" report, and the same defect as the stranded
   * button: the two-column layout firing when it has nothing to lay out.
   *
   * The props are the only thing available before render, and they are enough:
   * every `Result` takes `value`, and a null or undefined one draws nothing.
   * So the column is rendered only when at least one result will actually
   * appear, and the card stays a single full-width column until then.
   */
  const anyValue = (node) => {
    if (!React.isValidElement(node)) return false;
    if (node.type === Result) {
      return node.props?.value !== null && node.props?.value !== undefined;
    }
    if (node.type === React.Fragment || typeof node.type === 'string') {
      return React.Children.toArray(node.props.children).some(anyValue);
    }
    return false;
  };
  const willRender = results.some(anyValue);

  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      <div className="card-main">{form}</div>
      {willRender && <div className="card-results">{results}</div>}
    </div>
  );
}
