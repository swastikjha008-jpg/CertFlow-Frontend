import {
  buildCellGrid,
  clamp01,
  hash2,
  hexToRgb01,
  luminance,
  rampColor,
  rgbToCss,
  type CellGrid,
} from "@/lib/ascii/color-processing";
import { PostEffects } from "@/lib/ascii/post-effects";
import {
  BAYER_4X4,
  GLYPH_MODES,
  drawContours,
  drawMark,
  getGlyphs,
  rowOffset,
  type Mark,
} from "@/lib/ascii/render-modes";
import type { AsciiConfig, AsciiSource, BlendMode, CanvasFactory } from "@/lib/ascii/types";

/**
 * Canvas2D image → ASCII renderer.
 *
 * Pipeline (expensive work happens only when inputs change, never per frame):
 *   1. `rebuildGrid`  – downsample the cover-fitted source to one pixel per cell, run the
 *                       colour pipeline, derive per-cell intensity/colour/hash tables.
 *   2. `rebuildBackground` / `rebuildMask` – size-dependent layers.
 *   3. `render(t)`    – per frame: background, marks (with time-based animation), lights,
 *                       post effects. No React state, no allocations in the cell loop.
 */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const defaultCreate: CanvasFactory = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function compositeFor(blend: BlendMode): GlobalCompositeOperation {
  switch (blend) {
    case "overlay":
      // Canvas "overlay" multiplies on dark bases, which would make glyphs vanish on the
      // near-black navy canvas; a screen-style lift keeps the overlay look but stays visible.
    case "screen":
      return "screen";
    case "multiply":
      return "multiply";
    case "lighten":
      return "lighten";
    case "soft-light":
      return "soft-light";
    default:
      return "source-over";
  }
}

/** Cover-fit crop rectangle of a (sw×sh) source into a target aspect, anchored by focus. */
function coverRect(sw: number, sh: number, targetAspect: number, fx: number, fy: number) {
  const srcAspect = sw / sh;
  if (srcAspect > targetAspect) {
    const cw = sh * targetAspect;
    return { sx: (sw - cw) * fx, sy: 0, sw: cw, sh };
  }
  const ch = sw / targetAspect;
  return { sx: 0, sy: (sh - ch) * fy, sw, sh: ch };
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

export class AsciiRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly create: CanvasFactory;
  private readonly post: PostEffects;

  private cfg: AsciiConfig;
  private source: AsciiSource | null = null;
  private maskImage: CanvasImageSource | null = null;
  private maskImageSize = { w: 0, h: 0 };
  private maskUrl: string | null = null;
  private maskLoadToken = 0;

  private cssW = 0;
  private cssH = 0;
  private scale = 1;
  private lowPower = false;

  // grid state
  private gridKey = "";
  private bgKey = "";
  private maskKey = "";
  private dirty = true;
  private grid: CellGrid | null = null;
  private cell = 18;
  private cellH = 18;
  private cols = 0;
  private rows = 0;
  private gridRows = 0;
  private v0 = new Float32Array(0);
  private hashA = new Float32Array(0);
  private hashB = new Float32Array(0);
  private colorIndex = new Uint16Array(0);
  private colorLut: string[] = [];
  private cellMask = new Float32Array(0);
  private glyphs: string[] = [];

  private bgCanvas: HTMLCanvasElement | null = null;
  private revealCanvas: HTMLCanvasElement | null = null;

  private animTime = 0;
  private lastT = -1;
  private frame = 0;

  private readonly mark: Mark;

  constructor(canvas: HTMLCanvasElement, cfg: AsciiConfig, createCanvas: CanvasFactory = defaultCreate) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.create = createCanvas;
    this.cfg = cfg;
    this.post = new PostEffects(createCanvas);
    this.mark = {
      ctx,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      cx: 0,
      cy: 0,
      v: 0,
      h1: 0,
      h2: 0,
      h3: 0,
      angle: 0,
      col: 0,
      row: 0,
      rows: 0,
      time: 0,
      glyphs: [],
    };
  }

  /* ----------------------------------------------------------- inputs */

  setSource(source: AsciiSource | null): void {
    this.source = source;
    this.gridKey = "";
    this.bgKey = "";
    this.maskKey = "";
    this.dirty = true;
  }

  setConfig(cfg: AsciiConfig): void {
    this.cfg = cfg;
    this.syncMaskImage();
    this.dirty = true;
  }

  /** cssW/cssH are layout pixels; `dpr` is the (already capped) device-pixel ratio to render at. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW));
    const h = Math.max(1, Math.round(cssH));
    if (w === this.cssW && h === this.cssH && dpr === this.scale) return;
    this.cssW = w;
    this.cssH = h;
    this.scale = dpr;
    this.lowPower = w < 768;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.post.resize(this.canvas.width, this.canvas.height);
    this.gridKey = "";
    this.bgKey = "";
    this.maskKey = "";
    this.dirty = true;
  }

  /** True when the config asks for continuous motion. */
  get isAnimated(): boolean {
    return this.cfg.animated;
  }

  /** Load/clear the mask image when `cfg.mask.dataUrl` changes. Invalid data is ignored safely. */
  private syncMaskImage(): void {
    const url = this.cfg.mask.enabled ? this.cfg.mask.dataUrl : null;
    if (url === this.maskUrl) return;
    this.maskUrl = url;
    this.maskImage = null;
    this.maskKey = "";
    const token = ++this.maskLoadToken;
    if (!url || typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => {
      if (token !== this.maskLoadToken) return;
      this.maskImage = img;
      this.maskImageSize = { w: img.naturalWidth, h: img.naturalHeight };
      this.maskKey = "";
      this.dirty = true;
    };
    img.onerror = () => {
      if (token === this.maskLoadToken) this.maskImage = null;
    };
    img.src = url;
  }

  /* ------------------------------------------------- preprocessing */

  private computeGridKey(): string {
    const c = this.cfg;
    return JSON.stringify([
      this.cssW,
      this.cssH,
      this.lowPower,
      c.renderMode === "halfblocks",
      c.cellSize,
      c.invert,
      c.charSet,
      c.customChars,
      c.brightness,
      c.contrast,
      c.edgeEmphasis,
      c.density,
      c.toneCurve,
      c.tint,
      c.tintOpacity,
      c.overlayBlend,
      c.saturation,
      c.grayscale,
      c.blurType,
      c.blurAmount,
      c.blurAngle,
      c.directionalBothSides,
      c.tiltFocus,
      c.tiltPosition,
      c.tiltFeather,
      c.lensFocus,
      c.blurCenterX,
      c.blurCenterY,
      c.progressivePosition,
      c.progressiveReverse,
      c.palette,
    ]);
  }

  private rebuildGrid(): void {
    const src = this.source;
    const cfg = this.cfg;
    if (!src || this.cssW === 0) {
      this.grid = null;
      return;
    }
    const half = cfg.renderMode === "halfblocks";
    let cell = Math.max(6, cfg.cellSize);
    if (this.lowPower) cell = Math.max(cell, 14);
    const maxCells = this.lowPower ? 4500 : 14000;
    let cols = Math.ceil(this.cssW / cell);
    let rows = Math.ceil(this.cssH / cell);
    const total = cols * rows * (half ? 2 : 1);
    if (total > maxCells) {
      cell *= Math.sqrt(total / maxCells);
      cols = Math.ceil(this.cssW / cell);
      rows = Math.ceil(this.cssH / cell);
    }
    const gridRows = rows * (half ? 2 : 1);
    this.cell = cell;
    this.cellH = half ? cell / 2 : cell;
    this.cols = cols;
    this.rows = rows;
    this.gridRows = gridRows;

    // Two-step downscale (×3 intermediate) approximates an area average per cell.
    const mid = this.create(cols * 3, gridRows * 3);
    const midCtx = mid.getContext("2d");
    const sample = this.create(cols, gridRows);
    const sCtx = sample.getContext("2d", { willReadFrequently: true });
    if (!midCtx || !sCtx) return;
    const target = (cols * cell) / (gridRows * this.cellH);
    const crop = coverRect(src.width, src.height, target, src.focusX, src.focusY);
    midCtx.imageSmoothingEnabled = true;
    midCtx.imageSmoothingQuality = "high";
    midCtx.drawImage(src.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, mid.width, mid.height);
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = "high";
    sCtx.drawImage(mid, 0, 0, cols, gridRows);
    const pixels = sCtx.getImageData(0, 0, cols, gridRows).data;

    const grid = buildCellGrid(pixels, cols, gridRows, cfg);
    this.grid = grid;
    this.derive(grid);
  }

  /** Per-cell intensity, quantised colour index and stable hashes. */
  private derive(grid: CellGrid): void {
    const cfg = this.cfg;
    const n = grid.cols * grid.rows;
    this.v0 = new Float32Array(n);
    this.hashA = new Float32Array(n);
    this.hashB = new Float32Array(n);
    this.colorIndex = new Uint16Array(n);
    this.colorLut = [];
    this.glyphs = getGlyphs(cfg.charSet, cfg.customChars);
    const lutMap = new Map<number, number>();
    const edgeGain = (cfg.edgeEmphasis / 100) * 0.9;
    const densityShift = (cfg.density / 100) * 0.5;

    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        const k = j * grid.cols + i;
        const base = cfg.invert ? 1 - grid.lum[k] : grid.lum[k];
        const v = clamp01(base + grid.edge[k] * edgeGain + densityShift);
        this.v0[k] = v;
        this.hashA[k] = hash2(i, j, 1);
        this.hashB[k] = hash2(i, j, 2);

        let r: number;
        let g: number;
        let b: number;
        if (cfg.palette === "original") {
          // Brighten so dark photos still read on the dark canvas.
          r = clamp01(grid.r[k] * 1.15 + 0.08);
          g = clamp01(grid.g[k] * 1.15 + 0.08);
          b = clamp01(grid.b[k] * 1.15 + 0.08);
        } else {
          const [rr, rg, rb] = rampColor(0.12 + v * 0.88);
          // A little of the processed source colour keeps tint/saturation controls meaningful.
          r = rr * 0.7 + grid.r[k] * 0.3;
          g = rg * 0.7 + grid.g[k] * 0.3;
          b = rb * 0.7 + grid.b[k] * 0.3;
        }
        const key = ((r * 31) | 0) * 1024 + ((g * 31) | 0) * 32 + ((b * 31) | 0);
        let idx = lutMap.get(key);
        if (idx === undefined) {
          idx = this.colorLut.length;
          this.colorLut.push(rgbToCss(r, g, b));
          lutMap.set(key, idx);
        }
        this.colorIndex[k] = idx;
      }
    }
  }

  private rebuildBackground(): void {
    const cfg = this.cfg;
    const src = this.source;
    this.bgCanvas = null;
    if (!src || (cfg.bgMode !== "original" && cfg.bgMode !== "blurred")) return;
    // Blur is achieved by rendering the graded image at low resolution and scaling it up.
    const blur = cfg.bgMode === "blurred" ? cfg.bgBlur * 2 + 12 : cfg.bgBlur;
    const f = 1 / (1 + blur * 0.18);
    const w = Math.max(16, Math.round(this.cssW * f * 0.5));
    const h = Math.max(16, Math.round(this.cssH * f * 0.5));
    const small = this.create(w, h);
    const sctx = small.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;
    const crop = coverRect(src.width, src.height, this.cssW / this.cssH, src.focusX, src.focusY);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
    const img = sctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [tr, tg, tb] = hexToRgb01(cfg.tint);
    for (let p = 0; p < d.length; p += 4) {
      const l = luminance(d[p] / 255, d[p + 1] / 255, d[p + 2] / 255);
      const t = cfg.invert ? 1 - l : l;
      // Dark navy → deep electric blue, nudged toward the tint colour.
      const r = 0.015 + t * 0.03 + tr * 0.06;
      const g = 0.03 + t * 0.09 + tg * 0.06;
      const b = 0.08 + t * 0.26 + tb * 0.1;
      d[p] = clamp01(r) * 255;
      d[p + 1] = clamp01(g) * 255;
      d[p + 2] = clamp01(b) * 255;
      d[p + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    this.bgCanvas = small;
  }

  private rebuildMask(): void {
    const cfg = this.cfg;
    this.revealCanvas = null;
    this.cellMask = new Float32Array(0);
    if (!cfg.mask.enabled || !this.maskImage || !this.source || !this.grid) return;
    const aspect = this.cssW / this.cssH;
    const maskCrop = coverRect(this.maskImageSize.w, this.maskImageSize.h, aspect, 0.5, 0.5);
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Full-resolution reveal layer: the original photo, kept only where the mask applies.
    const reveal = this.create(W, H);
    const rctx = reveal.getContext("2d");
    if (!rctx) return;
    const crop = coverRect(this.source.width, this.source.height, aspect, this.source.focusX, this.source.focusY);
    rctx.drawImage(this.source.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
    rctx.globalCompositeOperation = cfg.mask.invert ? "destination-out" : "destination-in";
    rctx.drawImage(this.maskImage, maskCrop.sx, maskCrop.sy, maskCrop.sw, maskCrop.sh, 0, 0, W, H);
    this.revealCanvas = reveal;

    // Per-cell coverage so marks are skipped where the photo shows through.
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const cm = this.create(cols, rows);
    const cctx = cm.getContext("2d", { willReadFrequently: true });
    if (!cctx) return;
    cctx.drawImage(this.maskImage, maskCrop.sx, maskCrop.sy, maskCrop.sw, maskCrop.sh, 0, 0, cols, rows);
    const data = cctx.getImageData(0, 0, cols, rows).data;
    this.cellMask = new Float32Array(cols * rows);
    for (let k = 0; k < cols * rows; k++) {
      const a = data[k * 4 + 3] / 255;
      this.cellMask[k] = cfg.mask.invert ? 1 - a : a;
    }
  }

  private ensureBuilt(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const gk = this.computeGridKey();
    if (gk !== this.gridKey) {
      this.gridKey = gk;
      this.rebuildGrid();
      this.maskKey = "";
    }
    const cfg = this.cfg;
    const bk = JSON.stringify([this.cssW, this.cssH, cfg.bgMode, cfg.bgBlur, cfg.invert, cfg.tint]);
    if (bk !== this.bgKey) {
      this.bgKey = bk;
      this.rebuildBackground();
    }
    const mk = JSON.stringify([this.cssW, this.cssH, this.canvas.width, cfg.mask.enabled, cfg.mask.invert, cfg.mask.dataUrl, this.maskImage !== null, gk]);
    if (mk !== this.maskKey) {
      this.maskKey = mk;
      this.rebuildMask();
    }
  }

  /* ------------------------------------------------------------ frame */

  /** Draw one frame. `t` is wall-clock seconds; animation speed is applied internally. */
  render(t: number): void {
    this.ensureBuilt();
    const ctx = this.ctx;
    const cfg = this.cfg;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (W === 0 || H === 0) return;

    const speed = cfg.animated && cfg.animSpeed.enabled ? cfg.animSpeed.intensity / 100 : 0;
    const amp = cfg.animated && cfg.animIntensity.enabled ? cfg.animIntensity.intensity / 100 : 0;
    if (this.lastT >= 0) this.animTime += Math.min(0.1, Math.max(0, t - this.lastT)) * speed;
    this.lastT = t;
    this.frame++;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);

    // ---- background layer
    const hasImageBg = this.bgCanvas !== null;
    if (cfg.bgMode === "solid") {
      ctx.fillStyle = "#081126";
      ctx.fillRect(0, 0, W, H);
    } else if (cfg.bgMode !== "none") {
      ctx.fillStyle = "#050816";
      ctx.fillRect(0, 0, W, H);
      if (this.bgCanvas) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = clamp01(cfg.bgOpacity / 100);
        ctx.drawImage(this.bgCanvas, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
    if (this.revealCanvas) ctx.drawImage(this.revealCanvas, 0, 0);

    // ---- marks (css-pixel coordinate space)
    if (this.grid) {
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.drawMarks(ctx, hasImageBg, amp);
    }

    // ---- lights
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (cfg.lights.enabled) this.drawLights(ctx, W, H);

    // ---- post effects
    ctx.globalCompositeOperation = "source-over";
    this.post.apply(ctx, this.canvas, t, this.frame, cfg, this.scale, this.lowPower);
  }

  private modulation(style: AsciiConfig["animStyle"], i: number, j: number, k: number, amp: number): number {
    if (amp === 0) return 1;
    const tt = this.animTime;
    const cols = this.cols;
    const rows = this.rows;
    switch (style) {
      case "wave":
        return 1 + amp * (0.5 * Math.sin(i * 0.2 + j * 0.1 - tt * 2.2) + 0.2 * Math.sin(i * 0.07 - j * 0.16 + tt * 1.3));
      case "pulse": {
        const d = Math.hypot((i - cols / 2) / cols, (j - rows / 2) / rows);
        return 1 + amp * 0.5 * Math.sin(tt * 2.4 - d * 6);
      }
      case "shimmer":
        return 1 + amp * 0.6 * Math.sin(tt * 3 + this.hashA[k] * 6.283) * (0.55 + 0.45 * Math.sin(tt * 0.7 + i * 0.1));
      case "ripple": {
        const d = Math.hypot((i - cols * 0.55) / cols, (j - rows / 2) / rows);
        return 1 + amp * 0.7 * Math.sin(d * 28 - tt * 3.2) * Math.exp(-d * 1.4);
      }
      default: {
        // flicker: smooth value-noise per cell, re-seeded slowly – controlled, never harsh.
        const rate = tt * 1.5;
        const b0 = Math.floor(rate);
        const f = smooth(rate - b0);
        const a = hash2(i, j, b0);
        const b = hash2(i, j, b0 + 1);
        return 1 + amp * ((a + (b - a) * f) - 0.5) * 1.1 + amp * 0.05 * Math.sin(tt * 0.5);
      }
    }
  }

  private drawMarks(ctx: CanvasRenderingContext2D, hasImageBg: boolean, amp: number): void {
    const cfg = this.cfg;
    const grid = this.grid;
    if (!grid) return;
    const mode = cfg.renderMode;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = this.cell;
    const ch = this.cellH;
    const coverage = clamp01(cfg.coverage / 100);
    const useMask = this.cellMask.length === cols * rows;
    const m = this.mark;

    ctx.globalCompositeOperation = hasImageBg ? compositeFor(cfg.styleBlend) : "source-over";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (GLYPH_MODES.has(mode)) ctx.font = `${Math.round(cw * (mode === "hexdump" ? 0.78 : mode === "dither" ? 0.88 : 0.95))}px ${MONO}`;
    ctx.lineCap = "round";

    if (mode === "contour") {
      const phase = (this.animTime * 0.35) % 6;
      drawContours(ctx, this.v0, cols, rows, cw, ch, phase, 0.9);
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    m.w = cw;
    m.h = ch;
    m.rows = rows;
    m.glyphs = this.glyphs;
    m.time = this.animTime;
    const glyphMode = GLYPH_MODES.has(mode);
    const ditherMode = mode === "dither";
    const resetColor = mode === "disco" || mode === "matrix" || mode === "bubbles";
    let lastColor = -1;

    for (let j = 0; j < rows; j++) {
      const y = j * ch;
      const off = rowOffset(mode, j, cw);
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const mod = this.modulation(cfg.animStyle, i, j, k, amp);
        const v = clamp01(this.v0[k] * mod);
        // Soft coverage gate: a cell appears once its intensity passes its own threshold
        // (ordered-dither matrix for "dither", a stable per-cell hash for everything else).
        const p = Math.pow(v, 1.35) * coverage * 1.9;
        let alpha = clamp01((p - (ditherMode ? BAYER_4X4[(j & 3) * 4 + (i & 3)] : this.hashB[k])) * (ditherMode ? 7 : 5));
        if (alpha <= 0.02) continue;
        if (useMask) alpha *= 1 - this.cellMask[k];
        alpha *= 0.4 + 0.6 * v;
        if (alpha <= 0.02) continue;

        const ci = this.colorIndex[k];
        if (ci !== lastColor || resetColor) {
          const color = this.colorLut[ci];
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          lastColor = resetColor ? -1 : ci;
        }
        ctx.globalAlpha = alpha;

        const x = i * cw + off;
        m.x = x;
        m.y = y;
        m.cx = x + cw / 2;
        m.cy = y + ch / 2;
        m.v = v;
        m.h1 = this.hashA[k];
        m.h2 = this.hashB[k];
        m.col = i;
        m.row = j;
        m.angle = grid.angle[k];
        if (glyphMode) m.h3 = hash2(i, j, Math.floor(this.animTime * 0.9 + m.h1 * 5));
        drawMark(mode, m);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawLights(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const pts = this.cfg.lights.points;
    ctx.globalCompositeOperation = "screen";
    const shortest = Math.min(W, H);
    for (const p of pts) {
      const pulse = 1 + 0.06 * Math.sin(this.animTime * 1.4 + p.x * 9);
      const radius = Math.max(8, p.radius * shortest) * pulse;
      const cx = p.x * W;
      const cy = p.y * H;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const a = clamp01(p.intensity);
      grad.addColorStop(0, `rgba(147,197,253,${(0.55 * a).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(59,130,246,${(0.22 * a).toFixed(3)})`);
      grad.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  destroy(): void {
    this.maskLoadToken++;
    this.post.dispose();
    this.grid = null;
    this.bgCanvas = null;
    this.revealCanvas = null;
    this.maskImage = null;
    this.source = null;
  }
}
