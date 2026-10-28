import type { ReactNode } from "react";
import type { Band } from "@/lib/scoring/compute";
import { whatsappLink } from "@/lib/whatsapp";
import type { Evidence } from "@/lib/scoring/schema";

const BAND_STYLE: Record<Band, { label: string; fill: string }> = {
  green: { label: "Green", fill: "fill-good" },
  amber: { label: "Amber", fill: "fill-warning" },
  red: { label: "Red", fill: "fill-critical" },
};

/** Circle, triangle and square, so the band reads without colour too. */
function BandShape({ band }: { band: Band }) {
  const fill = BAND_STYLE[band].fill;
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
      {band === "green" && <circle cx="5" cy="5" r="5" className={fill} />}
      {band === "amber" && <path d="M5 0.5 9.8 9.5H0.2Z" className={fill} />}
      {band === "red" && <rect width="10" height="10" rx="1.5" className={fill} />}
    </svg>
  );
}

/** A scorecard level (10 met, 5 partial, 0 missed) read as a band, for its colour and shape. */
const LEVEL_BAND: Record<number, Band> = { 10: "green", 5: "amber", 0: "red" };
const LEVEL_WORD: Record<number, string> = { 10: "Met", 5: "Partial", 0: "Missed" };
const INK: Record<Band, string> = { green: "text-good-ink", amber: "text-warning-ink", red: "text-critical-ink" };
const FILL: Record<Band, string> = { green: "bg-good", amber: "bg-warning", red: "bg-critical" };

/** A word in a band's colour after its shape, so it reads without colour too. */
export function StatusLabel({ band, children }: { band: Band; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${INK[band]}`}>
      <BandShape band={band} />
      {children}
    </span>
  );
}

/** "▲ Partial" for a scorecard level. */
export function LevelStatus({ level }: { level: number }) {
  return <StatusLabel band={LEVEL_BAND[level] ?? "amber"}>{LEVEL_WORD[level] ?? level}</StatusLabel>;
}

/** Points earned in the level's colour, out of the area's weight, with a small meter beneath. */
export function LevelPoints({ level, weight }: { level: number; weight: number }) {
  const band = LEVEL_BAND[level] ?? "amber";
  const points = (weight * level) / 10;
  return (
    <div className="inline-flex flex-col items-end gap-1.5" title={`${points} of ${weight} points`}>
      <span className="tabular-nums">
        <span className={`text-base font-semibold ${INK[band]}`}>{points}</span>
        <span className="text-muted">/{weight}</span>
      </span>
      <span className="block h-1 w-12 overflow-hidden rounded-full bg-border" aria-hidden="true">
        <span className={`block h-full rounded-full ${FILL[band]}`} style={{ width: `${(level / 10) * 100}%` }} />
      </span>
    </div>
  );
}

/** The band's text colour, e.g. for a call's total. */
export const bandInk = (band: Band) => INK[band];
export const bandLabel = (band: Band) => BAND_STYLE[band].label;

/**
 * A score out of 100 on a thin bar in the band's colour, with gaps where Amber (60) and Green
 * (80) begin so the distance to the next band shows at a glance.
 */
export function ScoreMeter({ score, band, className = "w-24" }: { score: number; band: Band; className?: string }) {
  return (
    <span className={`relative block h-1.5 overflow-hidden rounded-full bg-border ${className}`} aria-hidden="true">
      <span className={`absolute inset-y-0 left-0 rounded-full ${FILL[band]}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      <span className="absolute inset-y-0 left-[60%] w-0.5 bg-surface" />
      <span className="absolute inset-y-0 left-[80%] w-0.5 bg-surface" />
    </span>
  );
}

/** A score as a large number in its band's colour, the band's shape and name, and the meter. */
export function ScoreFigure({ score, band, size = "lg" }: { score: number; band: Band; size?: "lg" | "md" }) {
  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className={`${size === "lg" ? "text-2xl" : "text-base"} font-semibold tabular-nums ${INK[band]}`}>{score}</span>
        <span className="text-xs">
          <StatusLabel band={band}>{BAND_STYLE[band].label}</StatusLabel>
        </span>
      </span>
      <ScoreMeter score={score} band={band} className={size === "lg" ? "w-full max-w-36" : "w-24"} />
    </span>
  );
}

/** Initials in a circle, so the people list scans by person. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted" aria-hidden="true">
      {initials || (
        // No name yet: a plain person outline.
        <svg viewBox="0 0 16 16" className="size-3.5">
          <circle cx="8" cy="5.5" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2.75 14c.6-2.7 2.7-4.25 5.25-4.25s4.65 1.55 5.25 4.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

export function BandBadge({ band, score }: { band: Band; score?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium tabular-nums">
      <BandShape band={band} />
      {score !== undefined && <span>{score}</span>}
      <span className="text-muted">{BAND_STYLE[band].label}</span>
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="text-sm text-muted">Loading {what}…</p>;
}

export function EmptyState({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-sm text-muted">
          No calls yet. They appear here once Callyzer and tl;dv are connected, or after loading sample data with{" "}
          <code className="font-mono">npm run db:sample</code>.
        </p>
      </Card>
    </>
  );
}

export function Quote({ evidence }: { evidence: Evidence }) {
  return (
    <span className="text-sm">
      <span className="mr-1.5 font-mono text-xs text-muted tabular-nums">{evidence.at}</span>
      <span className="text-muted">{evidence.speaker === "agent" ? "DNY:" : "Client:"}</span>{" "}
      <q className="italic">{evidence.quote}</q>
    </span>
  );
}

/**
 * Seven daily averages, oldest first; the last point is today. One series, so no legend:
 * history in the muted hue, today in ink. Fixed 40-100 scale so rows compare.
 */
/** Daily averages as a small line; `labels` names each point (default: days before today). */
export function TrendSparkline({ values, labels, band }: { values: (number | null)[]; labels?: string[]; band?: Band | null }) {
  const w = 104;
  const h = 28;
  const pad = 4;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => h - pad - ((Math.min(100, Math.max(40, v)) - 40) / 60) * (h - 2 * pad);
  const points = values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  const today = values.length - 1;
  const dayLabel = (i: number) => labels?.[i] ?? (i === today ? "Today" : `${today - i} day${today - i === 1 ? "" : "s"} before`);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Trend: ${points.map((p) => p.v).join(", ")}`}>
      {/* Where Amber begins (60) */}
      <line x1={pad} x2={w - pad} y1={y(60)} y2={y(60)} className="stroke-border" strokeWidth="1" strokeDasharray="2 3" />
      <polyline
        points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
        fill="none"
        className="stroke-chart-muted"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p) => (
        <g key={p.i}>
          {/* Hit target larger than the mark */}
          <circle cx={x(p.i)} cy={y(p.v)} r="7" fill="transparent">
            <title>{`${dayLabel(p.i)}: ${p.v}`}</title>
          </circle>
          {/* The latest point, so even a single day shows. */}
          {p.i === points[points.length - 1].i && <circle cx={x(p.i)} cy={y(p.v)} r="3.5" className={`${band ? BAND_STYLE[band].fill : "fill-foreground"} stroke-surface`} strokeWidth="2" />}
        </g>
      ))}
    </svg>
  );
}

/**
 * Hot, warm or cold without status colours (those mean good and bad elsewhere): a filled pill for
 * hot, an outlined one for warm, plain text for cold.
 */
export function QualityPill({ quality }: { quality: "hot" | "warm" | "cold" }) {
  if (quality === "cold") return <span className="text-xs text-muted">Cold</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${quality === "hot" ? "bg-foreground text-background" : "border border-border text-foreground"}`}
    >
      {quality === "hot" ? "Hot" : "Warm"}
    </span>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** "Download for Excel": a spreadsheet of what the page shows (CSV, which Excel opens). */
/** Opens WhatsApp with `text` ready to edit and send to `phone`; nothing when the number can't be messaged. */
export function WhatsAppButton({ phone, text, label = "WhatsApp" }: { phone: string | null | undefined; text: string; label?: string }) {
  const href = whatsappLink(phone, text);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open WhatsApp with a ready message (you can edit it before sending)"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M8 2.25a5.75 5.75 0 0 0-4.98 8.62l-.77 2.88 2.95-.76A5.75 5.75 0 1 0 8 2.25Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M5.75 7h4.5M5.75 9.25h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {label}
    </a>
  );
}

export function DownloadButton({ href, label = "Download for Excel" }: { href: string; label?: string }) {
  return (
    <a href={href} download className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path d="M8 2v8m0 0-3-3m3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </a>
  );
}
