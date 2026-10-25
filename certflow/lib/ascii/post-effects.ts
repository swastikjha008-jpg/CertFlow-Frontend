import { hash2 } from "./color-processing";
import type { AsciiConfig, CanvasFactory } from "./types";

/**
 * Modular post-processing for the ASCII canvas.
 *
 * Every effect is independent, only runs when enabled, scales with its 0–100 intensity,
 * and caches its textures (patterns, noise tiles, vignette) so the per-frame cost is a few
 * drawImage calls. Expensive effects (chromatic aberration) are throttled, and the heaviest
 * ones are skipped entirely on small screens (`lowPower`).
 *
 * All drawing here happens in device pixels with an identity transform.
 */

type Ctx = CanvasRenderingContext2D;

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
}

export class PostEffects {
  private readonly create: CanvasFactory;
  private width = 0;
  private height = 0;

  private vignette: HTMLCanvasElement | null = null;
  private vignetteKey = "";
  private scanPattern: CanvasPattern | null = null;
  private scanKey = "";
  private grainTiles: HTMLCanvasElement[] = [];
  private grainPatterns: Array<CanvasPattern | null> = [];
  private halftonePattern: CanvasPattern | null = null;
  private halftoneKey = "";

  private bloomA: Layer | null = null;
  private bloomB: Layer | null = null;
  private pixelLayer: Layer | null = null;
  private copyLayer: Layer | null = null;
  private fringe: Layer | null = null;
  private fringeTmp: Layer | null = null;
  private fringeFrame = -10;

  constructor(createCanvas: CanvasFactory) {
    this.create = createCanvas;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.vignette = null;
    this.vignetteKey = "";
    this.bloomA = this.bloomB = this.pixelLayer = this.copyLayer = this.fringe = this.fringeTmp = null;
    this.fringeFrame = -10;
  }

  dispose(): void {
    this.vignette = null;
    this.scanPattern = null;
    this.grainTiles = [];
    this.grainPatterns = [];
    this.halftonePattern = null;
    this.bloomA = this.bloomB = this.pixelLayer = this.copyLayer = this.fringe = this.fringeTmp = null;
  }

  private layer(existing: Layer | null, w: number, h: number): Layer {
    if (existing && existing.canvas.width === w && existing.canvas.height === h) return existing;
    const canvas = this.create(Math.max(1, w), Math.max(1, h));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    return { canvas, ctx };
  }

  /** Apply all enabled effects to `main`. `scale` is device pixels per css pixel. */
  apply(ctx: Ctx, main: HTMLCanvasElement, t: number, frame: number, cfg: AsciiConfig, scale: number, lowPower: boolean): void {
    const W = this.width;
    const H = this.height;
    if (W === 0 || H === 0) return;
    const fx = cfg.pfx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (fx.pixelate.enabled && !lowPower) this.pixelate(ctx, main, fx.pixelate.intensity / 100, scale);
    if (fx.halftone.enabled && !lowPower) this.halftone(ctx, fx.halftone.intensity / 100, scale);
    if (fx.bloom.enabled) this.bloom(ctx, main, fx.bloom.intensity / 100);
    if (fx.chromatic.enabled && !lowPower) this.chromatic(ctx, main, fx.chromatic.intensity / 100, frame, scale);
    if (fx.glitch.enabled && !lowPower) this.glitch(ctx, main, t, fx.glitch.intensity / 100, scale);
    if (fx.scanLines.enabled) this.scanLines(ctx, t, fx.scanLines.intensity / 100, scale);
    if (fx.filmGrain.enabled) this.filmGrain(ctx, frame, fx.filmGrain.intensity / 100, scale);
    if (fx.filmDust.enabled && !lowPower) this.filmDust(ctx, t, fx.filmDust.intensity / 100, scale);
    if (fx.vignette.enabled) this.drawVignette(ctx, fx.vignette.intensity / 100);

    ctx.restore();
  }

  /* ------------------------------------------------------------ effects */

  private pixelate(ctx: Ctx, main: HTMLCanvasElement, k: number, scale: number): void {
    const size = Math.max(2, Math.round((2 + k * 14) * scale));
    const w = Math.ceil(this.width / size);
    const h = Math.ceil(this.height / size);
    this.pixelLayer = this.layer(this.pixelLayer, w, h);
    const p = this.pixelLayer;
    p.ctx.clearRect(0, 0, w, h);
    p.ctx.imageSmoothingEnabled = true;
    p.ctx.drawImage(main, 0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(p.canvas, 0, 0, w, h, 0, 0, w * size, h * size);
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
  }

  private halftone(ctx: Ctx, k: number, scale: number): void {
    const cell = Math.max(4, Math.round((5 + k * 6) * scale));
    const key = `${cell}`;
    if (!this.halftonePattern || this.halftoneKey !== key) {
      const tile = this.create(cell, cell);
      const tctx = tile.getContext("2d");
      if (tctx) {
        tctx.clearRect(0, 0, cell, cell);
        tctx.fillStyle = "rgba(2,4,14,1)";
        tctx.beginPath();
        tctx.arc(cell / 2, cell / 2, cell * 0.28, 0, Math.PI * 2);
        tctx.fill();
        this.halftonePattern = ctx.createPattern(tile, "repeat");
        this.halftoneKey = key;
      }
    }
    if (!this.halftonePattern) return;
    ctx.globalAlpha = 0.25 + k * 0.5;
    ctx.fillStyle = this.halftonePattern;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }

  private bloom(ctx: Ctx, main: HTMLCanvasElement, k: number): void {
    const wa = Math.max(2, Math.round(this.width / 4));
    const ha = Math.max(2, Math.round(this.height / 4));
    this.bloomA = this.layer(this.bloomA, wa, ha);
    this.bloomB = this.layer(this.bloomB, Math.max(2, wa >> 1), Math.max(2, ha >> 1));
    const a = this.bloomA;
    const b = this.bloomB;
    a.ctx.imageSmoothingEnabled = true;
    a.ctx.clearRect(0, 0, wa, ha);
    a.ctx.drawImage(main, 0, 0, wa, ha);
    b.ctx.imageSmoothingEnabled = true;
    b.ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
    b.ctx.drawImage(a.canvas, 0, 0, b.canvas.width, b.canvas.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.2 * k;
    ctx.drawImage(a.canvas, 0, 0, this.width, this.height);
    ctx.globalAlpha = 0.28 * k;
    ctx.drawImage(b.canvas, 0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Red/cyan fringe offset horizontally. Rebuilt every 3rd frame at half resolution. */
  private chromatic(ctx: Ctx, main: HTMLCanvasElement, k: number, frame: number, scale: number): void {
    const w = Math.max(2, Math.round(this.width / 2));
    const h = Math.max(2, Math.round(this.height / 2));
    this.fringe = this.layer(this.fringe, w, h);
    this.fringeTmp = this.layer(this.fringeTmp, w, h);
    const dx = Math.max(1, (1 + k * 3.5) * scale * 0.5);
    if (frame - this.fringeFrame >= 3) {
      this.fringeFrame = frame;
      const f = this.fringe;
      const tmp = this.fringeTmp;
      f.ctx.globalCompositeOperation = "source-over";
      f.ctx.clearRect(0, 0, w, h);
      const channel = (color: string, offset: number) => {
        tmp.ctx.globalCompositeOperation = "source-over";
        tmp.ctx.clearRect(0, 0, w, h);
        tmp.ctx.drawImage(main, offset, 0, w, h);
        tmp.ctx.globalCompositeOperation = "multiply";
        tmp.ctx.fillStyle = color;
        tmp.ctx.fillRect(0, 0, w, h);
        tmp.ctx.globalCompositeOperation = "destination-in";
        tmp.ctx.drawImage(main, offset, 0, w, h);
        tmp.ctx.globalCompositeOperation = "source-over";
        f.ctx.globalCompositeOperation = "lighter";
        f.ctx.drawImage(tmp.canvas, 0, 0);
      };
      channel("rgb(255,0,0)", -dx);
      channel("rgb(0,255,255)", dx);
      f.ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.18 + 0.4 * k;
    ctx.drawImage(this.fringe.canvas, 0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Brief horizontal slice displacement, scheduled deterministically from time. */
  private glitch(ctx: Ctx, main: HTMLCanvasElement, t: number, k: number, scale: number): void {
    const period = 5.5 - 3 * k;
    const idx = Math.floor(t / period);
    const local = t - idx * period;
    const start = hash2(idx, 3, 11) * period * 0.75;
    const dur = 0.16;
    if (local < start || local > start + dur) return;
    this.copyLayer = this.layer(this.copyLayer, this.width, this.height);
    const c = this.copyLayer;
    c.ctx.globalCompositeOperation = "copy";
    c.ctx.drawImage(main, 0, 0);
    c.ctx.globalCompositeOperation = "source-over";
    const slices = 3 + Math.floor(k * 5);
    const phase = Math.floor((local - start) * 40);
    for (let s = 0; s < slices; s++) {
      const y = hash2(idx, s, 21 + phase) * this.height;
      const hh = (0.015 + hash2(idx, s, 31) * 0.05) * this.height;
      const dx = (hash2(idx, s, 41 + phase) - 0.5) * 2 * (6 + k * 28) * scale;
      ctx.drawImage(c.canvas, 0, y, this.width, hh, dx, y, this.width, hh);
    }
  }

  private scanLines(ctx: Ctx, t: number, k: number, scale: number): void {
    const period = Math.max(3, Math.round(3 * scale));
    const key = `${period}`;
    if (!this.scanPattern || this.scanKey !== key) {
      const tile = this.create(1, period);
      const tctx = tile.getContext("2d");
      if (tctx) {
        tctx.clearRect(0, 0, 1, period);
        tctx.fillStyle = "rgba(0,0,0,1)";
        tctx.fillRect(0, 0, 1, Math.max(1, Math.round(period / 3)));
        this.scanPattern = ctx.createPattern(tile, "repeat");
        this.scanKey = key;
      }
    }
    if (this.scanPattern) {
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = this.scanPattern;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    // A slow, faint rolling band.
    const bandH = this.height * 0.16;
    const y = ((t * 0.07) % 1.25) * this.height - bandH;
    const grad = ctx.createLinearGradient(0, y, 0, y + bandH);
    grad.addColorStop(0, "rgba(96,165,250,0)");
    grad.addColorStop(0.5, "rgba(96,165,250,1)");
    grad.addColorStop(1, "rgba(96,165,250,0)");
    ctx.globalAlpha = 0.05 * k;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, this.width, bandH);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  private filmGrain(ctx: Ctx, frame: number, k: number, scale: number): void {
    if (this.grainTiles.length === 0) {
      for (let i = 0; i < 4; i++) {
        const size = 160;
        const tile = this.create(size, size);
        const tctx = tile.getContext("2d");
        if (!tctx) continue;
        const img = tctx.createImageData(size, size);
        for (let p = 0; p < size * size; p++) {
          const v = Math.floor(hash2(p, i, 91) * 255);
          img.data[p * 4] = v;
          img.data[p * 4 + 1] = v;
          img.data[p * 4 + 2] = Math.min(255, v + 30);
          img.data[p * 4 + 3] = 255;
        }
        tctx.putImageData(img, 0, 0);
        this.grainTiles.push(tile);
        this.grainPatterns.push(ctx.createPattern(tile, "repeat"));
      }
    }
    const pattern = this.grainPatterns[(frame >> 1) % Math.max(1, this.grainPatterns.length)];
    if (!pattern) return;
    const ox = Math.floor(hash2(frame >> 1, 1, 5) * 160);
    const oy = Math.floor(hash2(frame >> 1, 2, 5) * 160);
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.scale(scale > 1.2 ? 1.5 : 1, scale > 1.2 ? 1.5 : 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.055 * k;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, this.width + 320, this.height + 320);
    ctx.restore();
  }

  private filmDust(ctx: Ctx, t: number, k: number, scale: number): void {
    const bucket = Math.floor(t * 12);
    const specks = 6 + Math.floor(k * 22);
    ctx.fillStyle = "rgba(214,232,255,0.55)";
    for (let i = 0; i < specks; i++) {
      const x = hash2(bucket, i, 61) * this.width;
      const y = hash2(bucket, i, 62) * this.height;
      const r = (0.5 + hash2(bucket, i, 63) * 1.3) * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(214,232,255,0.3)";
    ctx.lineWidth = Math.max(1, scale * 0.7);
    for (let i = 0; i < 2; i++) {
      if (hash2(bucket, i, 71) > 0.35 + k * 0.3) continue;
      const x = hash2(bucket, i, 72) * this.width;
      const y = hash2(bucket, i, 73) * this.height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12 * scale, y + 6 * scale, x + 20 * scale * hash2(bucket, i, 74), y + 18 * scale);
      ctx.stroke();
    }
  }

  private drawVignette(ctx: Ctx, k: number): void {
    const key = `${this.width}x${this.height}:${k.toFixed(2)}`;
    if (!this.vignette || this.vignetteKey !== key) {
      const c = this.create(this.width, this.height);
      const vctx = c.getContext("2d");
      if (vctx) {
        const r = Math.hypot(this.width, this.height) / 2;
        const grad = vctx.createRadialGradient(this.width / 2, this.height / 2, r * 0.35, this.width / 2, this.height / 2, r);
        grad.addColorStop(0, "rgba(2,4,14,0)");
        grad.addColorStop(1, `rgba(2,4,14,${(0.9 * k).toFixed(3)})`);
        vctx.fillStyle = grad;
        vctx.fillRect(0, 0, this.width, this.height);
      }
      this.vignette = c;
      this.vignetteKey = key;
    }
    ctx.drawImage(this.vignette, 0, 0);
  }
}
