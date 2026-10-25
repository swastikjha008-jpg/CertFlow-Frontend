# CertFlow

Certificate automation for college clubs and event organizers. Upload a template + participant list (Excel/CSV), map columns, validate, preview, generate personalised PDFs, download a ZIP. Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · pdf-lib · JSZip · SheetJS · Zod, with a Canvas2D ASCII background (Surf BG 2–inspired).

## Run

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm build && pnpm start
```

Try it with `samples/certificate-template.png` and `samples/participants.csv` (contains an invalid email, a duplicate, an absent row and a missing name on purpose).

## Email delivery (optional, server-side)

Nothing is emailed unless configured. Create `.env.local`:

```
RESEND_API_KEY=re_xxx
EMAIL_FROM="AI Club <certificates@yourdomain.com>"
```

`app/api/send-certificates/route.ts` is the integration point (GET reports status, POST sends up to 25 PDFs per request through Resend). Without these variables the UI shows a clear "not configured" message. This adapter has not been tested against a live Resend account; swap the `fetch` for another provider if you prefer.

## Notes

- Files are parsed and PDFs generated entirely in the browser; spreadsheet formulas are never evaluated and cells are rendered as text only.
- Certificate names use the built-in Helvetica font, so non-Latin scripts (e.g. Devanagari) fail with a clear per-row error instead of printing wrongly. Embedding a Unicode font via `@pdf-lib/fontkit` is the upgrade path.
- Image templates are scaled to at most A4-landscape width in the PDF.
- The ASCII renderer lives in `components/effects/ascii-renderer.ts` + `lib/ascii/*`; all 25 render modes, 5 animation styles, blur types and 9 post effects are wired to the controls under "Visual settings" in `/studio`. Default preset is in `lib/ascii/default-config.ts`.
- The default hero image is drawn procedurally (no external asset). Upload your own photo in Visual settings.
- This Next.js version enables Cache Components; avoid `new Date()` / request data in static components.

## Structure

```
app/            layout, landing, /studio, api/send-certificates
components/     brand, layout, landing, studio, effects, ui
lib/            file-validation, participant-parser, certificate-generator, zip-generator, ascii/*
samples/        sample template, CSV, XLSX
```
