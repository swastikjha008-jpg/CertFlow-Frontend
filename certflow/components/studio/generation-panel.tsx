"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Mail, Sparkles } from "lucide-react";
import { certificateFilename, generateCertificate, type CertificateSettings, type TemplateData } from "@/lib/certificate-generator";
import { buildZip, downloadBlob } from "@/lib/zip-generator";
import type { Participant } from "@/lib/participant-parser";
import { yieldToBrowser } from "@/lib/utils";
import { Button } from "@/components/ui/controls";

interface Generated {
  participant: Participant;
  filename: string;
  bytes: Uint8Array;
}
interface Failure {
  participant: Participant;
  message: string;
}
type EmailState = "idle" | "sending" | "done";
type EmailResult = { ok: boolean; error?: string };

interface Props {
  template: TemplateData | null;
  participants: Participant[];
  settings: CertificateSettings;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function GenerationPanel({ template, participants, settings }: Props) {
  const eligible = useMemo(() => participants.filter((p) => p.status === "valid"), [participants]);
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generated, setGenerated] = useState<Generated[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipPct, setZipPct] = useState(0);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailState, setEmailState] = useState<EmailState>("idle");
  const [emailResults, setEmailResults] = useState<Record<string, EmailResult>>({});
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const lock = useRef(false);

  // Results belong to the inputs that produced them; clear them if those change.
  const inputsKey = useMemo(() => `${eligible.map((p) => p.id + p.name).join("|")}::${JSON.stringify(settings)}::${template?.bytes.length}`, [eligible, settings, template]);
  const [seenKey, setSeenKey] = useState(inputsKey);
  if (seenKey !== inputsKey) {
    setSeenKey(inputsKey);
    setGenerated([]);
    setFailures([]);
    setProgress(0);
    setApproved(false);
    setEmailResults({});
    setEmailState("idle");
    setEmailNote(null);
  }

  useEffect(() => {
    let live = true;
    fetch("/api/send-certificates")
      .then((r) => r.json())
      .then((j: { configured?: boolean }) => live && setEmailConfigured(Boolean(j.configured)))
      .catch(() => live && setEmailConfigured(false));
    return () => {
      live = false;
    };
  }, []);

  const generate = useCallback(async () => {
    if (lock.current || !template || eligible.length === 0) return;
    lock.current = true;
    setRunning(true);
    setProgress(0);
    setGenerated([]);
    setFailures([]);
    const ok: Generated[] = [];
    const bad: Failure[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < eligible.length; i++) {
      const p = eligible[i];
      try {
        const bytes = await generateCertificate(template, { name: p.name, eventName: p.event, eventDate: p.date }, settings);
        ok.push({ participant: p, filename: certificateFilename(p.name, taken), bytes });
      } catch (e) {
        bad.push({ participant: p, message: e instanceof Error ? e.message : "Unknown error" });
      }
      setProgress(i + 1);
      if (i % 3 === 2) await yieldToBrowser();
    }
    setGenerated(ok);
    setFailures(bad);
    setRunning(false);
    lock.current = false;
  }, [template, eligible, settings]);

  const downloadZip = async () => {
    if (zipping || generated.length === 0) return;
    setZipping(true);
    setZipPct(0);
    try {
      const blob = await buildZip(generated.map((g) => ({ filename: g.filename, bytes: g.bytes })), setZipPct);
      downloadBlob(blob, "CertFlow_Certificates.zip");
    } finally {
      setZipping(false);
    }
  };

  const sendEmails = async () => {
    if (emailState === "sending" || !emailConfigured) return;
    setEmailState("sending");
    setEmailNote(null);
    const results: Record<string, EmailResult> = {};
    const subject = settings.eventName ? `Your certificate — ${settings.eventName}` : "Your certificate";
    const message = `Hi,\n\nPlease find your certificate attached.${settings.issuer ? `\n\n${settings.issuer}` : ""}`;
    for (let i = 0; i < generated.length; i += 10) {
      const batch = generated.slice(i, i + 10);
      try {
        const res = await fetch("/api/send-certificates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            message,
            recipients: batch.map((g) => ({ name: g.participant.name, email: g.participant.email, filename: g.filename, pdfBase64: toBase64(g.bytes) })),
          }),
        });
        const json = (await res.json()) as { results?: Array<{ email: string; ok: boolean; error?: string }>; message?: string };
        if (!res.ok || !json.results) throw new Error(json.message ?? "Delivery failed");
        for (const r of json.results) results[r.email.toLowerCase()] = { ok: r.ok, error: r.error };
      } catch (e) {
        for (const g of batch) results[g.participant.email.toLowerCase()] = { ok: false, error: e instanceof Error ? e.message : "Delivery failed" };
      }
      setEmailResults({ ...results });
    }
    setEmailState("done");
    const sent = Object.values(results).filter((r) => r.ok).length;
    setEmailNote(`${sent} of ${generated.length} emails accepted by the provider.`);
  };

  const sentCount = Object.values(emailResults).filter((r) => r.ok).length;
  const failedMail = Object.values(emailResults).filter((r) => !r.ok).length;
  const canGenerate = Boolean(template) && eligible.length > 0 && approved && !running;
  const pct = eligible.length ? Math.round((progress / eligible.length) * 100) : 0;

  return (
    <section aria-labelledby="gen-title" className="glass rounded-2xl p-5">
      <h2 id="gen-title" className="text-lg font-semibold">Generate &amp; deliver</h2>
      <p className="mt-1 text-sm text-cf-muted">Certificate generation and email delivery are tracked separately.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-cf-cyan" aria-hidden /> 1 · Certificates</h3>
          {!template && <p className="text-sm text-cf-muted">Upload a certificate template first.</p>}
          {template && eligible.length === 0 && <p className="text-sm text-cf-muted">No valid participants yet. Import a list and fix any flagged rows.</p>}
          {template && eligible.length > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-cf-line bg-white/5 p-3 text-sm">
              <input type="checkbox" checked={approved} disabled={running} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-500" />
              <span>
                I have reviewed the participant list and the preview. Generate <strong>{eligible.length}</strong> certificate{eligible.length === 1 ? "" : "s"}.
              </span>
            </label>
          )}
          <Button variant="primary" disabled={!canGenerate} onClick={generate}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {running ? `Generating… ${progress}/${eligible.length}` : "Generate Certificates"}
          </Button>

          {(running || progress > 0) && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className="h-full rounded-full bg-gradient-to-r from-cf-brand to-cf-cyan transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-cf-muted" aria-live="polite">{progress} of {eligible.length} processed</p>
            </div>
          )}

          {!running && progress > 0 && (
            <div className="space-y-2 text-sm" aria-live="polite">
              <p className="flex items-center gap-2 text-cf-ok"><CheckCircle2 className="h-4 w-4" aria-hidden /> {generated.length} generated successfully</p>
              {failures.length > 0 && (
                <div role="alert" className="rounded-lg border border-cf-bad/40 bg-cf-bad/10 p-3 text-cf-bad">
                  <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" aria-hidden /> {failures.length} failed</p>
                  <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                    {failures.map((f) => <li key={f.participant.id}>Row {f.participant.sourceRow}: {f.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button variant="outline" disabled={generated.length === 0 || zipping} onClick={downloadZip}>
            {zipping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {zipping ? `Packaging… ${zipPct}%` : `Download All as ZIP${generated.length ? ` (${generated.length})` : ""}`}
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4 text-cf-cyan" aria-hidden /> 2 · Email delivery</h3>
          <p className="rounded-lg border border-cf-line bg-white/5 p-3 text-sm">
            Status: <strong className={sentCount ? "text-cf-ok" : "text-cf-muted"}>{emailState === "idle" ? "Not sent" : emailState === "sending" ? "Sending…" : "Finished"}</strong>
            {emailState !== "idle" && <span className="text-cf-muted"> · {sentCount} sent · {failedMail} failed</span>}
          </p>
          {emailConfigured === false && (
            <div role="status" className="rounded-lg border border-cf-warn/30 bg-cf-warn/10 p-3 text-sm text-cf-warn">
              Email delivery is not configured, so no emails can be sent. Set <code className="font-mono">RESEND_API_KEY</code> and{" "}
              <code className="font-mono">EMAIL_FROM</code> in the server environment (see README), then reload. Use the ZIP download in the meantime.
            </div>
          )}
          <Button disabled={!emailConfigured || generated.length === 0 || emailState === "sending"} onClick={sendEmails}>
            {emailState === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            Send certificates by email
          </Button>
          {emailNote && <p className="text-sm text-cf-muted" aria-live="polite">{emailNote}</p>}
          {failedMail > 0 && (
            <ul className="max-h-28 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-cf-bad">
              {Object.entries(emailResults).filter(([, r]) => !r.ok).map(([email, r]) => <li key={email}>{email}: {r.error}</li>)}
            </ul>
          )}
          <p className="text-xs text-cf-muted/80">Sending posts the generated PDFs to your own server route, which forwards them to your email provider. Participant data is not sent anywhere else.</p>
        </div>
      </div>
    </section>
  );
}
