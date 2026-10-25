"use client";

import { useId } from "react";
import { FIELD_KEYS, FIELD_META, type ColumnMapping, type FieldKey, type ParsedSheet } from "@/lib/participant-parser";
import { SwitchField } from "@/components/ui/controls";

interface Props {
  sheet: ParsedSheet;
  headerRow: number;
  mapping: ColumnMapping;
  onHeaderRow: (row: number) => void;
  onMapping: (key: FieldKey, column: number | null) => void;
  onlyPresent: boolean;
  onOnlyPresent: (v: boolean) => void;
}

export function ColumnMappingPanel({ sheet, headerRow, mapping, onHeaderRow, onMapping, onlyPresent, onOnlyPresent }: Props) {
  const headerId = useId();
  const headers = sheet.rows[headerRow] ?? [];
  const maxHeader = Math.min(sheet.rows.length, 15);

  return (
    <section aria-labelledby="map-title" className="glass rounded-2xl p-5">
      <h2 id="map-title" className="text-lg font-semibold">Map columns</h2>
      <p className="mt-1 text-sm text-cf-muted">
        We found {sheet.rows.length - headerRow - 1} data rows and {headers.filter(Boolean).length} columns
        {sheet.sheetName ? ` in sheet “${sheet.sheetName}”` : ""}. Check the suggested mapping.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor={headerId} className="text-cf-muted">Header row</label>
        <select
          id={headerId}
          value={headerRow}
          onChange={(e) => onHeaderRow(Number(e.target.value))}
          className="glass-field rounded-lg px-3 py-2 text-cf-fg"
        >
          {Array.from({ length: maxHeader }, (_, i) => (
            <option key={i} value={i} className="bg-slate-900">Row {i + 1}</option>
          ))}
        </select>
        <p className="text-cf-muted">Columns: {headers.map((h, i) => h || `(blank ${i + 1})`).join(" · ")}</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_KEYS.map((key) => {
          const meta = FIELD_META[key];
          const id = `map-${key}`;
          const missing = meta.required && mapping[key] === null;
          return (
            <div key={key} className="space-y-1.5 text-sm">
              <label htmlFor={id} className="flex items-center gap-2 text-cf-muted">
                {meta.label}
                <span className={meta.required ? "text-cf-electric" : "text-cf-muted/70"}>{meta.required ? "Required" : "Optional"}</span>
              </label>
              <select
                id={id}
                value={mapping[key] ?? ""}
                onChange={(e) => onMapping(key, e.target.value === "" ? null : Number(e.target.value))}
                aria-invalid={missing}
                className={`glass-field w-full rounded-lg px-3 py-2 text-cf-fg ${missing ? "border-cf-bad/60" : ""}`}
              >
                <option value="" className="bg-slate-900">{meta.required ? "Select a column…" : "Not used"}</option>
                {headers.map((h, i) => (
                  <option key={i} value={i} className="bg-slate-900">{h || `(blank column ${i + 1})`}</option>
                ))}
              </select>
              {missing && <p role="alert" className="text-cf-bad">Error: choose a column for {meta.label.toLowerCase()}.</p>}
            </div>
          );
        })}
      </div>

      {mapping.attendance !== null && (
        <div className="mt-5 border-t border-cf-line/60 pt-4">
          <SwitchField label="Only certify participants marked present" checked={onlyPresent} onChange={onOnlyPresent} hint="Rows marked absent are excluded, not deleted" />
        </div>
      )}
    </section>
  );
}
