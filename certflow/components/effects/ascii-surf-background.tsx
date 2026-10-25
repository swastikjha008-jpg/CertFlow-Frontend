"use client";

import { useEffect, useRef } from "react";
import { AsciiRenderer } from "@/components/effects/ascii-renderer";
import { createDefaultSurfSource } from "@/lib/ascii/default-source";
import type { AsciiConfig, AsciiSource } from "@/lib/ascii/types";

interface Props {
  config: AsciiConfig;
  /** User-uploaded photo; when null the built-in procedural surf scene is used. */
  customSource: AsciiSource | null;
  enabled: boolean;
}

const FRAME_MS = 1000 / 30;

/**
 * Reusable Canvas2D ASCII background. Sits behind the UI (fixed, pointer-events-none).
 * The animation loop lives outside React state: the renderer is driven by rAF, paused when
 * off-screen or the tab is hidden, and reduced to a single still frame for users who
 * prefer reduced motion. A CSS gradient is always rendered underneath as the static fallback.
 */
export function AsciiSurfBackground({ config, customSource, enabled }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AsciiRenderer | null>(null);
  const configRef = useRef(config);
  const sourceRef = useRef(customSource);
  const defaultSourceRef = useRef<AsciiSource | null>(null);
  const resolveSource = (): AsciiSource => {
    if (sourceRef.current) return sourceRef.current;
    if (!defaultSourceRef.current) {
      defaultSourceRef.current = createDefaultSurfSource((w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      });
    }
    return defaultSourceRef.current;
  };
  const requestDrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    configRef.current = config;
    rendererRef.current?.setConfig(config);
    requestDrawRef.current();
  }, [config]);

  useEffect(() => {
    sourceRef.current = customSource;
    rendererRef.current?.setSource(resolveSource());
    requestDrawRef.current();
  }, [customSource]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !enabled) return;

    let renderer: AsciiRenderer;
    try {
      renderer = new AsciiRenderer(canvas, configRef.current);
    } catch {
      return; // no 2D context: the CSS fallback stays visible
    }
    rendererRef.current = renderer;
    renderer.setSource(resolveSource());

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    let visible = true;
    let raf = 0;
    let last = 0;
    let disposed = false;

    const size = () => {
      const rect = wrap.getBoundingClientRect();
      const small = rect.width < 768;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
      renderer.resize(rect.width, rect.height, dpr);
    };

    const loop = (now: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      if (reduced || !renderer.isAnimated) {
        renderer.render(0);
        return;
      }
      if (now - last >= FRAME_MS) {
        last = now;
        renderer.render(now / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(loop);
    };
    requestDrawRef.current = start;

    const resizeObserver = new ResizeObserver(() => {
      size();
      start();
    });
    resizeObserver.observe(wrap);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    intersection.observe(wrap);

    const onVisibility = () => {
      if (!document.hidden) start();
    };
    const onMotion = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotion);

    size();
    start();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotion);
      renderer.destroy();
      rendererRef.current = null;
      requestDrawRef.current = () => {};
    };
  }, [enabled]);

  return (
    <div ref={wrapRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-cf-bg">
      {/* Static fallback / ambient lighting, visible before the canvas paints and when disabled */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 75% 35%, rgba(59,130,246,0.22), transparent 70%), radial-gradient(50% 40% at 10% 90%, rgba(103,232,249,0.08), transparent 70%), linear-gradient(180deg, #050816, #081126)",
        }}
      />
      {enabled && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}
