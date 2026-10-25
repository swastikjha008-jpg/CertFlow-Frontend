import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative flex min-h-[92vh] items-center px-5 pb-16 pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cf-bg/95 via-cf-bg/60 to-transparent sm:via-cf-bg/45"
      />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="max-w-2xl animate-fade-up">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cf-line bg-white/5 px-3 py-1 text-sm text-cf-electric">
            <span className="h-1.5 w-1.5 rounded-full bg-cf-cyan" aria-hidden /> One upload. Every certificate. Zero manual work.
          </p>
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-cf-fg sm:text-6xl lg:text-7xl">
            Every Certificate.
            <br />
            <span className="bg-gradient-to-r from-cf-electric to-cf-cyan bg-clip-text text-transparent">Automatically.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-cf-muted">
            Upload your certificate template, import the participant list, generate a personalised PDF for every
            attendee, and download the whole batch — with a clear hand-off point for delivering them by email.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/studio"
              className="glow-cta inline-flex min-h-12 items-center gap-2 rounded-xl bg-cf-brand px-6 text-base font-medium text-white transition-colors hover:bg-blue-400"
            >
              Create Certificates <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="#features"
              className="inline-flex min-h-12 items-center rounded-xl border border-cf-line bg-white/5 px-6 text-base text-cf-fg transition-colors hover:bg-white/10"
            >
              Explore Features
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
