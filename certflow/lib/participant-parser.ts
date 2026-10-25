import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";

/** A parsed sheet: raw string cells, row 0 is the first row of the file. */
export interface ParsedSheet {
  rows: string[][];
  sheetName: string | null;
}

export const FIELD_KEYS = ["name", "email", "attendance", "roll", "event", "date"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_META: Record<FieldKey, { label: string; required: boolean }> = {
  name: { label: "Student name", required: true },
  email: { label: "Email address", required: true },
  attendance: { label: "Attendance status", required: false },
  roll: { label: "Roll number", required: false },
  event: { label: "Event name", required: false },
  date: { label: "Event date", required: false },
};

export type ColumnMapping = Record<FieldKey, number | null>;

const MAX_ROWS = 5000;
const MAX_CELL = 200;

/** Neutralise anything that could be mistaken for markup or control data. Values are only ever rendered as text. */
export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CELL);
}

export async function parseRosterFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  let rows: string[][];
  let sheetName: string | null = null;

  if (name.endsWith(".csv")) {
    const text = (await file.text()).replace(/^﻿/, "");
    const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (result.errors.some((e) => e.type === "Quotes")) throw new Error("The CSV has unbalanced quotes and could not be read.");
    rows = result.data.map((r) => r.map(cleanCell));
  } else {
    const buffer = await file.arrayBuffer();
    let wb: XLSX.WorkBook;
    try {
      // Formulas are never evaluated and HTML is never generated: we only read cached text values.
      wb = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
    } catch {
      throw new Error("That file could not be read as an Excel workbook.");
    }
    sheetName = wb.SheetNames[0] ?? null;
    if (!sheetName) throw new Error("The workbook has no sheets.");
    const sheet = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false, defval: "" });
    rows = raw.map((r) => r.map(cleanCell));
  }

  rows = rows.filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) throw new Error("The file contains no data.");
  if (rows.length > MAX_ROWS + 1) throw new Error(`The file has more than ${MAX_ROWS} rows. Split it into smaller batches.`);
  const width = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
  return { rows, sheetName };
}

/** First row with at least two filled cells is assumed to be the header. */
export function detectHeaderRow(rows: string[][]): number {
  const i = rows.findIndex((r) => r.filter((c) => c !== "").length >= 2);
  return i < 0 ? 0 : i;
}

const SYNONYMS: Record<FieldKey, string[]> = {
  name: ["full name", "student name", "participant name", "participant", "name", "student", "candidate name", "attendee"],
  email: ["email address", "email id", "e-mail", "email", "gmail", "mail", "mail id"],
  attendance: ["attendance status", "attendance", "present", "status", "attended"],
  roll: ["roll number", "roll no", "roll", "enrollment", "enrolment", "registration", "reg no", "student id"],
  event: ["event name", "event", "workshop", "program"],
  date: ["event date", "date"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { name: null, email: null, attendance: null, roll: null, event: null, date: null };
  const used = new Set<number>();
  const normalized = headers.map(norm);
  for (const key of FIELD_KEYS) {
    let best: { idx: number; score: number } | null = null;
    normalized.forEach((h, idx) => {
      if (!h || used.has(idx)) return;
      SYNONYMS[key].forEach((syn, rank) => {
        const score = h === syn ? 100 - rank : h.includes(syn) ? 50 - rank : 0;
        if (score > 0 && (!best || score > best.score)) best = { idx, score };
      });
    });
    const found = best as { idx: number; score: number } | null;
    if (found) {
      mapping[key] = found.idx;
      used.add(found.idx);
    }
  }
  return mapping;
}

export type RowStatus = "valid" | "invalid" | "duplicate" | "excluded";

export interface Participant {
  id: string;
  /** 1-based row number in the original file, for error messages. */
  sourceRow: number;
  name: string;
  email: string;
  attendance: string;
  roll: string;
  event: string;
  date: string;
  status: RowStatus;
  issues: string[];
}

const emailSchema = z.string().email();
const ABSENT = new Set(["absent", "a", "no", "n", "false", "0", "not attended", "did not attend", "na", "n/a"]);

export interface BuildOptions {
  /** Exclude rows whose attendance column says absent. */
  onlyPresent: boolean;
  /** Source-row ids the organiser manually excluded. */
  manuallyExcluded: ReadonlySet<string>;
}

export function buildParticipants(sheet: ParsedSheet, headerRow: number, mapping: ColumnMapping, opts: BuildOptions): Participant[] {
  const out: Participant[] = [];
  const seen = new Map<string, number>();
  const get = (row: string[], key: FieldKey) => {
    const idx = mapping[key];
    return idx === null ? "" : (row[idx] ?? "");
  };
  for (let r = headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const p: Participant = {
      id: `r${r + 1}`,
      sourceRow: r + 1,
      name: get(row, "name"),
      email: get(row, "email"),
      attendance: get(row, "attendance"),
      roll: get(row, "roll"),
      event: get(row, "event"),
      date: get(row, "date"),
      status: "valid",
      issues: [],
    };
    if (!p.name) p.issues.push("Name is missing");
    else if (p.name.length < 2) p.issues.push("Name is too short");
    if (!p.email) p.issues.push("Email is missing");
    else if (!emailSchema.safeParse(p.email).success) p.issues.push("Email address is not valid");

    if (p.issues.length > 0) {
      p.status = "invalid";
    } else {
      const key = p.email.toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) {
        p.status = "duplicate";
        p.issues.push(`Same email as row ${first}`);
      } else {
        seen.set(key, p.sourceRow);
      }
    }
    if (p.status === "valid") {
      if (opts.manuallyExcluded.has(p.id)) {
        p.status = "excluded";
        p.issues.push("Excluded by you");
      } else if (opts.onlyPresent && mapping.attendance !== null && ABSENT.has(p.attendance.toLowerCase())) {
        p.status = "excluded";
        p.issues.push("Marked absent");
      }
    }
    out.push(p);
  }
  return out;
}

export function countStatuses(list: Participant[]): Record<RowStatus, number> {
  const c: Record<RowStatus, number> = { valid: 0, invalid: 0, duplicate: 0, excluded: 0 };
  for (const p of list) c[p.status]++;
  return c;
}
