"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { generateCertificate, DEFAULT_CERT_SETTINGS, type CertificateSettings, type TemplateData } from "@/lib/certificate-generator";
import type { Participant } from "@/lib/participant-parser";
import { Button, ColorField, SliderField, SwitchField, TextField } from "@/components/ui/controls";

interface Props {
  template: TemplateData | null;
  templateImageUrl: string | null;
  participants: Participant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  settings: CertificateSettings;
  onSettings: (s: CertificateSettings) => void;
}

/**
 * Image templates are previewed instantly with a CSS overlay that mirrors the PDF maths
 * (font size is relative to page width). PDF templates are previewed by rendering the real
 * personalised PDF with pdf-lib, debounced while sliders move.
 */
export function CertificatePreview({ template, templateImageUrl, participants, selectedId, onSelect, settings, onSettings }: Props) {
  const selectable = useMemo(() => participants.filter((p) => p.status === "valid" || p.status === "excluded"), [participants]);
  const selected = selectable.find((p) => p.id === selectedId) ?? selectable[0] ?? null;
  const previewName = selected?.name ?? "Participant Name";
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const set = (patch: Partial<CertificateSettings>) => onSettings({ ...settings, ...patch });

  useEffect(() => {
    if (!template || template.kind !== "pdf") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const bytes = await generateCertificate(template, { name: previewName }, settings);
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfUrl(url);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template, previewName, settings]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <section aria-labelledby="preview-title" className="glass rounded-2xl p-5">
      <h2 id="preview-title" className="text-lg font-semibold">Certificate preview</h2>
      <p className="mt-1 text-sm text-cf-muted">Position the name, then pick any participant to check how their certificate will look.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-cf-line bg-slate-950/40" style={{ containerType: "inline-size" }}>
            {!template && (
              <div className="flex aspect-[1.414/1] items-center justify-center p-6 text-center text-sm text-cf-muted">
                Upload a certificate template to see the preview.
              </div>
            )}
            {template?.kind !== "pdf" && templateImageUrl && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={templateImageUrl} alt="Certificate template" className="block w-full" />
                <span
                  className="pointer-events-none absolute whitespace-nowrap leading-none"
                  style={{
                    left: `${settings.xPct}%`,
                    top: `${settings.yPct}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${settings.fontSize / 10}cqw`,
                    color: settings.color,
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: settings.bold ? 700 : 400,
                    maxWidth: "90%",
                  }}
                >
                  {previewName}
                </span>
              </div>
            )}
            {template?.kind === "pdf" && (
              <div className="relative aspect-[1.414/1]">
                {pdfUrl && <iframe title="Personalised certificate preview" src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`} className="absolute inset-0 h-full w-full bg-white" />}
                {busy && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-cf-electric" aria-label="Updating preview" />}
              </div>
            )}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-cf-bad">Error: {error}</p>}
          {template?.kind === "pdf" && (
            <p className="mt-2 text-xs text-cf-muted">If your browser can&apos;t show PDFs inline, the generated files are unaffected.</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5 text-sm">
            <label htmlFor="preview-person" className="text-cf-muted">Preview participant</label>
            <select
              id="preview-person"
              value={selected?.id ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              disabled={selectable.length === 0}
              className="glass-field w-full rounded-lg px-3 py-2 text-cf-fg"
            >
              {selectable.length === 0 && <option value="">No valid participants yet</option>}
              {selectable.slice(0, 500).map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
              ))}
            </select>
          </div>
          <SliderField label="Name position — horizontal" value={settings.xPct} min={5} max={95} unit="%" onChange={(v) => set({ xPct: v })} />
          <SliderField label="Name position — vertical" value={settings.yPct} min={5} max={95} unit="%" onChange={(v) => set({ yPct: v })} />
          <SliderField label="Font size" value={settings.fontSize} min={16} max={120} onChange={(v) => set({ fontSize: v })} />
          <ColorField label="Text colour" value={settings.color} onChange={(v) => set({ color: v })} />
          <SwitchField label="Bold" checked={settings.bold} onChange={(v) => set({ bold: v })} />

          <div className="space-y-3 border-t border-cf-line/60 pt-4">
            <p className="text-sm font-medium text-cf-fg">Event details</p>
            <TextField label="Event name" value={settings.eventName} maxLength={80} onChange={(v) => set({ eventName: v })} placeholder="AI Workshop 2026" />
            <TextField label="Event date" value={settings.eventDate} maxLength={40} onChange={(v) => set({ eventDate: v })} placeholder="12 March 2026" />
            <TextField label="Issuer name" value={settings.issuer} maxLength={80} onChange={(v) => set({ issuer: v })} placeholder="AI Club, Lucknow Public College" />
            <SwitchField
              label="Print these under the name"
              checked={settings.printDetails}
              onChange={(v) => set({ printDetails: v })}
              hint="Leave off if your template already contains them"
            />
          </div>
          <Button variant="ghost" onClick={() => onSettings({ ...DEFAULT_CERT_SETTINGS, eventName: settings.eventName, eventDate: settings.eventDate, issuer: settings.issuer })}>
            Reset position & style
          </Button>
        </div>
      </div>
    </section>
  );
}
