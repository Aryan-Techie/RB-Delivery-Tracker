import { useEffect, useRef, useState, type ReactNode } from "react";
import { plural, relativeDay } from "../lib/dates";
import type { RingView } from "../lib/model";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl bg-card shadow-card", className)}>{children}</section>;
}

type Tone = "neutral" | "accent" | "red" | "orange" | "green" | "repair";

const PILL: Record<Tone, string> = {
  neutral: "bg-fill text-sub",
  accent: "bg-accent-bg text-accent",
  red: "bg-red-bg text-red",
  orange: "bg-orange-bg text-orange",
  green: "bg-green-bg text-green",
  repair: "bg-repair-bg text-repair",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", className)} />;
}

/** "New" or "Repair 2". */
export function TripTag({ v }: { v: RingView }) {
  if (v.trip.kind === "new") return <span className="text-[13px] text-sub">New</span>;
  return <Pill tone="repair">Repair{v.repairNo > 1 ? ` ${v.repairNo}` : ""}</Pill>;
}

/** Status words for a ring: on time, due today, late, or back. */
export function StatusText({ v, today }: { v: RingView; today: string }) {
  if (v.out) {
    if (v.level === "late") return <Pill tone="red">Late · {plural(v.lateBy, "day")}</Pill>;
    if (v.level === "due")
      return (
        <span className="inline-flex items-center gap-2 font-medium text-orange">
          <Dot className="bg-orange-dot" />
          Due today
        </span>
      );
    return (
      <span className="inline-flex items-center gap-2 text-sub">
        <Dot className="bg-green-dot" />
        {v.days === 0 ? `Sent today · ${v.allowed} days` : `Day ${v.days} of ${v.allowed}`}
      </span>
    );
  }
  const rel = relativeDay(v.receivedDay!, today);
  const when = rel === "Today" || rel === "Yesterday" ? rel.toLowerCase() : rel;
  if (v.level === "late")
    return (
      <span className="text-red">
        Back {when} · {v.lateBy} {v.lateBy === 1 ? "day" : "days"} late
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sub">
      <Dot className="bg-green-dot/70" />
      Back {when} · on time
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

const BTN: Record<BtnVariant, string> = {
  primary: "bg-ink text-page hover:opacity-90",
  secondary: "bg-fill text-ink hover:bg-fill-strong",
  ghost: "text-sub hover:bg-fill hover:text-ink",
  danger: "bg-red-bg text-red hover:brightness-95",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex cursor-default items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[background,opacity,color] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-9 px-4 text-[13.5px]",
        BTN[variant],
        className,
      )}
    />
  );
}

/** A button that needs a second click within 3 s. */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  onConfirm,
  variant = "secondary",
  size = "sm",
  className,
}: {
  label: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: BtnVariant;
  size?: "sm" | "md";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Button
      size={size}
      variant={armed ? (variant === "danger" ? "danger" : "primary") : variant}
      className={cx(armed && variant !== "danger" && "!bg-accent !text-white", className)}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          window.clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-7 cursor-default rounded-md px-3 text-[12.5px] font-medium transition-colors",
            value === o.value ? "bg-card text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-sub hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-sub">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-faint">{hint}</p>}
    </div>
  );
}
