import Link from "next/link";
import { CertFlowLogo } from "@/components/brand/certflow-logo";

export function Footer() {
  return (
    <footer className="glass-subtle mt-24 border-x-0 border-b-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <CertFlowLogo compact />
          <p className="max-w-sm text-sm leading-relaxed text-cf-muted">
            Certificate automation for college clubs and event organizers. Upload once, personalise every certificate,
            download them all.
          </p>
        </div>
        <nav aria-label="Product" className="space-y-3 text-sm">
          <p className="font-medium text-cf-fg">Product</p>
          <ul className="space-y-2 text-cf-muted">
            <li><Link className="hover:text-cf-fg" href="/studio">Workspace</Link></li>
            <li><Link className="hover:text-cf-fg" href="/#features">Features</Link></li>
            <li><Link className="hover:text-cf-fg" href="/#workflow">Workflow</Link></li>
          </ul>
        </nav>
        <nav aria-label="Company" className="space-y-3 text-sm">
          <p className="font-medium text-cf-fg">About</p>
          <ul className="space-y-2 text-cf-muted">
            <li><Link className="hover:text-cf-fg" href="/#about">Why CertFlow</Link></li>
            <li><Link className="hover:text-cf-fg" href="/#preview">Product preview</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-cf-line/60 px-5 py-5 text-center text-xs text-cf-muted">
        © CertFlow. Participant files are processed in your browser.
      </div>
    </footer>
  );
}
