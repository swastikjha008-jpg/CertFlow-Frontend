"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { CertFlowLogo } from "@/components/brand/certflow-logo";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/#about", label: "About" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3">
      <nav
        aria-label="Primary"
        className="glass-strong mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5"
      >
        <Link href="/" aria-label="CertFlow home" onClick={() => setOpen(false)}>
          <CertFlowLogo />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-lg px-3 py-2 text-sm text-cf-muted transition-colors hover:text-cf-fg">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="glow-cta inline-flex min-h-10 items-center rounded-xl bg-cf-brand px-4 text-sm font-medium text-white transition-colors hover:bg-blue-400"
          >
            Get Started
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cf-line text-cf-fg md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="glass-strong mx-auto mt-2 max-w-6xl rounded-2xl p-2 md:hidden">
          <ul>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-cf-fg hover:bg-white/10"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
