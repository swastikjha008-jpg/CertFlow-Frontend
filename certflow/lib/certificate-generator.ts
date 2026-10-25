import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type TemplateKind = "pdf" | "png" | "jpg";

export interface TemplateData {
  kind: TemplateKind;
  bytes: Uint8Array;
}

export interface CertificateSettings {
  /** Name anchor: centre of the text, as a percentage of page width/height (y from the top). */
  xPct: number;
  yPct: number;
  /** Font size in units of a 1000-wide page; scales with the page so previews match output. */
  fontSize: number;
  color: string;
  bold: boolean;
  printDetails: boolean;
  eventName: string;
  eventDate: string;
  issuer: string;
}

export const DEFAULT_CERT_SETTINGS: CertificateSettings = {
  xPct: 50,
  yPct: 48,
  fontSize: 46,
  color: "#0f2a5c",
  bold: true,
  printDetails: false,
  eventName: "",
  eventDate: "",
  issuer: "",
};

const MAX_IMAGE_PAGE_WIDTH = 842; // A4 landscape width in points

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Text the standard Helvetica font can draw (WinAnsi). Returns an explanatory error otherwise. */
export function checkDrawable(font: PDFFont, text: string): string | null {
  try {
    font.encodeText(text);
    return null;
  } catch {
    return "contains characters the built-in certificate font cannot print (for example non-Latin scripts)";
  }
}

export async function loadTemplate(file: File, kind: TemplateKind): Promise<TemplateData> {
  return { kind, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function startDocument(template: TemplateData): Promise<{ doc: PDFDocument; page: PDFPage }> {
  if (template.kind === "pdf") {
    const doc = await PDFDocument.load(template.bytes, { ignoreEncryption: false });
    if (doc.getPageCount() < 1) throw new Error("The PDF template has no pages.");
    // Keep only the first page as the certificate face.
    for (let i = doc.getPageCount() - 1; i > 0; i--) doc.removePage(i);
    return { doc, page: doc.getPage(0) };
  }
  const doc = await PDFDocument.create();
  const image = template.kind === "png" ? await doc.embedPng(template.bytes) : await doc.embedJpg(template.bytes);
  const scale = Math.min(1, MAX_IMAGE_PAGE_WIDTH / image.width);
  const page = doc.addPage([image.width * scale, image.height * scale]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return { doc, page };
}

export interface CertificateInput {
  name: string;
  eventName?: string;
  eventDate?: string;
}

/** Create one personalised certificate PDF. Throws an Error with a user-readable message on failure. */
export async function generateCertificate(template: TemplateData, input: CertificateInput, s: CertificateSettings): Promise<Uint8Array> {
  const { doc, page } = await startDocument(template);
  const font = await doc.embedFont(s.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const problem = checkDrawable(font, input.name);
  if (problem) throw new Error(`Name “${input.name}” ${problem}.`);

  const W = page.getWidth();
  const H = page.getHeight();
  const unit = W / 1000;
  const color = hexToRgb(s.color);

  // Shrink to fit if the name is wider than 90% of the page.
  let size = s.fontSize * unit;
  const maxWidth = W * 0.9;
  const widthAt = (sz: number) => font.widthOfTextAtSize(input.name, sz);
  if (widthAt(size) > maxWidth) size = size * (maxWidth / widthAt(size));

  const cx = (s.xPct / 100) * W;
  const baselineY = H - (s.yPct / 100) * H - size * 0.35;
  page.drawText(input.name, { x: cx - widthAt(size) / 2, y: baselineY, size, font, color });

  if (s.printDetails) {
    const lines: string[] = [];
    const event = [input.eventName || s.eventName, input.eventDate || s.eventDate].filter(Boolean).join("  ·  ");
    if (event) lines.push(event);
    if (s.issuer) lines.push(s.issuer);
    let y = baselineY - size * 1.1;
    for (const line of lines) {
      if (checkDrawable(regular, line)) continue;
      const sz = Math.max(8, size * 0.38);
      page.drawText(line, { x: cx - regular.widthOfTextAtSize(line, sz) / 2, y, size: sz, font: regular, color });
      y -= sz * 1.5;
    }
  }
  return doc.save();
}

/** Predictable, filesystem-safe filename: Student_Name_Certificate.pdf */
export function certificateFilename(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "Participant";
  let candidate = `${base}_Certificate.pdf`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base}_${n++}_Certificate.pdf`;
  taken.add(candidate.toLowerCase());
  return candidate;
}
