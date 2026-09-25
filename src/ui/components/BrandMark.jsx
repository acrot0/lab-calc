import React, { useId } from 'react';

/**
 * The brand mark: a flask reduced to geometry.
 *
 * ## Why this replaced an icon in a coloured box
 *
 * The previous mark was a Phosphor flask glyph inside a rounded gradient
 * square. That is the shape of a *generic app icon*, not of a brand: the box
 * was doing the visual work and the flask inside it was a 20px line drawing
 * that read as decoration. At the size a topbar wordmark needs, a line drawing
 * has no silhouette — it is a grey smudge with a highlight.
 *
 * So the mark is now solid geometry with its own silhouette: a neck, a body
 * that flares, and a liquid level. Three shapes, no container. It reads at
 * 24px because the silhouette is the mark, and it reads at 512px because the
 * gradient and the meniscus are still there when you look closely.
 *
 * ## Why inline SVG rather than a file
 *
 * Same reason as the illustrations: it inherits `currentColor` and the theme's
 * custom properties, so one component serves six palettes in both schemes. A
 * PNG would need twelve variants and would still be the wrong colour the day a
 * palette changed. It also stays crisp at any zoom and costs no extra request.
 *
 * The geometry is deliberately not rounded. Everything else in this app uses
 * generous corner radii, so a mark with hard vertices is the one angular thing
 * on the page — which is what makes it read as a mark rather than as another
 * panel.
 */
export default function BrandMark({ size = 28, className = '' }) {
  const u = useId().replace(/:/g, '');

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
         * The glass is lit from the upper left, the same direction as every
         * illustration in the app, so the whole set reads as one drawing.
         */}
        <linearGradient id={`${u}-glass`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="var(--accent-hover)" />
          <stop offset="55%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--brand-deep, var(--accent))" />
        </linearGradient>
        <linearGradient id={`${u}-liquid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.62" />
        </linearGradient>
      </defs>

      {/*
       * The body, drawn first and as one path so the neck and the flare share
       * an outline. Starting at the neck's top-left and going clockwise keeps
       * the winding consistent, which is what lets the liquid sit inside it.
       *
       *   13,4 ── 19,4        neck
       *    │        │
       *   13,12 ── 19,12      shoulder
       *   ╱          ╲
       *  4,27 ──────── 28,27  base
       */}
      <path
        d="M12.6 4.5h6.8v7.2l8 13.4a1.6 1.6 0 0 1-1.4 2.4H6a1.6 1.6 0 0 1-1.4-2.4l8-13.4z"
        fill={`url(#${u}-glass)`}
      />

      {/*
       * The liquid. A separate path rather than a clip of the body, because
       * its top edge is the meniscus and has to be a straight line across the
       * flask — clipping the body would give it the body's slanted sides at
       * the surface, which is the one place a level must be level.
       *
       * The corners are clipped to the body's interior by the narrower base
       * width, so the liquid never paints outside the glass.
       */}
      <path
        d="M8.9 17.5h14.2l4.9 8.2a1.1 1.1 0 0 1-1 1.6H5a1.1 1.1 0 0 1-1-1.6z"
        fill={`url(#${u}-liquid)`}
      />

      {/* The meniscus: a brighter line where the surface catches light. This is
          the detail that says "liquid at a level" rather than "two-tone shape". */}
      <path d="M8.9 17.5h14.2" stroke="var(--accent-hover)" strokeWidth="1.1" strokeLinecap="round" />

      {/* The rim, so the neck has an edge rather than an open end. */}
      <path d="M12.6 4.5h6.8" stroke="var(--accent-hover)" strokeWidth="1.6" strokeLinecap="round" />

      {/* One rising bubble — the mark's only detail that is not geometry, and
          what keeps it from reading as an abstract funnel. */}
      <circle cx="13.4" cy="23" r="1.25" fill="var(--accent-hover)" opacity="0.9" />
      <circle cx="18.4" cy="25.2" r="0.85" fill="var(--accent-hover)" opacity="0.7" />
    </svg>
  );
}
