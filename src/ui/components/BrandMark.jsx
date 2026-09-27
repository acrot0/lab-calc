import React, { useId } from 'react';

/**
 * The brand mark: a flask, with its contents stratified.
 *
 * ## Why the liquid has layers
 *
 * The previous mark was a well-drawn flask — neck, body, liquid level,
 * meniscus, a rising bubble. The craft was fine and the idea was the problem:
 * a flask is the *topic*, not the difference. A chemistry app drawing a flask
 * is a note-taking app drawing a pencil. Every competitor in this space could
 * ship the same mark, because they all have the same topic.
 *
 * What this app actually does that they do not is **keep every calculation**.
 * The README's own line is that the others "算完就忘". So the mark has to
 * encode *record*, not *chemistry* — and the way a record looks is strata:
 * each layer is one calculation, laid down on the one before it, the newest on
 * top and the oldest dimmest at the bottom.
 *
 * Read at 24px it is still unmistakably a flask with liquid in it. Read at
 * 512px the layers are the point. That is the same test the old mark passed and
 * this one has to pass too — a mark that only works large is an illustration.
 *
 * The bubble is gone. It was the one element that was purely decorative, and
 * the layers now carry the detail that the bubble was there to supply.
 *
 * ## Why inline SVG rather than a file
 *
 * It inherits `currentColor` and the theme's custom properties, so one
 * component serves every palette in both schemes. A PNG would need a variant
 * per theme and would still be the wrong colour the day a palette changed. It
 * also stays crisp at any zoom and costs no extra request.
 *
 * The geometry is deliberately not rounded. Everything else in this app uses
 * generous corner radii, so a mark with hard vertices is the one angular thing
 * on the page — which is what makes it read as a mark rather than as another
 * panel.
 */
export default function BrandMark({ size = 28, className = '' }) {
  const u = useId().replace(/:/g, '');

  /*
   * The body outline, used twice: once filled as the glass, once as a clip for
   * the layers.
   *
   * Clipping is what keeps the strata inside the flask without recomputing the
   * trapezoid's width at every band's height. The old mark avoided a clip
   * because its single liquid surface had to be a straight line across the
   * glass, and clipping would have given it the walls' slant. That concern does
   * not apply to the layers — only the topmost one is a surface, and its
   * straight edge is drawn explicitly below.
   *
   *   13,4 ── 19,4        neck
   *    │        │
   *   13,12 ── 19,12      shoulder
   *   ╱          ╲
   *  4,27 ──────── 28,27  base
   */
  const BODY = 'M12.6 4.5h6.8v7.2l8 13.4a1.6 1.6 0 0 1-1.4 2.4H6a1.6 1.6 0 0 1-1.4-2.4l8-13.4z';

  /*
   * Four records, newest first.
   *
   * The opacity ramp is what makes them read as time rather than as a striped
   * pattern: each layer is dimmer than the one above it, so the eye reads a
   * sequence with a direction instead of a texture. The values are spaced
   * widely enough to survive at 24px, where a 0.1 step would collapse into
   * a single tone.
   */
  const LAYERS = [
    { y: 15.6, opacity: 0.95 },
    { y: 18.5, opacity: 0.72 },
    { y: 21.4, opacity: 0.5 },
    { y: 24.3, opacity: 0.3 },
  ];
  const BASE = 28.4;

  return (
    <svg
      className={`brand-glyph ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/*
         * The glass is the **dim** half and the liquid the bright one.
         *
         * First attempt had the body on the full accent gradient and the strata
         * in accent over it — the layers vanished, because a translucent accent
         * band over an opaque accent wall is the same colour twice. The raster
         * icon has always drawn it the other way round (`GLASS_DIM` against
         * `LIQUID`), and for the same reason: walls that are darker than their
         * contents are what make a vessel read as a vessel.
         */}
        <linearGradient id={`${u}-glass`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--brand-deep, var(--accent))" stopOpacity="0.38" />
        </linearGradient>
        {/* The layers are lit like the glass in the illustrations: brighter at
            the top of the liquid body, settling toward the base. */}
        <linearGradient id={`${u}-liquid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-hover)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
        <clipPath id={`${u}-body`}>
          <path d={BODY} />
        </clipPath>
      </defs>

      <path d={BODY} fill={`url(#${u}-glass)`} />

      {/*
       * The strata, clipped to the glass.
       *
       * Drawn as full-width bands rather than as shapes following the walls:
       * the clip trims them to the flask, and a band whose edges are cut by the
       * clip is exactly what a layer of liquid in a tapered vessel looks like.
       *
       * Each band's opacity is the ramp value, and they overlap rather than
       * abut — a band drawn only down to the next one's top edge would leave a
       * hairline of bare glass between them at fractional coordinates.
       */}
      <g clipPath={`url(#${u}-body)`}>
        {LAYERS.map((layer, i) => (
          <rect
            key={layer.y}
            x="0"
            y={layer.y}
            width="32"
            height={(LAYERS[i + 1]?.y ?? BASE) - layer.y + 0.6}
            fill={`url(#${u}-liquid)`}
            opacity={layer.opacity}
          />
        ))}
      </g>

      {/* The top surface, drawn as its own straight line for the reason the
          clip cannot provide: inside the clip it would take the walls' slant,
          and a liquid level is the one edge that must be level. */}
      <path
        d="M8.9 15.6h14.2"
        stroke="var(--accent-hover)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* The rim, so the neck has an edge rather than an open end. */}
      <path d="M12.6 4.5h6.8" stroke="var(--accent-hover)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
