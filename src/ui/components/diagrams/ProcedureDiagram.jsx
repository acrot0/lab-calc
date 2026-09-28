import React from 'react';
import { Diagram, VIEW } from '../Diagram.jsx';
import { flowLayout, FLOW, TEXT_LEFT, truncate } from '../../procedure-flow.mjs';
import { useI18n } from '../../LocaleContext.jsx';

/*
 * The bench procedure drawn as a flow.
 *
 * ## What the drawing adds over the numbered list
 *
 * `procedure.mjs` already writes the steps, and they appear in the Markdown
 * export and the printed report as text. What text cannot say is that the
 * order is not a suggestion: that the weighing happens before the transfer,
 * and that the transfer happens before the flask is made up to the mark. A
 * chain of boxes with arrows between them says it in a glance, and it is the
 * form a bench sheet or a protocol figure uses.
 *
 * ## Why the boxes are drawn from data rather than hand-placed
 *
 * A hand-placed figure would be wrong for any recipe whose step count or text
 * differs from the one it was drawn for, and there are five recipes with three
 * steps each in two languages. The layout is arithmetic in
 * `procedure-flow.mjs`, tested without a DOM, and this component is a loop.
 *
 * ## What each box carries
 *
 * The step number, the text, and a role stripe that says what sort of action
 * it is — measure, transfer, adjust. The stripe is the only colour in the
 * figure and it is not decoration: a reader looking for the weighing step
 * should find it without reading all three lines.
 */

/** Box fill by role, as a class so the theme decides the colour. */
const ROLE_CLASS = {
  amount: 'flow-box-amount',
  vessel: 'flow-box-vessel',
  condition: 'flow-box-condition',
};

/**
 * Which role a step has, from its text.
 *
 * Reading the rendered sentence rather than threading a kind through the
 * recipe: the templates are already written, and a step's wording is what a
 * reader uses to tell what it is. Matching on the verb is fragile against a
 * reworded template — but the failure is a box in the wrong colour, not a
 * wrong number, and the alternative is a parallel structure in
 * `procedure.mjs` that could disagree with the text it describes.
 */
function roleOf(text) {
  const s = String(text ?? '');
  if (/称取|量取|weigh|measure/i.test(s)) return 'amount';
  if (/转移|溶于|定容|transfer|dissolve|make up/i.test(s)) return 'vessel';
  return 'condition';
}

export default function ProcedureDiagram({ title, steps, theme }) {
  const { t } = useI18n();
  const { boxes, connectors } = flowLayout(steps);
  if (boxes.length === 0) return null;

  return (
    <Diagram
      label={title}
      caption={title}
      exportName="procedure"
      theme={theme}
      className="diagram-flow"
    >
      {/*
        The connectors first, so a box drawn over one hides the overlap rather
        than the arrow showing through the box it points at.
      */}
      {connectors.map((c) => (
        <g className="flow-link" key={`c${c.from}`}>
          <line x1={c.x} y1={c.y1} x2={c.x} y2={c.y2} />
          {/*
            The arrowhead is drawn rather than declared with `marker-end`.
            A marker is defined once in `<defs>` and referenced by id, and the
            SVG export serialises the element tree — the `<defs>` travels with
            it, but the id does not survive being pasted into a document that
            already has one. A path is self-contained.
          */}
          <path
            className="flow-arrow"
            d={`M${c.x - 4},${c.y2 - 5} L${c.x},${c.y2} L${c.x + 4},${c.y2 - 5}`}
          />
        </g>
      ))}

      {boxes.map((b) => (
        <g className={`flow-step ${ROLE_CLASS[roleOf(b.text)]}`} key={`b${b.index}`}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} />
          {/* The role stripe, on the leading edge. */}
          <rect className="flow-stripe" x={b.x} y={b.y} width={3} height={b.h} rx={1.5} />
          {/* The number, in the margin the stripe leaves. */}
          <text className="flow-num" x={b.x + 14} y={b.y + b.h / 2 + 4} textAnchor="middle">
            {b.index + 1}
          </text>
          {/* The step text, cut to the box — see `truncate` for why cut and not squeeze. */}
          <text className="flow-text" x={b.x + TEXT_LEFT} y={b.y + b.h / 2 + 4}>
            {truncate(b.text)}
          </text>
        </g>
      ))}

      {/* The figure's own frame reference, so a reader knows it is a flow. */}
      <text className="flow-axis-label" x={FLOW.w / 2} y={VIEW.h - 4} textAnchor="middle">
        {t('diagram.flowOrder')}
      </text>
    </Diagram>
  );
}

