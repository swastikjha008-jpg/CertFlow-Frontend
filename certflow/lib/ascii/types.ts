/** Shared types for the Canvas2D ASCII renderer. */

export const RENDER_MODES = [
  "characters",
  "dither",
  "mosaic",
  "pixel",
  "dots",
  "cross",
  "diamond",
  "voxel",
  "lego",
  "mixed",
  "lines",
  "diagonal",
  "braille",
  "disco",
  "hexdump",
  "matrix",
  "rings",
  "hearts",
  "stars",
  "hexagons",
  "triangles",
  "bubbles",
  "hatch",
  "contour",
  "halfblocks",
] as const;
export type RenderMode = (typeof RENDER_MODES)[number];

export const ANIM_STYLES = ["wave", "pulse", "shimmer", "ripple", "flicker"] as const;
export type AnimStyle = (typeof ANIM_STYLES)[number];

export const BG_MODES = ["original", "blurred", "solid", "none"] as const;
export type BgMode = (typeof BG_MODES)[number];

export const BLUR_TYPES = ["off", "gaussian", "directional", "tilt", "lens", "progressive"] as const;
export type BlurType = (typeof BLUR_TYPES)[number];

export const CHAR_SETS = ["binary", "standard", "blocks", "minimal", "custom"] as const;
export type CharSetName = (typeof CHAR_SETS)[number];

export const BLEND_MODES = ["normal", "overlay", "screen", "multiply", "lighten", "soft-light"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const POST_EFFECT_KEYS = [
  "scanLines",
  "vignette",
  "bloom",
  "chromatic",
  "filmGrain",
  "glitch",
  "halftone",
  "pixelate",
  "filmDust",
] as const;
export type PostEffectKey = (typeof POST_EFFECT_KEYS)[number];

export const PALETTES = ["duotone", "original"] as const;
export type Palette = (typeof PALETTES)[number];

/** A value that can be switched off while remembering its intensity (0–100). */
export interface Toggle {
  enabled: boolean;
  intensity: number;
}

export interface ToneCurvePoint {
  x: number;
  y: number;
}

/** Light positions are normalised: x/y in 0–1, radius in 0–1 of the shortest viewport side. */
export interface LightPoint {
  x: number;
  y: number;
  radius: number;
  intensity: number;
}

export interface MaskConfig {
  enabled: boolean;
  tool: "freehand" | "brush" | "shape";
  brushSize: number;
  showOverlay: boolean;
  invert: boolean;
  dataUrl: string | null;
  shapes: unknown[];
}

export interface AsciiConfig {
  renderMode: RenderMode;
  bgMode: BgMode;
  bgBlur: number;
  bgOpacity: number;
  cellSize: number;
  coverage: number;
  invert: boolean;
  styleBlend: BlendMode;
  charSet: CharSetName;
  customChars: string;
  brightness: number;
  contrast: number;
  edgeEmphasis: number;
  density: number;
  toneCurve: ToneCurvePoint[];
  tint: string;
  tintOpacity: number;
  overlayBlend: BlendMode;
  saturation: number;
  grayscale: number;
  blurType: BlurType;
  blurAmount: number;
  blurAngle: number;
  directionalBothSides: boolean;
  tiltFocus: number;
  tiltPosition: number;
  tiltFeather: number;
  lensFocus: number;
  blurCenterX: number;
  blurCenterY: number;
  progressivePosition: number;
  progressiveReverse: boolean;
  pfx: Record<PostEffectKey, Toggle>;
  animated: boolean;
  animStyle: AnimStyle;
  animSpeed: Toggle;
  animIntensity: Toggle;
  lights: { enabled: boolean; points: LightPoint[] };
  mask: MaskConfig;
  /** "duotone" maps luminance onto the CertFlow blue ramp; "original" keeps source colours. */
  palette: Palette;
}

/** The image the renderer samples. `focusX/Y` pick the crop anchor when the aspect ratio differs. */
export interface AsciiSource {
  image: CanvasImageSource;
  width: number;
  height: number;
  focusX: number;
  focusY: number;
}

/** Minimal canvas surface the renderer needs (lets tests inject a node canvas). */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;
