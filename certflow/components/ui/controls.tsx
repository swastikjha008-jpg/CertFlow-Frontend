"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", props.disabled && "opacity-50")}>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="text-cf-muted">
          {props.label}
        </label>
        <output htmlFor={id} className="tabular-nums text-cf-fg">
          {props.value}
          {props.unit ?? ""}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="cf-range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function SwitchField(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id} className="text-cf-muted">
        {props.label}
        {props.hint && <span className="block text-xs text-cf-muted/70">{props.hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          props.checked ? "border-cf-electric/60 bg-cf-brand/70" : "border-cf-line bg-slate-800/70",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all",
            props.checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={id} className="text-cf-muted">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="glass-field w-full rounded-lg px-3 py-2 text-cf-fg"
      >
        {props.options.map((o) => (
          <option key={o} value={o} className="bg-slate-900">
            {props.format ? props.format(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ColorField(props: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id} className="text-cf-muted">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-cf-fg">{props.value}</span>
        <input
          id={id}
          type="color"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-md border border-cf-line bg-transparent p-0.5"
        />
      </div>
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={id} className="text-cf-muted">
        {props.label}
      </label>
      <input
        id={id}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        onChange={(e) => props.onChange(e.target.value)}
        className="glass-field w-full rounded-lg px-3 py-2 text-cf-fg placeholder:text-cf-muted/60"
      />
    </div>
  );
}

/** Keyboard-accessible collapsible section. */
export function Collapsible(props: { title: string; defaultOpen?: boolean; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const id = useId();
  return (
    <div className={cn("rounded-xl border border-cf-line/70", props.className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-cf-fg"
      >
        {props.title}
        <ChevronDown className={cn("h-4 w-4 text-cf-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} className="space-y-4 border-t border-cf-line/70 px-4 py-4">
          {props.children}
        </div>
      )}
    </div>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
}) {
  const variant = props.variant ?? "outline";
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "glow-cta bg-cf-brand text-white hover:bg-blue-400 disabled:hover:bg-cf-brand",
        variant === "outline" && "border border-cf-line bg-white/5 text-cf-fg hover:border-cf-electric/50 hover:bg-white/10",
        variant === "ghost" && "text-cf-muted hover:bg-white/10 hover:text-cf-fg",
        variant === "danger" && "border border-cf-bad/40 bg-cf-bad/10 text-cf-bad hover:bg-cf-bad/20",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}
