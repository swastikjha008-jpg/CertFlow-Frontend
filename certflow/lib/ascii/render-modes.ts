import { clamp01, hash2, rampColor, rgbToCss } from "./color-processing";
import type { CharSetName, RenderMode } from "./types";

/**
 * Per-cell mark drawing for every render mode.
 *
 * The renderer owns one reusable `Mark` object and fills it for each cell, so there are
 * no per-cell allocations in the hot loop. All shapes are drawn with Canvas2D primitives
 * (rects, arcs, paths, text) – no images, no external assets.
 */

export interface Mark {
  ctx: CanvasRenderingContext2D;
  /** Cell rectangle (css px). */
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Animated intensity 0–1. */
  v: number;
  /** Stable per-cell random numbers (0–1). */
  h1: number;
  h2: number;
  /** Slowly changing per-cell random number (glyph flipping). */
  h3: number;
  /** Direction along the local contour, radians. */
  angle: number;
  col: number;
  row: number;
  rows: number;
  /** Speed-scaled animation time in seconds. */
  time: number;
  glyphs: string[];
}

const TAU = Math.PI * 2;

export const GLYPH_RAMPS: Record<Exclude<CharSetName, "custom">, string[]> = {
  binary: [".", "0", "1"],
  standard: [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"],
  blocks: [" ", "░", "▒", "▓", "█"],
  minimal: [" ", ".", ":", "|", "+"],
};

const MATRIX_GLYPHS = "01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ".split("");
const HEX_DIGITS = "0123456789ABCDEF";

export function getGlyphs(charSet: CharSetName, custom: string): string[] {
  if (charSet === "custom") {
    const chars = Array.from(custom.replace(/\s+/g, " ")).filter((c) => c.length > 0);
    return chars.length > 0 ? chars : GLYPH_RAMPS.standard;
  }
  return GLYPH_RAMPS[charSet];
}

/** Modes that draw text and therefore need the font configured. */
export const GLYPH_MODES: ReadonlySet<RenderMode> = new Set(["characters", "dither", "hexdump", "matrix"]);

/** 4×4 Bayer matrix (normalised to 0–1) used for ordered dithering. */
export const BAYER_4X4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);

/** Honeycomb layout: odd rows shift half a cell. */
export function rowOffset(mode: RenderMode, row: number, cellWidth: number): number {
  return mode === "hexagons" && row % 2 === 1 ? cellWidth / 2 : 0;
}

function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, sides: number, rotation: number) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * TAU;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rad = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.85);
  ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.05, cx - s * 0.75, cy - s * 1.15, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.75, cy - s * 1.15, cx + s * 1.5, cy - s * 0.05, cx, cy + s * 0.85);
  ctx.closePath();
}

function strokeSegment(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, length: number, width: number) {
  const dx = (Math.cos(angle) * length) / 2;
  const dy = (Math.sin(angle) * length) / 2;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy - dy);
  ctx.lineTo(cx + dx, cy + dy);
  ctx.stroke();
}

function shade(ctx: CanvasRenderingContext2D, alpha: number, light: boolean) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  ctx.fillStyle = light ? "#ffffff" : "#000000";
  ctx.fill();
  ctx.globalAlpha = previous;
}

const BRAILLE_POSITIONS: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];
const BRAILLE_ORDER = [0, 3, 1, 4, 2, 5, 6, 7];

/** Draw a single cell. `ctx.fillStyle` / `strokeStyle` are already set to the cell colour. */
export function drawMark(mode: RenderMode, m: Mark): void {
  const { ctx, x, y, w, h, cx, cy, v } = m;
  const r = Math.min(w, h) / 2;

  switch (mode) {
    case "characters": {
      const g = m.glyphs;
      let ch: string;
      if (g === GLYPH_RAMPS.binary) {
        ch = v < 0.28 ? "." : m.h3 > 0.5 ? "1" : "0";
      } else {
        ch = g[Math.min(g.length - 1, Math.floor(v * g.length))];
      }
      if (ch !== " ") ctx.fillText(ch, cx, cy);
      break;
    }
    case "dither": {
      // Ordered-dither distribution of tiny glyphs: density follows luminance, so the
      // image emerges from a field of flowing characters (binary 0/1 by default).
      const g = m.glyphs;
      const ch = g === GLYPH_RAMPS.binary ? (m.h3 > 0.5 ? "1" : "0") : g[Math.min(g.length - 1, Math.floor(v * g.length))];
      if (ch !== " ") ctx.fillText(ch, cx, cy);
      break;
    }
    case "mosaic":
      ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
      break;
    case "pixel": {
      const s = w * (0.45 + 0.55 * v);
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      break;
    }
    case "dots":
      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.22 + 0.7 * v), 0, TAU);
      ctx.fill();
      break;
    case "cross": {
      const t = Math.max(1, w * 0.13);
      const len = w * (0.35 + 0.55 * v);
      ctx.fillRect(cx - len / 2, cy - t / 2, len, t);
      ctx.fillRect(cx - t / 2, cy - len / 2, t, len);
      break;
    }
    case "diamond":
      polygon(ctx, cx, cy, r * (0.3 + 0.75 * v), 4, Math.PI / 2);
      ctx.fill();
      break;
    case "voxel": {
      // Isometric cube: lit top, mid left face, dark right face.
      const s = r * (0.55 + 0.45 * v);
      const k = 0.866 * s;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + k, cy - s / 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - k, cy - s / 2);
      ctx.closePath();
      ctx.fill();
      shade(ctx, 0.25, true);
      ctx.beginPath();
      ctx.moveTo(cx - k, cy - s / 2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - k, cy + s / 2);
      ctx.closePath();
      ctx.fill();
      shade(ctx, 0.18, false);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + k, cy - s / 2);
      ctx.lineTo(cx + k, cy + s / 2);
      ctx.lineTo(cx, cy + s);
      ctx.closePath();
      ctx.fill();
      shade(ctx, 0.38, false);
      break;
    }
    case "lego": {
      const bw = w * 0.86;
      const bh = h * (0.5 + 0.28 * v);
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + h * 0.08;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, w * 0.08);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      // bottom shade for depth
      ctx.beginPath();
      ctx.rect(bx, by + bh * 0.72, bw, bh * 0.28);
      shade(ctx, 0.28, false);
      // stud
      ctx.beginPath();
      ctx.ellipse(cx, by - h * 0.02, w * 0.2, h * 0.11, 0, 0, TAU);
      ctx.fill();
      shade(ctx, 0.3, true);
      break;
    }
    case "mixed": {
      const kind = Math.floor(m.h1 * 4);
      if (kind === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * (0.22 + 0.7 * v), 0, TAU);
        ctx.fill();
      } else if (kind === 1) {
        polygon(ctx, cx, cy, r * (0.3 + 0.75 * v), 4, Math.PI / 2);
        ctx.fill();
      } else if (kind === 2) {
        const t = Math.max(1, w * 0.13);
        const len = w * (0.35 + 0.55 * v);
        ctx.fillRect(cx - len / 2, cy - t / 2, len, t);
        ctx.fillRect(cx - t / 2, cy - len / 2, t, len);
      } else {
        const s = w * (0.4 + 0.5 * v);
        ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      }
      break;
    }
    case "lines":
      strokeSegment(ctx, cx, cy, m.angle, w * (0.35 + 0.65 * v), Math.max(1, w * 0.1));
      break;
    case "diagonal":
      strokeSegment(ctx, cx, cy, m.h1 > 0.5 ? -Math.PI / 4 : Math.PI / 4, w * (0.4 + 0.6 * v), Math.max(1, w * 0.1));
      break;
    case "braille": {
      const lit = Math.round(v * 8);
      const dr = Math.max(0.8, w * 0.075);
      for (let k = 0; k < lit; k++) {
        const [c, rr] = BRAILLE_POSITIONS[BRAILLE_ORDER[k]];
        ctx.beginPath();
        ctx.arc(x + w * (0.3 + 0.4 * c), y + h * (0.14 + 0.24 * rr), dr, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "disco": {
      const hue = 190 + m.h1 * 70 + Math.sin(m.time * 1.3 + m.h2 * 6.28) * 22;
      const light = 55 + 30 * v;
      const prev = ctx.globalAlpha;
      ctx.fillStyle = `hsl(${hue.toFixed(0)} 90% ${light.toFixed(0)}%)`;
      ctx.globalAlpha = prev * 0.28;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.35 + 0.6 * v), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = prev;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.14 + 0.3 * v), 0, TAU);
      ctx.fill();
      break;
    }
    case "hexdump": {
      const ch = HEX_DIGITS[Math.floor(m.h3 * 16) % 16];
      ctx.fillText(ch, cx, cy);
      break;
    }
    case "matrix": {
      // Falling streaks: each column has its own speed/phase; head is bright, tail fades.
      const colHash = hash2(m.col, 0, 7);
      const t = m.row / Math.max(1, m.rows) - m.time * (0.08 + 0.1 * colHash) - colHash * 5;
      const trail = 1 - (t - Math.floor(t));
      const b = Math.pow(trail, 2.4);
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * clamp01(0.12 + b * v * 1.4);
      ctx.fillStyle = b > 0.93 ? "#d1fae5" : "#34d399";
      ctx.fillText(MATRIX_GLYPHS[Math.floor(m.h3 * MATRIX_GLYPHS.length) % MATRIX_GLYPHS.length], cx, cy);
      ctx.globalAlpha = prev;
      break;
    }
    case "rings": {
      ctx.lineWidth = Math.max(1, w * 0.09);
      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.3 + 0.62 * v), 0, TAU);
      ctx.stroke();
      if (v > 0.65) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.28, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case "hearts":
      heart(ctx, cx, cy, r * (0.4 + 0.5 * v));
      ctx.fill();
      break;
    case "stars":
      star(ctx, cx, cy, r * (0.4 + 0.65 * v));
      ctx.fill();
      break;
    case "hexagons":
      polygon(ctx, cx, cy, r * (0.55 + 0.5 * v), 6, Math.PI / 6);
      ctx.fill();
      break;
    case "triangles": {
      const s = r * (0.6 + 0.55 * v);
      const up = (m.col + m.row) % 2 === 0;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.8);
        ctx.lineTo(cx - s, cy + s * 0.8);
      } else {
        ctx.moveTo(cx, cy + s);
        ctx.lineTo(cx + s, cy - s * 0.8);
        ctx.lineTo(cx - s, cy - s * 0.8);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "bubbles": {
      const rad = r * (0.3 + 0.62 * v) * (0.75 + 0.25 * m.h2);
      const prev = ctx.globalAlpha;
      ctx.lineWidth = Math.max(1, w * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, TAU);
      ctx.globalAlpha = prev * 0.2;
      ctx.fill();
      ctx.globalAlpha = prev;
      ctx.stroke();
      ctx.globalAlpha = prev * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.65, Math.PI * 1.1, Math.PI * 1.45);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.globalAlpha = prev;
      break;
    }
    case "hatch": {
      // Pencil cross-hatching: more directions as the tone gets darker/brighter.
      const n = 1 + Math.floor(clamp01(v) * 3.99);
      ctx.lineWidth = Math.max(1, w * 0.07);
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y);
      if (n >= 2) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
      }
      if (n >= 3) {
        ctx.moveTo(x, cy);
        ctx.lineTo(x + w, cy);
      }
      if (n >= 4) {
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + h);
      }
      ctx.stroke();
      break;
    }
    case "contour":
      // Drawn as a whole-grid pass by the renderer (see drawContours).
      break;
    case "halfblocks":
      ctx.fillRect(x, y, w, h);
      break;
    default:
      break;
  }
}

/**
 * Topographic contour lines via marching squares over the cell-intensity field.
 * Iso-levels drift slowly with `phase` so the map appears to flow.
 */
export function drawContours(
  ctx: CanvasRenderingContext2D,
  field: Float32Array,
  cols: number,
  rows: number,
  cw: number,
  ch: number,
  phase: number,
  alpha: number,
  levels = 6,
): void {
  ctx.lineWidth = Math.max(1, cw * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = 0; k < levels; k++) {
    const level = ((k + phase) % levels) / levels;
    const [R, G, B] = rampColor(0.35 + level * 0.65);
    ctx.strokeStyle = rgbToCss(R, G, B);
    ctx.globalAlpha = alpha * (0.45 + 0.55 * level);
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const tl = field[j * cols + i];
        const tr = field[j * cols + i + 1];
        const br = field[(j + 1) * cols + i + 1];
        const bl = field[(j + 1) * cols + i];
        const idx = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = (i + 0.5) * cw;
        const y0 = (j + 0.5) * ch;
        const interp = (a: number, b: number) => {
          const d = b - a;
          return d === 0 ? 0.5 : clamp01((level - a) / d);
        };
        const top = () => [x0 + interp(tl, tr) * cw, y0] as const;
        const right = () => [x0 + cw, y0 + interp(tr, br) * ch] as const;
        const bottom = () => [x0 + interp(bl, br) * cw, y0 + ch] as const;
        const left = () => [x0, y0 + interp(tl, bl) * ch] as const;
        const seg = (a: readonly [number, number], b: readonly [number, number]) => {
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        };
        switch (idx) {
          case 1:
          case 14:
            seg(left(), bottom());
            break;
          case 2:
          case 13:
            seg(bottom(), right());
            break;
          case 3:
          case 12:
            seg(left(), right());
            break;
          case 4:
          case 11:
            seg(top(), right());
            break;
          case 6:
          case 9:
            seg(top(), bottom());
            break;
          case 7:
          case 8:
            seg(left(), top());
            break;
          case 5:
            seg(left(), top());
            seg(bottom(), right());
            break;
          case 10:
            seg(top(), right());
            seg(left(), bottom());
            break;
          default:
            break;
        }
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
