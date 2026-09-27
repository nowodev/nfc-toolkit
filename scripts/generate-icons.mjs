#!/usr/bin/env node
/**
 * Generates every app icon asset from one vector design.
 *
 *   node scripts/generate-icons.mjs
 *
 * Needs Google Chrome (renders the SVG) and ImageMagick (resizes). Writes the SVG
 * sources to assets/source/ and the PNGs referenced by app.json to assets/.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ASSETS = join(ROOT, 'assets');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIZE = 1024;

const COLORS = { top: '#4F7DF7', bottom: '#1E3A9E', glyph: '#FFFFFF' };

// ─── Design ────────────────────────────────────────────────────────────────
// A key-fob tag with a ring hole, radiating three signal arcs.
const O = { x: 324, y: 512 }; // tag centre / arc origin
const ARC_RADII = [210, 320, 430];
const ARC_OPACITY = [1, 0.82, 0.64];
const ARC_ANGLE = (42 * Math.PI) / 180;
const STROKE = 62;

function arc(r) {
  const x = O.x + r * Math.cos(ARC_ANGLE);
  const dy = r * Math.sin(ARC_ANGLE);
  return `M ${x.toFixed(1)} ${(O.y - dy).toFixed(1)} A ${r} ${r} 0 0 1 ${x.toFixed(1)} ${(O.y + dy).toFixed(1)}`;
}

/** The white glyph, scaled about the canvas centre. `flat` drops the arc fade (for monochrome). */
function glyph(scale, flat = false) {
  const arcs = ARC_RADII.map(
    (r, i) =>
      `<path d="${arc(r)}" fill="none" stroke="${COLORS.glyph}" stroke-width="${STROKE}" stroke-linecap="round" opacity="${flat ? 1 : ARC_OPACITY[i]}"/>`,
  ).join('\n    ');
  return `
  <defs>
    <mask id="hole">
      <rect width="${SIZE}" height="${SIZE}" fill="white"/>
      <circle cx="${O.x}" cy="${O.y}" r="34" fill="black"/>
    </mask>
  </defs>
  <g transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${scale}) translate(${-SIZE / 2} ${-SIZE / 2})">
    <rect x="${O.x - 88}" y="${O.y - 88}" width="176" height="176" rx="44" fill="${COLORS.glyph}" mask="url(#hole)"/>
    ${arcs}
  </g>`;
}

function background() {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.top}"/>
      <stop offset="1" stop-color="${COLORS.bottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.22" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}\n</svg>\n`;

// Android adaptive icons only guarantee a centred circle of 66/108 of the canvas,
// so the foreground glyph is shrunk to stay inside it.
const SOURCES = {
  icon: svg(background() + glyph(0.9)),
  'android-icon-background': svg(background()),
  'android-icon-foreground': svg(glyph(0.72)),
  'android-icon-monochrome': svg(glyph(0.72, true)),
  'splash-icon': svg(glyph(0.9)),
};

// ─── Render ────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'icons-'));

function render(name, content) {
  writeFileSync(join(ASSETS, 'source', `${name}.svg`), content);
  const html = join(tmp, `${name}.html`);
  writeFileSync(html, `<html><body style="margin:0;background:transparent">${content}</body></html>`);
  const png = join(tmp, `${name}.png`);
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${SIZE},${SIZE}`,
    `--screenshot=${png}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
  return png;
}

const OUTPUTS = [
  // [source, output file, size, flatten onto opaque background?]
  ['icon', 'icon.png', 1024, true], // iOS rejects icons with transparency
  ['icon', 'favicon.png', 48, true],
  ['android-icon-background', 'android-icon-background.png', 512, true],
  ['android-icon-foreground', 'android-icon-foreground.png', 512, false],
  ['android-icon-monochrome', 'android-icon-monochrome.png', 432, false],
  ['splash-icon', 'splash-icon.png', 1024, false],
];

const rendered = Object.fromEntries(Object.entries(SOURCES).map(([name, content]) => [name, render(name, content)]));

for (const [src, out, size, opaque] of OUTPUTS) {
  const args = [rendered[src], '-resize', `${size}x${size}`];
  if (opaque) args.push('-background', COLORS.bottom, '-alpha', 'remove', '-alpha', 'off');
  args.push(join(ASSETS, out));
  execFileSync('magick', args);
  console.log(`✓ assets/${out} (${size}×${size})`);
}
