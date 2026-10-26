// The roll-up's lead funnel: calls, then each client once at the furthest stage reached.
// One bar per stage, as a share of the leads reached; every number is printed beside its bar.

import { FUNNEL_STAGES, pctOf, type Funnel } from "@/lib/rollups";

export function FunnelChart({ funnel: f }: { funnel: Funnel }) {
  if (f.calls === 0) return <p className="text-sm text-muted">No calls in this period.</p>;
  return (
    <div className="text-sm">
      <p className="mb-4">
        <span className="tabular-nums font-medium">{f.calls}</span> calls logged → <span className="tabular-nums font-medium">{f.connected}</span> connected →{" "}
        <span className="tabular-nums font-medium">{f.leads}</span> {f.leads === 1 ? "lead" : "leads"} reached
      </p>
      {f.leads > 0 && (
        <ol className="space-y-0.5">
          {FUNNEL_STAGES.map((stage, i) => {
            const n = f[stage.key];
            const previous = i === 0 ? f.leads : f[FUNNEL_STAGES[i - 1].key];
            return (
              <li
                key={stage.key}
                tabIndex={0}
                className="group relative grid grid-cols-[6.5rem_minmax(0,1fr)_4.25rem] items-center gap-2 rounded-md sm:grid-cols-[9.5rem_minmax(0,1fr)_5.5rem] sm:gap-3 px-1 py-1.5 outline-none hover:bg-background focus-visible:bg-background"
              >
                <span>{stage.label}</span>
                <span className="h-3.5" aria-hidden>
                  {n > 0 && (
                    <span
                      className="block h-full min-w-1 rounded-r"
                      style={{ width: `${pctOf(n, f.leads)}%`, background: `var(--funnel-${i + 1})` }}
                    />
                  )}
                </span>
                <span className="text-right tabular-nums">
                  {n} <span className="text-muted">· {pctOf(n, f.leads)}%</span>
                </span>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/3 z-10 mb-1 hidden w-max max-w-64 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm group-hover:block group-focus-visible:block"
                >
                  <span className="block font-medium">
                    {stage.label}: {n} {n === 1 ? "lead" : "leads"}
                  </span>
                  <span className="block text-muted">
                    {pctOf(n, f.leads)}% of the {f.leads} reached
                    {i > 0 ? ` · ${pctOf(n, previous)}% of ${FUNNEL_STAGES[i - 1].label.toLowerCase()}` : ""}
                  </span>
                  <span className="block text-muted">{stage.means}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        {f.lost > 0 ? `${f.lost} ${f.lost === 1 ? "lead" : "leads"} marked lost. ` : ""}
        Each client counts once, at the furthest stage reached. Status is today&apos;s, set on each lead&apos;s page.
      </p>
    </div>
  );
}
