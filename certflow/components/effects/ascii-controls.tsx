"use client";

import { useRef } from "react";
import { ImageUp, RotateCcw, X } from "lucide-react";
import { useAscii } from "@/components/effects/ascii-provider";
import { Button, Collapsible, ColorField, SelectField, SliderField, SwitchField, TextField } from "@/components/ui/controls";
import {
  ANIM_STYLES,
  BG_MODES,
  BLEND_MODES,
  BLUR_TYPES,
  CHAR_SETS,
  PALETTES,
  POST_EFFECT_KEYS,
  RENDER_MODES,
  type PostEffectKey,
} from "@/lib/ascii/types";

const PFX_LABEL: Record<PostEffectKey, string> = {
  scanLines: "Scan lines",
  vignette: "Vignette",
  bloom: "Bloom",
  chromatic: "Chromatic aberration",
  filmGrain: "Film grain",
  glitch: "Glitch",
  halftone: "Halftone",
  pixelate: "Pixelate",
  filmDust: "Film dust",
};

/** Settings for the shared ASCII background. Every control writes straight into the renderer config. */
export function AsciiControls() {
  const { config, setConfig, reset, enabled, setEnabled, customImageName, imageError, setCustomImage, clearCustomImage } =
    useAscii();
  const fileRef = useRef<HTMLInputElement>(null);
  const maskRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof config>(key: K, value: (typeof config)[K]) =>
    setConfig((d) => ({ ...d, [key]: value }));

  const onPickMask = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type) || file.size > 6 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        setConfig((d) => ({ ...d, mask: { ...d.mask, enabled: true, dataUrl: reader.result as string } }));
    };
    reader.readAsDataURL(file);
  };

  const light = config.lights.points[0];
  const setLight = (patch: Partial<NonNullable<typeof light>>) =>
    setConfig((d) => {
      const base = d.lights.points[0] ?? { x: 0.7, y: 0.4, radius: 0.35, intensity: 0.8 };
      return { ...d, lights: { ...d.lights, points: [{ ...base, ...patch }] } };
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SwitchField label="ASCII background" checked={enabled} onChange={setEnabled} />
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset to default
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-cf-muted">Background photo</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Upload a background photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void setCustomImage(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <ImageUp className="h-4 w-4" aria-hidden /> Upload photo
          </Button>
          {customImageName && (
            <Button variant="ghost" onClick={clearCustomImage} aria-label="Use the default image">
              <X className="h-4 w-4" aria-hidden /> {customImageName}
            </Button>
          )}
        </div>
        {imageError && (
          <p role="alert" className="text-sm text-cf-bad">
            Error: {imageError}
          </p>
        )}
        <p className="text-xs text-cf-muted/80">JPEG, PNG or WebP. The photo is processed only in your browser.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Render mode" value={config.renderMode} options={RENDER_MODES} onChange={(v) => set("renderMode", v)} />
        <SelectField label="Animation style" value={config.animStyle} options={ANIM_STYLES} onChange={(v) => set("animStyle", v)} />
        <SliderField label="Cell size" value={config.cellSize} min={6} max={40} unit="px" onChange={(v) => set("cellSize", v)} />
        <SliderField label="Density" value={config.density} min={-100} max={100} onChange={(v) => set("density", v)} />
        <SliderField
          label="Animation speed"
          value={config.animSpeed.intensity}
          min={0}
          max={300}
          unit="%"
          onChange={(v) => setConfig((d) => ({ ...d, animSpeed: { ...d.animSpeed, intensity: v } }))}
        />
        <SliderField
          label="Animation intensity"
          value={config.animIntensity.intensity}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setConfig((d) => ({ ...d, animIntensity: { ...d.animIntensity, intensity: v } }))}
        />
        <ColorField label="Colour tint" value={config.tint} onChange={(v) => set("tint", v)} />
        <SliderField label="Tint strength" value={config.tintOpacity} min={0} max={100} unit="%" onChange={(v) => set("tintOpacity", v)} />
      </div>
      <SwitchField label="Animate" checked={config.animated} onChange={(v) => set("animated", v)} hint="Off renders a still frame" />

      <Collapsible title="Image & tone">
        <div className="grid gap-4 sm:grid-cols-2">
          <SliderField label="Coverage" value={config.coverage} min={0} max={100} unit="%" onChange={(v) => set("coverage", v)} />
          <SliderField label="Brightness" value={config.brightness} min={-100} max={100} onChange={(v) => set("brightness", v)} />
          <SliderField label="Contrast" value={config.contrast} min={20} max={250} unit="%" onChange={(v) => set("contrast", v)} />
          <SliderField label="Saturation" value={config.saturation} min={0} max={250} unit="%" onChange={(v) => set("saturation", v)} />
          <SliderField label="Grayscale" value={config.grayscale} min={0} max={100} unit="%" onChange={(v) => set("grayscale", v)} />
          <SliderField label="Edge emphasis" value={config.edgeEmphasis} min={0} max={100} unit="%" onChange={(v) => set("edgeEmphasis", v)} />
          <SelectField label="Colour mapping" value={config.palette} options={PALETTES} onChange={(v) => set("palette", v)} />
          <SelectField label="Tint blend" value={config.overlayBlend} options={BLEND_MODES} onChange={(v) => set("overlayBlend", v)} />
        </div>
        <SwitchField label="Invert" checked={config.invert} onChange={(v) => set("invert", v)} hint="Dark areas of the photo become the brightest marks" />
      </Collapsible>

      <Collapsible title="Characters">
        <SelectField label="Character set" value={config.charSet} options={CHAR_SETS} onChange={(v) => set("charSet", v)} />
        {config.charSet === "custom" && (
          <TextField
            label="Custom characters (dark → light)"
            value={config.customChars}
            maxLength={24}
            placeholder="e.g. .:-=+*#%@"
            onChange={(v) => set("customChars", v)}
          />
        )}
        <p className="text-xs text-cf-muted/80">Used by the characters and dither render modes.</p>
      </Collapsible>

      <Collapsible title="Background layer">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Background mode" value={config.bgMode} options={BG_MODES} onChange={(v) => set("bgMode", v)} />
          <SelectField label="Mark blend" value={config.styleBlend} options={BLEND_MODES} onChange={(v) => set("styleBlend", v)} />
          <SliderField label="Background blur" value={config.bgBlur} min={0} max={100} onChange={(v) => set("bgBlur", v)} />
          <SliderField label="Background opacity" value={config.bgOpacity} min={0} max={100} unit="%" onChange={(v) => set("bgOpacity", v)} />
        </div>
        <p className="text-xs text-cf-muted/80">Mark blend applies when the background shows the photo (original or blurred).</p>
      </Collapsible>

      <Collapsible title="Blur">
        <SelectField label="Blur type" value={config.blurType} options={BLUR_TYPES} onChange={(v) => set("blurType", v)} />
        {config.blurType !== "off" && (
          <SliderField label="Blur amount" value={config.blurAmount} min={0} max={100} onChange={(v) => set("blurAmount", v)} />
        )}
        {config.blurType === "directional" && (
          <>
            <SliderField label="Angle" value={config.blurAngle} min={0} max={180} unit="°" onChange={(v) => set("blurAngle", v)} />
            <SwitchField label="Both sides" checked={config.directionalBothSides} onChange={(v) => set("directionalBothSides", v)} />
          </>
        )}
        {config.blurType === "tilt" && (
          <>
            <SliderField label="Focus band" value={config.tiltFocus} min={5} max={90} unit="%" onChange={(v) => set("tiltFocus", v)} />
            <SliderField label="Position" value={config.tiltPosition} min={0} max={100} unit="%" onChange={(v) => set("tiltPosition", v)} />
            <SliderField label="Feather" value={config.tiltFeather} min={1} max={60} unit="%" onChange={(v) => set("tiltFeather", v)} />
          </>
        )}
        {config.blurType === "lens" && (
          <>
            <SliderField label="Focus radius" value={config.lensFocus} min={5} max={100} unit="%" onChange={(v) => set("lensFocus", v)} />
            <SliderField label="Centre X" value={config.blurCenterX} min={0} max={100} unit="%" onChange={(v) => set("blurCenterX", v)} />
            <SliderField label="Centre Y" value={config.blurCenterY} min={0} max={100} unit="%" onChange={(v) => set("blurCenterY", v)} />
          </>
        )}
        {config.blurType === "progressive" && (
          <>
            <SliderField label="Start position" value={config.progressivePosition} min={0} max={100} unit="%" onChange={(v) => set("progressivePosition", v)} />
            <SwitchField label="Reverse direction" checked={config.progressiveReverse} onChange={(v) => set("progressiveReverse", v)} />
          </>
        )}
      </Collapsible>

      <Collapsible title="Post effects">
        <div className="space-y-4">
          {POST_EFFECT_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <SwitchField
                label={PFX_LABEL[key]}
                checked={config.pfx[key].enabled}
                onChange={(v) => setConfig((d) => ({ ...d, pfx: { ...d.pfx, [key]: { ...d.pfx[key], enabled: v } } }))}
              />
              <SliderField
                label="Intensity"
                value={config.pfx[key].intensity}
                min={0}
                max={100}
                unit="%"
                disabled={!config.pfx[key].enabled}
                onChange={(v) => setConfig((d) => ({ ...d, pfx: { ...d.pfx, [key]: { ...d.pfx[key], intensity: v } } }))}
              />
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title="Light & mask">
        <SwitchField
          label="Light point"
          checked={config.lights.enabled}
          onChange={(v) => {
            setConfig((d) => ({ ...d, lights: { ...d.lights, enabled: v } }));
            if (v && !light) setLight({});
          }}
        />
        {config.lights.enabled && light && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SliderField label="X" value={Math.round(light.x * 100)} min={0} max={100} unit="%" onChange={(v) => setLight({ x: v / 100 })} />
            <SliderField label="Y" value={Math.round(light.y * 100)} min={0} max={100} unit="%" onChange={(v) => setLight({ y: v / 100 })} />
            <SliderField label="Radius" value={Math.round(light.radius * 100)} min={5} max={100} unit="%" onChange={(v) => setLight({ radius: v / 100 })} />
            <SliderField label="Intensity" value={Math.round(light.intensity * 100)} min={0} max={100} unit="%" onChange={(v) => setLight({ intensity: v / 100 })} />
          </div>
        )}
        <div className="space-y-3 border-t border-cf-line/60 pt-4">
          <SwitchField
            label="Reveal photo through a mask"
            checked={config.mask.enabled}
            onChange={(v) => setConfig((d) => ({ ...d, mask: { ...d.mask, enabled: v } }))}
            hint="Upload a PNG/WebP; its opaque areas show the original photo"
          />
          <input
            ref={maskRef}
            type="file"
            accept="image/png,image/webp"
            className="sr-only"
            aria-label="Upload a mask image"
            onChange={(e) => {
              onPickMask(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => maskRef.current?.click()}>Upload mask</Button>
            {config.mask.dataUrl && (
              <Button variant="ghost" onClick={() => setConfig((d) => ({ ...d, mask: { ...d.mask, dataUrl: null, enabled: false } }))}>
                Remove mask
              </Button>
            )}
          </div>
          <SwitchField
            label="Invert mask"
            checked={config.mask.invert}
            onChange={(v) => setConfig((d) => ({ ...d, mask: { ...d.mask, invert: v } }))}
          />
        </div>
      </Collapsible>
    </div>
  );
}
