import React, { useRef, useEffect, useId } from 'react';

/**
 * The shared drawing surface for explanatory diagrams.
 *
 * Every diagram in this app is one of these: a labelled figure that explains
 * where a formula comes from, drawn in SVG so it stays sharp at any zoom and
 * can be exported by copying the markup.
 *
 * SVG rather than canvas, which is the opposite of the choice the titration
 * curve makes. The two are answering different questions. A titration curve is
 * ~160 data points redrawn on every input change, with no interaction — a
 * canvas is cheaper there. A diagram is a few dozen static shapes that need to
 * carry text, scale with the page, and be readable by a screen reader; SVG is
 * the right tool and the cost is irrelevant at this size.
 *
 * The viewBox is fixed and the figure scales to its container, so a diagram
 * never has to know its rendered width. Coordinates below are in viewBox units.
 */

/** The drawing area, in viewBox units. 16:9, which fits the panel width. */
export const VIEW = { w: 480, h: 270 };

/**
 * Plot area inside the frame, leaving room for axis labels.
 *
 * Diagrams that draw axes use this; diagrams that do not (a beaker, a balance)
 * use the whole viewBox.
 */
export const PLOT = {
  left: 52, right: 456, top: 20, bottom: 224,
};

/**
 * A figure with a caption and an accessible description.
 *
 * `label` is what a screen reader announces; `caption` is what a sighted reader
 * reads. Both are required, because a diagram without either is decoration, and
 * decoration that carries the explanation is worse than no diagram.
 */
export function Diagram({ label, caption, children, className = '' }) {
  const titleId = useId();
  const descId = useId();
  return (
    <figure className={`diagram ${className}`.trim()}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="diagram-svg"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{label}</title>
        <desc id={descId}>{caption}</desc>
        {children}
      </svg>
      <figcaption className="diagram-caption">{caption}</figcaption>
    </figure>
  );
}

/** Maps a data coordinate to a viewBox coordinate. */
export function scale(value, domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * A point on a curve, drawn as a polyline path.
 *
 * `points` is `[{ x, y }]` in data coordinates; the domains map them into the
 * plot area. Returned as a path string rather than a `<polyline>` so the line
 * can be stroked with joins and caps that match the rest of the app.
 */
export function linePath(points, xDomain, yDomain, plot = PLOT) {
  return points
    .map((p, i) => {
      const x = scale(p.x, xDomain, [plot.left, plot.right]);
      const y = scale(p.y, yDomain, [plot.bottom, plot.top]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Axis with ticks and labels.
 *
 * Ticks are computed from the domain rather than passed in, so a diagram cannot
 * show a gridline that does not correspond to a value. `format` turns a number
 * into its label, which is where the significant-figures decisions live.
 */
export function Axis({
  xDomain, yDomain, xTicks = 5, yTicks = 5, xLabel, yLabel, format = (v) => String(v),
  plot = PLOT,
}) {
  const xs = ticks(xDomain, xTicks);
  const ys = ticks(yDomain, yTicks);
  return (
    <g className="diagram-axis">
      {/* The two spines. Drawn as lines rather than a rect so the plot area
          stays open where a curve leaves it. */}
      <line x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.bottom} />
      <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} />

      {xs.map((v) => {
        const x = scale(v, xDomain, [plot.left, plot.right]);
        return (
          <g key={`x${v}`}>
            <line x1={x} y1={plot.bottom} x2={x} y2={plot.bottom + 4} />
            <text x={x} y={plot.bottom + 15} textAnchor="middle">{format(v)}</text>
          </g>
        );
      })}
      {ys.map((v) => {
        const y = scale(v, yDomain, [plot.bottom, plot.top]);
        return (
          <g key={`y${v}`}>
            <line x1={plot.left - 4} y1={y} x2={plot.left} y2={y} />
            <text x={plot.left - 7} y={y + 3} textAnchor="end">{format(v)}</text>
          </g>
        );
      })}

      {xLabel && (
        <text x={(plot.left + plot.right) / 2} y={VIEW.h - 4} textAnchor="middle" className="diagram-axis-label">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={14}
          y={(plot.top + plot.bottom) / 2}
          textAnchor="middle"
          className="diagram-axis-label"
          transform={`rotate(-90 14 ${(plot.top + plot.bottom) / 2})`}
        >
          {yLabel}
        </text>
      )}
    </g>
  );
}

/** Evenly spaced tick values across a domain, endpoints included. */
function ticks([lo, hi], count) {
  if (count < 2) return [lo];
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => lo + step * i);
}

/**
 * An annotation: a short label with a leader line to a point on the figure.
 *
 * `anchor` picks which side the text sits on, so a caller does not have to
 * compute a direction that keeps the label inside the frame.
 */
export function Note({ x, y, to, anchor = 'end', children }) {
  const dx = anchor === 'end' ? -14 : 14;
  return (
    <g className="diagram-note">
      {to && <line x1={x} y1={y} x2={to.x} y2={to.y} />}
      <circle cx={to ? to.x : x} cy={to ? to.y : y} r={2.5} />
      <text x={x + dx} y={y + 4} textAnchor={anchor}>{children}</text>
    </g>
  );
}

/**
 * A bar showing a quantity, for diagrams about proportions.
 *
 * `segments` is `[{ value, color, label }]`; the widths come from the values,
 * so a bar cannot show a proportion its numbers do not support.
 */
export function Bar({ x, y, width, height, segments, showLabels = true }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let cursor = x;
  return (
    <g className="diagram-bar">
      {segments.map((seg) => {
        const w = (seg.value / total) * width;
        const el = (
          <g key={seg.label}>
            <rect x={cursor} y={y} width={w} height={height} fill={seg.color} rx={2} />
            {showLabels && w > 34 && (
              <text x={cursor + w / 2} y={y + height / 2 + 4} textAnchor="middle" className="diagram-bar-label">
                {seg.label}
              </text>
            )}
          </g>
        );
        cursor += w;
        return el;
      })}
    </g>
  );
}

/**
 * Draws `render(ctx)` once the figure scrolls into view, and never before.
 *
 * Not used by the diagrams above — those are static SVG, which costs nothing
 * off-screen. This is for the canvas figures in later phases, where a chart
 * with hundreds of points should not be drawn until someone looks at it. The
 * observer disconnects after the first intersection: redrawing on every scroll
 * would undo the saving.
 */
export function useDrawWhenVisible(draw, deps) {
  const ref = useRef(null);
  const drawn = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const run = () => {
      if (drawn.current) return;
      drawn.current = true;
      draw(el);
    };

    if (typeof IntersectionObserver === 'undefined') {
      run();
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        run();
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
