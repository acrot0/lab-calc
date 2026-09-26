// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { serializeDiagram, diagramFilename } from '../src/ui/svg-export.mjs';

/*
 * `serializeDiagram` reads the live DOM through `getComputedStyle`, so a real
 * test needs a real document — and jsdom is what this project already runs its
 * render tests in. The cases below are the ones where the export silently
 * produces something wrong rather than failing: an unstyled shape, a leaked
 * class, a colour that is not a colour.
 */
function svgDoc(markup) {
  document.body.innerHTML = markup;
  return document.querySelector('svg');
}

describe('serializeDiagram', () => {
  it('should produce a complete document that opens on its own', () => {
    const svg = svgDoc('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
    const out = serializeDiagram(svg);
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    // Without the namespace an SVG file opened directly is parsed as XML with
    // no known elements and renders nothing.
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('<circle');
  });

  it('should drop the classes that carry the styling', () => {
    // The classes are what the baked values replace; leaving them in means the
    // host document's CSS re-styles the figure.
    const svg = svgDoc('<svg viewBox="0 0 10 10"><path class="diagram-line" d="M0 0 L10 10"/></svg>');
    const out = serializeDiagram(svg);
    expect(out).not.toContain('class=');
    expect(out).toContain('d="M0 0 L10 10"');
  });

  it('should keep the geometry untouched', () => {
    const svg = svgDoc('<svg viewBox="0 0 480 270"><rect x="1" y="2" width="3" height="4"/></svg>');
    const out = serializeDiagram(svg);
    expect(out).toContain('viewBox="0 0 480 270"');
    expect(out).toContain('x="1"');
    expect(out).toContain('height="4"');
  });

  it('should keep the text content', () => {
    const svg = svgDoc('<svg viewBox="0 0 10 10"><text x="1" y="2">pH 7.4</text></svg>');
    expect(serializeDiagram(svg)).toContain('pH 7.4');
  });

  it('should apply the background it was given', () => {
    // An SVG element's computed background is transparent — the surface colour
    // lives on the container — so it has to be passed in or the export opens
    // on white with dim grey annotation that was designed for a dark surface.
    const svg = svgDoc('<svg viewBox="0 0 10 10"><circle cx="1" cy="1" r="1"/></svg>');
    expect(serializeDiagram(svg, { background: 'rgb(11, 13, 18)' }))
      .toContain('background:rgb(11, 13, 18)');
  });

  it('should not emit ids that could collide with the host document', () => {
    // `aria-labelledby` on the exported root would point at a title id that
    // the host page may already use for something else.
    const svg = svgDoc('<svg viewBox="0 0 10 10" aria-labelledby="t1"><title id="t1">x</title></svg>');
    const out = serializeDiagram(svg);
    expect(out).not.toContain('aria-labelledby');
    expect(out).not.toContain('id="t1"');
  });

  it('should return an empty string for a missing element', () => {
    // The caller may run before the diagram has mounted; an exception there
    // would break the render, and an empty export is the honest outcome.
    expect(serializeDiagram(null)).toBe('');
    expect(serializeDiagram(undefined)).toBe('');
  });
});

describe('diagramFilename', () => {
  it('should name the file after the diagram and the theme', () => {
    // A notebook accumulates these; "diagram.svg" three times over is a folder
    // nobody can search.
    expect(diagramFilename('buffer-hh', 'mocha')).toBe('lab-calc-buffer-hh-mocha.svg');
  });

  it('should slug anything that would not survive a filesystem', () => {
    expect(diagramFilename('Buffer HH / pH', 'dark')).toBe('lab-calc-buffer-hh-ph-dark.svg');
  });

  it('should fall back rather than produce a dotfile', () => {
    // An empty stem would give `lab-calc--mocha.svg`, and a leading dot would
    // hide the file on Unix.
    expect(diagramFilename('', 'dark')).toBe('lab-calc-diagram-dark.svg');
    expect(diagramFilename('///', 'dark')).toBe('lab-calc-diagram-dark.svg');
    expect(diagramFilename(null, 'dark')).toBe('lab-calc-diagram-dark.svg');
  });

  it('should name a missing theme rather than leave a gap', () => {
    expect(diagramFilename('x', undefined)).toBe('lab-calc-x-default.svg');
  });
});
