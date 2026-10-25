"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import { countStatuses, type Participant, type RowStatus } from "@/lib/participant-parser";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const STATUS_UI: Record<RowStatus, { label: string; icon: typeof Ban; cls: string }> = {
  valid: { label: "Valid", icon: CheckCircle2, cls: "text-cf-ok" },
  invalid: { label: "Invalid", icon: AlertTriangle, cls: "text-cf-bad" },
  duplicate: { label: "Duplicate", icon: Copy, cls: "text-cf-warn" },
  excluded: { label: "Excluded", icon: Ban, cls: "text-cf-muted" },
};

interface Props {
  participants: Participant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleExclude: (id: string) => void;
  manuallyExcluded: ReadonlySet<string>;
}

export function ParticipantTable({ participants, selectedId, onSelect, onToggleExclude, manuallyExcluded }: Props) {
  const [query, setQuery] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [page, setPage] = useState(0);
  const counts = useMemo(() => countStatuses(participants), [participants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return participants.filter((p) => {
      if (onlyProblems && p.status !== "invalid" && p.status !== "duplicate") return false;
      return !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    });
  }, [participants, query, onlyProblems]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <section aria-labelledby="table-title" className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="table-title" className="text-lg font-semibold">Participants</h2>
          <p className="mt-1 text-sm text-cf-muted">Review every row before generating. Nothing is dropped silently.</p>
        </div>
        <dl className="flex flex-wrap gap-2 text-sm" aria-label="Validation summary">
          {(["valid", "invalid", "duplicate", "excluded"] as const).map((s) => {
            const ui = STATUS_UI[s];
            return (
              <div key={s} className="flex items-center gap-1.5 rounded-lg border border-cf-line bg-white/5 px-2.5 py-1">
                <ui.icon className={cn("h-3.5 w-3.5", ui.cls)} aria-hidden />
                <dt className="text-cf-muted">{ui.label}</dt>
                <dd className="font-medium tabular-nums text-cf-fg">{counts[s]}</dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cf-muted" aria-hidden />
          <input
            type="search"
            aria-label="Search participants by name or email"
            placeholder="Search name or email"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="glass-field w-full rounded-lg py-2 pl-9 pr-3 text-sm text-cf-fg placeholder:text-cf-muted/60"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-cf-muted">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => {
              setOnlyProblems(e.target.checked);
              setPage(0);
            }}
            className="h-4 w-4 accent-blue-500"
          />
          Show only invalid or duplicate rows
        </label>
      </div>

      {(counts.invalid > 0 || counts.duplicate > 0) && (
        <p className="mt-4 rounded-lg border border-cf-warn/30 bg-cf-warn/10 p-3 text-sm text-cf-warn">
          How to fix: correct the highlighted rows in your spreadsheet and re-upload it (Replace). Invalid and duplicate rows
          are skipped during generation until fixed.
        </p>
      )}

      <div className="cf-scroll relative mt-4 overflow-x-auto rounded-xl border border-cf-line/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white/5 text-xs text-cf-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Row</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Name</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Email</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Attendance</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-cf-muted">No participants match.</td></tr>
            )}
            {slice.map((p) => {
              const ui = STATUS_UI[p.status];
              const bad = p.status === "invalid" || p.status === "duplicate";
              return (
                <tr
                  key={p.id}
                  aria-selected={p.id === selectedId}
                  className={cn(
                    "border-t border-cf-line/50 transition-colors",
                    bad && "bg-cf-bad/[0.07]",
                    p.id === selectedId && "outline outline-1 -outline-offset-1 outline-cf-electric/60",
                  )}
                >
                  <td className="px-3 py-2.5 tabular-nums text-cf-muted">{p.sourceRow}</td>
                  <td className="px-3 py-2.5">
                    {p.status === "valid" || p.status === "excluded" ? (
                      <button type="button" onClick={() => onSelect(p.id)} className="text-left font-medium text-cf-fg underline-offset-2 hover:underline">
                        {p.name}
                      </button>
                    ) : (
                      p.name || <span className="text-cf-bad">(missing)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-cf-muted">{p.email || <span className="text-cf-bad">(missing)</span>}</td>
                  <td className="px-3 py-2.5 text-cf-muted">{p.attendance || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5", ui.cls)}>
                      <ui.icon className="h-4 w-4" aria-hidden />
                      {ui.label}
                    </span>
                    {p.issues.length > 0 && <span className="mt-0.5 block text-xs text-cf-muted">{p.issues.join("; ")}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {(p.status === "valid" || manuallyExcluded.has(p.id)) && (
                      <button
                        type="button"
                        onClick={() => onToggleExclude(p.id)}
                        className="rounded-md px-2 py-1 text-xs text-cf-muted hover:bg-white/10 hover:text-cf-fg"
                        aria-label={`${manuallyExcluded.has(p.id) ? "Include" : "Exclude"} ${p.name}`}
                      >
                        {manuallyExcluded.has(p.id) ? "Include" : "Exclude"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-cf-muted">
        <span>{filtered.length} rows · page {current + 1} of {pages}</span>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg border border-cf-line p-2 hover:bg-white/10 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg border border-cf-line p-2 hover:bg-white/10 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
