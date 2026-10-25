"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AsciiSurfBackground } from "@/components/effects/ascii-surf-background";
import { cloneAsciiConfig, DEFAULT_ASCII_CONFIG } from "@/lib/ascii/default-config";
import type { AsciiConfig, AsciiSource } from "@/lib/ascii/types";

interface AsciiContextValue {
  config: AsciiConfig;
  setConfig: (updater: (draft: AsciiConfig) => AsciiConfig) => void;
  reset: () => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  customImageName: string | null;
  imageError: string | null;
  setCustomImage: (file: File) => Promise<void>;
  clearCustomImage: () => void;
}

const AsciiContext = createContext<AsciiContextValue | null>(null);

export function useAscii(): AsciiContextValue {
  const ctx = useContext(AsciiContext);
  if (!ctx) throw new Error("useAscii must be used inside <AsciiProvider>");
  return ctx;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Owns the single shared background so it persists (and never re-initialises) across routes. */
export function AsciiProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<AsciiConfig>(() => cloneAsciiConfig(DEFAULT_ASCII_CONFIG));
  const [enabled, setEnabled] = useState(true);
  const [customSource, setCustomSource] = useState<AsciiSource | null>(null);
  const [customImageName, setCustomImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const setConfig = useCallback((updater: (draft: AsciiConfig) => AsciiConfig) => {
    setConfigState((prev) => updater(cloneAsciiConfig(prev)));
  }, []);

  const reset = useCallback(() => setConfigState(cloneAsciiConfig(DEFAULT_ASCII_CONFIG)), []);

  const releaseUrl = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };

  const setCustomImage = useCallback(async (file: File) => {
    setImageError(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Unsupported image type. Use a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That image is larger than 12 MB. Choose a smaller photo.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode"));
        img.src = url;
      });
      releaseUrl();
      objectUrl.current = url;
      setCustomSource({ image: img, width: img.naturalWidth, height: img.naturalHeight, focusX: 0.5, focusY: 0.5 });
      setCustomImageName(file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 80));
    } catch {
      URL.revokeObjectURL(url);
      setImageError("That file could not be read as an image.");
    }
  }, []);

  const clearCustomImage = useCallback(() => {
    releaseUrl();
    setCustomSource(null);
    setCustomImageName(null);
    setImageError(null);
  }, []);

  const value = useMemo<AsciiContextValue>(
    () => ({ config, setConfig, reset, enabled, setEnabled, customImageName, imageError, setCustomImage, clearCustomImage }),
    [config, setConfig, reset, enabled, customImageName, imageError, setCustomImage, clearCustomImage],
  );

  return (
    <AsciiContext.Provider value={value}>
      <AsciiSurfBackground config={config} customSource={customSource} enabled={enabled} />
      {children}
    </AsciiContext.Provider>
  );
}
