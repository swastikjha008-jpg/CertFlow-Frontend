import type { AsciiConfig, BlendMode, ToneCurvePoint } from "./types";

/**
 * Cell-grid colour pipeline.
 *
 * The source image is first reduced to one average colour per grid cell (done by the
 * renderer with a canvas downscale). This module then applies, in the specified order:
 *   brightness → contrast → saturation → grayscale → tone curve → tint → blur
 * and finally derives luminance, edge strength and gradient angle per cell.
 * Everything here is deterministic and runs only when the image or settings change,
 * never per animation frame.
 */

export interface CellGrid {
  cols: number;
  rows: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Rec.709 luminance, 0–1 (after the whole pipeline). */
  lum: Float32Array;
  /** Sobel edge magnitude, 0–1. */
  edge: Float32Array;
  /** Direction along the contour (perpendicular to the gradient), radians. */
  angle: Float32Array;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(clamp01(r) * 255)},${Math.round(clamp01(g) * 255)},${Math.round(clamp01(b) * 255)})`;
}

export const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function softLightD(b: number): number {
  return b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
}

/** Per-channel blend of `src` over `base` (both 0–1). */
export function blendChannel(mode: BlendMode, base: number, src: number): number {
  switch (mode) {
    case "multiply":
      return base * src;
    case "screen":
      return 1 - (1 - base) * (1 - src);
    case "overlay":
      return base < 0.5 ? 2 * base * src : 1 - 2 * (1 - base) * (1 - src);
    case "lighten":
      return Math.max(base, src);
    case "soft-light":
      return src <= 0.5
        ? base - (1 - 2 * src) * base * (1 - base)
        : base + (2 * src - 1) * (softLightD(base) - base);
    default:
      return src;
  }
}

/** 256-entry lookup table from a piecewise-linear tone curve. */
export function buildToneLut(curve: ToneCurvePoint[]): Float32Array {
  const pts = [...curve].sort((a, b) => a.x - b.x);
  const lut = new Float32Array(256);
  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i / 255;
    return lut;
  }
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < pts.length - 2 && x > pts[seg + 1].x) seg++;
    const a = pts[seg];
    const b = pts[seg + 1];
    const span = b.x - a.x || 1;
    lut[i] = clamp01(a.y + ((x - a.x) / span) * (b.y - a.y));
  }
  return lut;
}

/** Build the processed cell grid from raw RGBA pixels (one pixel per cell). */
export function buildCellGrid(pixels: Uint8ClampedArray, cols: number, rows: number, cfg: AsciiConfig): CellGrid {
  const n = cols * rows;
  let r: Float32Array = new Float32Array(n);
  let g: Float32Array = new Float32Array(n);
  let b: Float32Array = new Float32Array(n);

  const bri = cfg.brightness / 100;
  const con = cfg.contrast / 100;
  const sat = cfg.saturation / 100;
  const gray = cfg.grayscale / 100;
  const lut = buildToneLut(cfg.toneCurve);
  const [tr, tg, tb] = hexToRgb01(cfg.tint);
  const tintAmount = cfg.tintOpacity / 100;

  for (let i = 0; i < n; i++) {
    let R = pixels[i * 4] / 255;
    let G = pixels[i * 4 + 1] / 255;
    let B = pixels[i * 4 + 2] / 255;

    // 1. brightness
    R = clamp01(R + bri);
    G = clamp01(G + bri);
    B = clamp01(B + bri);
    // 2. contrast (pivot at mid-grey)
    R = clamp01((R - 0.5) * con + 0.5);
    G = clamp01((G - 0.5) * con + 0.5);
    B = clamp01((B - 0.5) * con + 0.5);
    // 3. saturation
    let L = luminance(R, G, B);
    R = clamp01(L + (R - L) * sat);
    G = clamp01(L + (G - L) * sat);
    B = clamp01(L + (B - L) * sat);
    // 4. grayscale
    L = luminance(R, G, B);
    R += (L - R) * gray;
    G += (L - G) * gray;
    B += (L - B) * gray;
    // tone curve
    R = lut[Math.round(clamp01(R) * 255)];
    G = lut[Math.round(clamp01(G) * 255)];
    B = lut[Math.round(clamp01(B) * 255)];
    // 5. tint
    R += (blendChannel(cfg.overlayBlend, R, tr) - R) * tintAmount;
    G += (blendChannel(cfg.overlayBlend, G, tg) - G) * tintAmount;
    B += (blendChannel(cfg.overlayBlend, B, tb) - B) * tintAmount;

    r[i] = R;
    g[i] = G;
    b[i] = B;
  }

  // 6. blur (on the cell grid)
  const blurred = applyBlur(r, g, b, cols, rows, cfg);
  r = blurred.r;
  g = blurred.g;
  b = blurred.b;

  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = luminance(r[i], g[i], b[i]);

  const { edge, angle } = sobel(lum, cols, rows);
  return { cols, rows, r, g, b, lum, edge, angle };
}

/* ---------------------------------------------------------------- blur */

type Channels = { r: Float32Array; g: Float32Array; b: Float32Array };

function sampleClamped(src: Float32Array, cols: number, rows: number, x: number, y: number): number {
  const xi = x < 0 ? 0 : x >= cols ? cols - 1 : x;
  const yi = y < 0 ? 0 : y >= rows ? rows - 1 : y;
  return src[yi * cols + xi];
}

/** Separable box blur applied twice ≈ gaussian. */
function gaussianChannel(src: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  const n = cols * rows;
  let a: Float32Array = src;
  const size = radius * 2 + 1;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(n);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += sampleClamped(a, cols, rows, x + k, y);
        tmp[y * cols + x] = s / size;
      }
    }
    const out = new Float32Array(n);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += sampleClamped(tmp, cols, rows, x, y + k);
        out[y * cols + x] = s / size;
      }
    }
    a = out;
  }
  return a;
}

function gaussianAll(c: Channels, cols: number, rows: number, radius: number): Channels {
  return {
    r: gaussianChannel(c.r, cols, rows, radius),
    g: gaussianChannel(c.g, cols, rows, radius),
    b: gaussianChannel(c.b, cols, rows, radius),
  };
}

function directionalChannel(
  src: Float32Array,
  cols: number,
  rows: number,
  length: number,
  angleDeg: number,
  bothSides: boolean,
): Float32Array {
  const out = new Float32Array(cols * rows);
  const dx = Math.cos((angleDeg * Math.PI) / 180);
  const dy = Math.sin((angleDeg * Math.PI) / 180);
  const start = bothSides ? -length : 0;
  const count = length - start + 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let s = 0;
      for (let k = start; k <= length; k++) {
        s += sampleClamped(src, cols, rows, Math.round(x + dx * k), Math.round(y + dy * k));
      }
      out[y * cols + x] = s / count;
    }
  }
  return out;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

function mixChannels(sharp: Channels, soft: Channels, weight: Float32Array): Channels {
  const n = weight.length;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    r[i] = sharp.r[i] + (soft.r[i] - sharp.r[i]) * w;
    g[i] = sharp.g[i] + (soft.g[i] - sharp.g[i]) * w;
    b[i] = sharp.b[i] + (soft.b[i] - sharp.b[i]) * w;
  }
  return { r, g, b };
}

function applyBlur(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  cols: number,
  rows: number,
  cfg: AsciiConfig,
): Channels {
  const sharp: Channels = { r, g, b };
  if (cfg.blurType === "off" || cfg.blurAmount <= 0) return sharp;

  const amount = cfg.blurAmount / 100;
  const radius = Math.max(1, Math.round(amount * 4));

  if (cfg.blurType === "gaussian") return gaussianAll(sharp, cols, rows, radius);

  if (cfg.blurType === "directional") {
    const length = Math.max(1, Math.round(amount * 8));
    return {
      r: directionalChannel(r, cols, rows, length, cfg.blurAngle, cfg.directionalBothSides),
      g: directionalChannel(g, cols, rows, length, cfg.blurAngle, cfg.directionalBothSides),
      b: directionalChannel(b, cols, rows, length, cfg.blurAngle, cfg.directionalBothSides),
    };
  }

  // Spatially varying blur: blend sharp and fully-blurred by a weight map.
  const soft = gaussianAll(sharp, cols, rows, radius);
  const weight = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = cols > 1 ? x / (cols - 1) : 0.5;
      const ny = rows > 1 ? y / (rows - 1) : 0.5;
      let w = 0;
      if (cfg.blurType === "tilt") {
        // Horizontal sharp band centred on tiltPosition; blur ramps outside it.
        const d = Math.abs(ny - cfg.tiltPosition / 100);
        const half = cfg.tiltFocus / 200;
        w = smoothstep(half, half + Math.max(0.01, cfg.tiltFeather / 100), d);
      } else if (cfg.blurType === "lens") {
        // Radial: sharp inside lensFocus, blur outside.
        const cx = cfg.blurCenterX / 100;
        const cy = cfg.blurCenterY / 100;
        const aspect = cols / rows;
        const d = Math.hypot((nx - cx) * aspect, ny - cy) / Math.hypot(aspect, 1);
        const inner = (cfg.lensFocus / 100) * 0.7;
        w = smoothstep(inner, inner + 0.25, d);
      } else if (cfg.blurType === "progressive") {
        const pos = cfg.progressivePosition / 100;
        const t = cfg.progressiveReverse ? pos - ny : ny - pos;
        const range = cfg.progressiveReverse ? pos : 1 - pos;
        w = smoothstep(0, Math.max(0.01, range), t);
      }
      weight[y * cols + x] = w;
    }
  }
  return mixChannels(sharp, soft, weight);
}

/* --------------------------------------------------------------- edges */

function sobel(lum: Float32Array, cols: number, rows: number): { edge: Float32Array; angle: Float32Array } {
  const edge = new Float32Array(cols * rows);
  const angle = new Float32Array(cols * rows);
  const L = (x: number, y: number) => sampleClamped(lum, cols, rows, x, y);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const gx =
        -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy =
        -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      const i = y * cols + x;
      edge[i] = clamp01(Math.hypot(gx, gy) / 2);
      angle[i] = Math.atan2(gy, gx) + Math.PI / 2;
    }
  }
  return { edge, angle };
}

/* ----------------------------------------------------------- utilities */

/** Deterministic hash → [0,1). Used for stable per-cell variation (no Math.random per frame). */
export function hash2(i: number, j: number, seed = 0): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Piecewise colour ramp used by the "duotone" palette (deep blue → electric blue → cyan). */
const RAMP: Array<[number, [number, number, number]]> = [
  [0, [0.04, 0.1, 0.32]],
  [0.35, [0.14, 0.32, 0.8]],
  [0.7, [0.38, 0.65, 0.98]],
  [1, [0.55, 0.94, 0.98]],
];

export function rampColor(v: number): [number, number, number] {
  const t = clamp01(v);
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [t0, c0] = RAMP[i];
    const [t1, c1] = RAMP[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return RAMP[RAMP.length - 1][1];
}
