import JSZip from "jszip";

export interface ZipEntry {
  filename: string;
  bytes: Uint8Array;
}

export async function buildZip(entries: ZipEntry[], onProgress?: (percent: number) => void): Promise<Blob> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.filename, e.bytes, { binary: true });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (meta) =>
    onProgress?.(Math.round(meta.percent)),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
