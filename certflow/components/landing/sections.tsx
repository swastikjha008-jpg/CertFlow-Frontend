import {
  Copy,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  Mail,
  PackageOpen,
  ShieldCheck,
  Send,
  SlidersHorizontal,
  Upload,
  Users,
} from "lucide-react";

const STEPS = [
  { icon: Upload, title: "Upload Template", text: "Drop in your PDF, PNG or JPG certificate design." },
  { icon: Users, title: "Import Participants", text: "Bring in an Excel or CSV roster and map its columns." },
  { icon: ShieldCheck, title: "Validate Data", text: "Catch missing names, bad emails and duplicates early." },
  { icon: FileText, title: "Generate PDFs", text: "Create one personalised PDF per participant." },
  { icon: Send, title: "Deliver Certificates", text: "Download a ZIP, or hand off to your email provider." },
];

export function HowItWorks() {
  return (
    <section id="workflow" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">From spreadsheet to certificates in five steps</h2>
        <ol className="relative mt-12 grid gap-4 md:grid-cols-5">
          <div aria-hidden className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-cf-electric/40 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="glass group relative rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-cf-electric/40"
            >
              <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-cf-electric/40 bg-cf-bg/80 text-cf-electric">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-xs text-cf-muted">Step {i + 1}</p>
              <h3 className="mt-1 font-medium text-cf-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cf-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Copy, title: "Reusable certificate templates", text: "Keep one design for the whole event and position the name exactly where it belongs." },
  { icon: FileSpreadsheet, title: "Excel and CSV imports", text: "Parse .xlsx and .csv files right in the browser — no upload to a server." },
  { icon: SlidersHorizontal, title: "Flexible column mapping", text: "Columns are suggested automatically and can be corrected by hand." },
  { icon: ShieldCheck, title: "Validation and duplicate detection", text: "Invalid rows are flagged, never silently dropped, with guidance to fix them." },
  { icon: Layers, title: "Bulk PDF generation", text: "Generate hundreds of certificates with live progress and per-file status." },
  { icon: PackageOpen, title: "ZIP download", text: "One click packages every PDF with predictable, sanitised filenames." },
  { icon: Mail, title: "Email integration and tracking", text: "A defined server-side endpoint for delivery, with honest status — never faked." },
  { icon: Lock, title: "Secure handling of participant files", text: "Student data stays on your device unless you configure an email integration." },
];

export function Features() {
  return (
    <section id="features" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything an event team needs</h2>
        <p className="mt-3 max-w-2xl text-cf-muted">Built for clubs and communities that issue certificates after every workshop and seminar.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <article key={f.title} className="glass rounded-2xl p-5 transition-colors hover:border-cf-electric/40">
              <f.icon className="h-5 w-5 text-cf-cyan" aria-hidden />
              <h3 className="mt-4 font-medium text-cf-fg">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cf-muted">{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const PREVIEW_ROWS = [
  ["Aarav Sharma", "aarav.s@college.edu", "Present", "valid"],
  ["Diya Verma", "diya.verma@college.edu", "Present", "valid"],
  ["Kabir Singh", "kabir.singh@college", "Present", "invalid"],
  ["Meera Iyer", "meera.i@college.edu", "Absent", "excluded"],
  ["Rohan Gupta", "rohan.g@college.edu", "Present", "valid"],
];

export function ProductPreview() {
  return (
    <section id="preview" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">A workspace that shows its work</h2>
        <p className="mt-3 max-w-2xl text-cf-muted">Template, roster and personalised preview side by side. This is an illustration of the real workspace.</p>
        <div className="glass-subtle mt-10 grid gap-4 rounded-3xl p-4 md:grid-cols-[1.1fr_1fr] md:p-5">
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-5">
            <div className="relative aspect-[1.414/1] w-full max-w-md rounded-lg border border-white/20 bg-gradient-to-br from-slate-100 to-blue-100 p-4 text-slate-800 shadow-xl">
              <div className="absolute inset-2 rounded border-2 border-blue-500/50" aria-hidden />
              <div className="relative flex h-full flex-col items-center justify-center text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-blue-700">Certificate of participation</p>
                <p className="mt-3 text-xs text-slate-600">This is awarded to</p>
                <p className="mt-1 border-b border-blue-500/50 px-4 pb-1 text-2xl font-semibold text-blue-900">Aarav Sharma</p>
                <p className="mt-3 text-[10px] text-slate-600">AI Workshop 2026 · 12 March 2026</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-cf-muted">Live preview of the selected participant</p>
          </div>
          <div className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-cf-line/60 px-4 py-3 text-sm">
              <span className="font-medium">Participants</span>
              <span className="text-cf-muted">5 shown · 3 valid</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs text-cf-muted">
                  <tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th><th className="px-4 py-2 font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((r) => (
                    <tr key={r[1]} className="border-t border-cf-line/40">
                      <td className="px-4 py-2.5">{r[0]}</td>
                      <td className="px-4 py-2.5 text-cf-muted">{r[1]}</td>
                      <td className="px-4 py-2.5">
                        <span className={r[3] === "valid" ? "text-cf-ok" : r[3] === "invalid" ? "text-cf-bad" : "text-cf-muted"}>
                          {r[3] === "valid" ? "✓ Valid" : r[3] === "invalid" ? "✕ Invalid email" : "– Excluded"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section id="about" className="px-5 py-20">
      <div className="glass mx-auto max-w-4xl rounded-3xl p-8 text-center md:p-12">
        <h2 className="text-3xl font-semibold tracking-tight">Made for the people who run the event</h2>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-cf-muted">
          Organizers shouldn&apos;t spend the night after a workshop copy-pasting names into a design tool. CertFlow turns that
          chore into a few minutes: upload, check, generate, done.
        </p>
      </div>
    </section>
  );
}
