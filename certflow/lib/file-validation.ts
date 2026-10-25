import { formatBytes } from "@/lib/utils";

export type FileCheck = { ok: true } | { ok: false; error: string };

export const TEMPLATE_RULES = {
  extensions: [".pdf", ".png", ".jpg", ".jpeg"],
  mimes: ["application/pdf", "image/png", "image/jpeg"],
  maxBytes: 15 * 1024 * 1024,
};

export const ROSTER_RULES = {
  extensions: [".xlsx", ".csv"],
  mimes: [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "",
  ],
  maxBytes: 5 * 1024 * 1024,
};

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function check(file: File, rules: { extensions: string[]; mimes: string[]; maxBytes: number }, label: string): FileCheck {
  const ext = extensionOf(file.name);
  if (!rules.extensions.includes(ext)) {
    return { ok: false, error: `“${safeName(file.name)}” is not a supported ${label}. Use ${rules.extensions.join(", ")}.` };
  }
  if (!rules.mimes.includes(file.type)) {
    return { ok: false, error: `“${safeName(file.name)}” has an unexpected file type (${file.type || "unknown"}).` };
  }
  if (file.size === 0) return { ok: false, error: `“${safeName(file.name)}” is empty.` };
  if (file.size > rules.maxBytes) {
    return { ok: false, error: `“${safeName(file.name)}” is ${formatBytes(file.size)}. The limit is ${formatBytes(rules.maxBytes)}.` };
  }
  return { ok: true };
}

export const validateTemplateFile = (f: File): FileCheck => check(f, TEMPLATE_RULES, "template");
export const validateRosterFile = (f: File): FileCheck => check(f, ROSTER_RULES, "participant list");

/** Display-safe filename (strips control characters, caps length). */
export function safeName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
}

/** Sniff the real format from magic bytes so a renamed file can't slip through. */
export async function sniffTemplateKind(file: File): Promise<"pdf" | "png" | "jpg" | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  return null;
}
