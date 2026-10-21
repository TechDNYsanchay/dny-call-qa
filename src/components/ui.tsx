import type { ReactNode } from "react";
import type { Band } from "@/lib/scoring/compute";
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

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
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
export function TrendSparkline({ values }: { values: (number | null)[] }) {
  const w = 104;
  const h = 28;
  const pad = 4;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => h - pad - ((Math.min(100, Math.max(40, v)) - 40) / 60) * (h - 2 * pad);
  const points = values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  const today = values.length - 1;
  const dayLabel = (i: number) => (i === today ? "Today" : `${today - i} day${today - i === 1 ? "" : "s"} before`);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`7-day trend: ${points.map((p) => p.v).join(", ")}`}>
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
          {p.i === today && <circle cx={x(p.i)} cy={y(p.v)} r="3.5" className="fill-foreground stroke-surface" strokeWidth="2" />}
        </g>
      ))}
    </svg>
  );
}
