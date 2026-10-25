import { cn } from "@/lib/utils";

/** Original CertFlow mark: a certificate sheet whose seal flows into connected nodes. */
export function CertFlowMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={cn("h-8 w-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="cf-grad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67E8F9" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <rect x="4.5" y="5.5" width="22" height="29" rx="4.5" stroke="url(#cf-grad)" strokeWidth="2.4" />
      <path d="M10 13h10M10 18h7" stroke="#A7B4CC" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 29c5 0 4-8 9-8s4 6 9 6" stroke="url(#cf-grad)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="17" cy="29" r="2.6" fill="#050816" stroke="#60A5FA" strokeWidth="2" />
      <circle cx="26" cy="21" r="2.6" fill="#050816" stroke="#60A5FA" strokeWidth="2" />
      <circle cx="35" cy="27" r="3" fill="#67E8F9" />
    </svg>
  );
}

export function CertFlowLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <CertFlowMark className={compact ? "h-6 w-6" : "h-8 w-8"} />
      <span className={cn("font-semibold tracking-tight text-cf-fg", compact ? "text-base" : "text-lg")}>
        Cert<span className="text-cf-electric">Flow</span>
      </span>
    </span>
  );
}
