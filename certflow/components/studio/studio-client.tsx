"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Settings2 } from "lucide-react";
import { CertFlowLogo } from "@/components/brand/certflow-logo";
import { AsciiControls } from "@/components/effects/ascii-controls";
import { CertificatePreview } from "@/components/studio/certificate-preview";
import { ColumnMappingPanel } from "@/components/studio/column-mapping";
import { GenerationPanel } from "@/components/studio/generation-panel";
import { ParticipantTable } from "@/components/studio/participant-table";
import { UploadCard } from "@/components/studio/upload-card";
import { Collapsible } from "@/components/ui/controls";
import { DEFAULT_CERT_SETTINGS, loadTemplate, type CertificateSettings, type TemplateData } from "@/lib/certificate-generator";
import { safeName, sniffTemplateKind, validateRosterFile, validateTemplateFile } from "@/lib/file-validation";
import {
  buildParticipants,
  countStatuses,
  detectHeaderRow,
  parseRosterFile,
  suggestMapping,
  type ColumnMapping,
  type FieldKey,
  type ParsedSheet,
} from "@/lib/participant-parser";
import { cn } from "@/lib/utils";

const STAGES = ["Template", "Participants", "Validate", "Preview", "Generate"] as const;

export function StudioClient() {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: null, email: null, attendance: null, roll: null, event: null, date: null });
  const [onlyPresent, setOnlyPresent] = useState(true);
  const [manuallyExcluded, setManuallyExcluded] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CertificateSettings>(DEFAULT_CERT_SETTINGS);

  // Release object URLs when replaced and on unmount.
  useEffect(() => () => { if (templateUrl) URL.revokeObjectURL(templateUrl); }, [templateUrl]);

  const onTemplate = useCallback(async (file: File) => {
    setTemplateError(null);
    const check = validateTemplateFile(file);
    if (!check.ok) return setTemplateError(check.error);
    setTemplateLoading(true);
    try {
      const kind = await sniffTemplateKind(file);
      if (!kind) throw new Error(`“${safeName(file.name)}” does not look like a real PDF, PNG or JPG file.`);
      const data = await loadTemplate(file, kind);
      if (kind === "pdf") {
        const { PDFDocument } = await import("pdf-lib");
        try { await PDFDocument.load(data.bytes); } catch { throw new Error("That PDF is damaged or password-protected and cannot be used as a template."); }
      }
      setTemplate(data);
      setTemplateFile(file);
      setTemplateUrl(kind === "pdf" ? null : URL.createObjectURL(new Blob([data.bytes as BlobPart], { type: kind === "png" ? "image/png" : "image/jpeg" })));
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Could not read the template.");
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  const onRoster = useCallback(async (file: File) => {
    setRosterError(null);
    const check = validateRosterFile(file);
    if (!check.ok) return setRosterError(check.error);
    setRosterLoading(true);
    try {
      const parsed = await parseRosterFile(file);
      const header = detectHeaderRow(parsed.rows);
      setSheet(parsed);
      setRosterFile(file);
      setHeaderRow(header);
      setMapping(suggestMapping(parsed.rows[header] ?? []));
      setManuallyExcluded(new Set());
      setSelectedId(null);
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : "Could not read the participant list.");
    } finally {
      setRosterLoading(false);
    }
  }, []);

  const participants = useMemo(
    () => (sheet && mapping.name !== null && mapping.email !== null ? buildParticipants(sheet, headerRow, mapping, { onlyPresent, manuallyExcluded }) : []),
    [sheet, headerRow, mapping, onlyPresent, manuallyExcluded],
  );
  const counts = useMemo(() => countStatuses(participants), [participants]);
  const mappingReady = mapping.name !== null && mapping.email !== null;

  const stageDone = [Boolean(template), Boolean(sheet), mappingReady && participants.length > 0, Boolean(template) && counts.valid > 0, false];
  const activeStage = !template ? 0 : !sheet ? 1 : !mappingReady ? 2 : 3;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-cf-line bg-white/5 px-3 py-2 text-sm text-cf-muted transition-colors hover:text-cf-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Home
        </Link>
        <Link href="/" aria-label="CertFlow home"><CertFlowLogo /></Link>
      </header>

      <div className="mt-8 animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Certificate workspace</h1>
        <p className="mt-2 max-w-2xl text-cf-muted">Upload a template and a participant list, check the data, preview a certificate, then generate everything. Your files never leave this browser tab.</p>
      </div>

      <nav aria-label="Workflow progress" className="mt-8">
        <ol className="grid grid-cols-5 gap-2">
          {STAGES.map((s, i) => {
            const done = stageDone[i];
            const active = i === activeStage;
            return (
              <li key={s} aria-current={active ? "step" : undefined} className={cn("glass-subtle flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-xs sm:flex-row sm:justify-center sm:gap-2 sm:text-sm", active && "border-cf-electric/60 text-cf-fg", !active && "text-cf-muted")}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-xs", done ? "border-cf-ok/60 bg-cf-ok/15 text-cf-ok" : active ? "border-cf-electric text-cf-electric" : "border-cf-line")}>
                  {done ? <Check className="h-3.5 w-3.5" aria-label="Complete" /> : i + 1}
                </span>
                {s}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <UploadCard
          title="Certificate Template"
          description="Upload the certificate design for your event."
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          formats="PDF, PNG or JPG · up to 15 MB"
          icon="template"
          file={templateFile}
          loading={templateLoading}
          error={templateError}
          onFile={onTemplate}
          onRemove={() => { setTemplate(null); setTemplateFile(null); setTemplateUrl(null); setTemplateError(null); }}
        >
          {templateUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={templateUrl} alt="Uploaded template thumbnail" className="max-h-40 w-full rounded-lg border border-cf-line object-contain" />
          )}
          {template?.kind === "pdf" && <p className="text-sm text-cf-muted">PDF template accepted. Its first page is used; the live preview is below.</p>}
        </UploadCard>

        <UploadCard
          title="Participant List"
          description="Import your student names and email addresses."
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          formats="Excel (.xlsx) or CSV · up to 5 MB"
          icon="roster"
          file={rosterFile}
          loading={rosterLoading}
          error={rosterError}
          onFile={onRoster}
          onRemove={() => { setSheet(null); setRosterFile(null); setRosterError(null); setManuallyExcluded(new Set()); setSelectedId(null); }}
        >
          {sheet && (
            <p className="text-sm text-cf-muted" aria-live="polite">
              Detected <strong className="text-cf-fg">{Math.max(0, sheet.rows.length - headerRow - 1)}</strong> rows · columns:{" "}
              {(sheet.rows[headerRow] ?? []).filter(Boolean).join(", ")}
            </p>
          )}
        </UploadCard>
      </div>

      <div className="mt-5 space-y-5">
        {sheet && (
          <ColumnMappingPanel
            sheet={sheet}
            headerRow={headerRow}
            mapping={mapping}
            onHeaderRow={(row) => { setHeaderRow(row); setMapping(suggestMapping(sheet.rows[row] ?? [])); setManuallyExcluded(new Set()); }}
            onMapping={(key: FieldKey, col) => setMapping((m) => ({ ...m, [key]: col }))}
            onlyPresent={onlyPresent}
            onOnlyPresent={setOnlyPresent}
          />
        )}

        {participants.length > 0 && (
          <ParticipantTable
            participants={participants}
            selectedId={selectedId}
            onSelect={setSelectedId}
            manuallyExcluded={manuallyExcluded}
            onToggleExclude={(id) => setManuallyExcluded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          />
        )}

        <CertificatePreview template={template} templateImageUrl={templateUrl} participants={participants} selectedId={selectedId} onSelect={setSelectedId} settings={settings} onSettings={setSettings} />

        <GenerationPanel template={template} participants={participants} settings={settings} />

        <section aria-labelledby="visual-title" className="glass-strong rounded-2xl p-3">
          <Collapsible title="Visual settings — ASCII background" className="border-0">
            <h2 id="visual-title" className="sr-only">Visual settings</h2>
            <p className="flex items-center gap-2 text-sm text-cf-muted"><Settings2 className="h-4 w-4" aria-hidden /> These only change the background animation. Your certificates are not affected.</p>
            <AsciiControls />
          </Collapsible>
        </section>
      </div>
    </div>
  );
}
