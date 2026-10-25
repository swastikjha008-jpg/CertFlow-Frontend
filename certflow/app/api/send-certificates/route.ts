import { connection } from "next/server";

/**
 * Server-side email integration point.
 *
 * Nothing is sent unless a provider is configured through environment variables:
 *   RESEND_API_KEY  – API key from resend.com (kept server-side only)
 *   EMAIL_FROM      – verified sender, e.g. "Club Name <certificates@yourdomain.com>"
 * Without them this route answers 501 and the UI says so; it never pretends to have sent mail.
 */

interface Recipient {
  name: string;
  email: string;
  filename: string;
  pdfBase64: string;
}

const MAX_RECIPIENTS_PER_REQUEST = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function configured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function GET() {
  await connection();
  return Response.json({
    configured: configured(),
    message: configured()
      ? "Email delivery is configured."
      : "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server to enable it.",
  });
}

export async function POST(request: Request) {
  await connection();
  if (!configured()) {
    return Response.json(
      { error: "not_configured", message: "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server." },
      { status: 501 },
    );
  }
  let body: { subject?: string; message?: string; recipients?: Recipient[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }
  const recipients = body.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
    return Response.json(
      { error: "bad_request", message: `Send between 1 and ${MAX_RECIPIENTS_PER_REQUEST} recipients per request.` },
      { status: 400 },
    );
  }
  const subject = String(body.subject ?? "Your certificate").slice(0, 150);
  const text = String(body.message ?? "Please find your certificate attached.").slice(0, 2000);

  const results = await Promise.all(
    recipients.map(async (r) => {
      if (!r || typeof r.email !== "string" || !EMAIL_RE.test(r.email) || typeof r.pdfBase64 !== "string") {
        return { email: String(r?.email ?? ""), ok: false, error: "Invalid recipient" };
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [r.email],
            subject,
            text,
            attachments: [{ filename: String(r.filename).slice(0, 120), content: r.pdfBase64 }],
          }),
        });
        if (!res.ok) return { email: r.email, ok: false, error: `Provider responded ${res.status}` };
        return { email: r.email, ok: true as const };
      } catch {
        return { email: r.email, ok: false, error: "Could not reach the email provider" };
      }
    }),
  );
  return Response.json({ results });
}
