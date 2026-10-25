"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, RefreshCw, Trash2, UploadCloud, AlertCircle } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { safeName } from "@/lib/file-validation";
import { Button } from "@/components/ui/controls";

interface Props {
  title: string;
  description: string;
  accept: string;
  formats: string;
  icon: "template" | "roster";
  file: File | null;
  loading?: boolean;
  error?: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  children?: ReactNode;
}

/** Translucent drop zone: keeps the ASCII background visible, with a blue highlight on drag-over. */
export function UploadCard({ title, description, accept, formats, icon, file, loading, error, onFile, onRemove, children }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const titleId = useId();
  const errId = useId();
  const Icon = icon === "template" ? FileText : FileSpreadsheet;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <section aria-labelledby={titleId} className="glass flex flex-col gap-4 rounded-2xl p-5">
      <header>
        <h2 id={titleId} className="text-lg font-semibold text-cf-fg">{title}</h2>
        <p className="mt-1 text-sm text-cf-muted">{description}</p>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={`Choose file for ${title}`}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all",
            dragging
              ? "border-cf-electric bg-cf-brand/15 shadow-[0_0_0_4px_rgba(96,165,250,0.12)]"
              : "border-cf-line bg-slate-950/10 hover:border-cf-electric/60 hover:bg-cf-brand/5",
          )}
        >
          {loading ? <Loader2 className="h-7 w-7 animate-spin text-cf-electric" aria-hidden /> : <UploadCloud className="h-7 w-7 text-cf-electric" aria-hidden />}
          <span className="font-medium text-cf-fg">{loading ? "Reading file…" : dragging ? "Drop to upload" : "Click to choose or drag a file here"}</span>
          <span className="text-sm text-cf-muted">{formats}</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-cf-ok/30 bg-cf-ok/5 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-cf-electric">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-cf-fg">{safeName(file.name)}</p>
              <p className="text-xs text-cf-muted">{formatBytes(file.size)}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 shrink-0 text-cf-ok" aria-label="Uploaded successfully" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => inputRef.current?.click()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Replace
            </Button>
            <Button variant="danger" onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p id={errId} role="alert" className="flex items-start gap-2 rounded-lg border border-cf-bad/40 bg-cf-bad/10 p-3 text-sm text-cf-bad">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong className="font-semibold">Error:</strong> {error}</span>
        </p>
      )}
      {children}
    </section>
  );
}
