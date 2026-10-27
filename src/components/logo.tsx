import { D_PATH, G_BOWL, LOGO_RED, LOGO_VIEWBOX, NY_PATHS, SMALL_SIZE_EXTRA_WEIGHT, WORD_PATHS } from "@/lib/brand";

/**
 * The DNY Sales Agent logo. The red "d" stays red; "ny" and SALES AGENT follow the theme (brown on
 * light, cream on dark). `small` (header and menus) gives SALES AGENT a little weight so it stays crisp.
 */
export function Logo({ small = false, className = "" }: { small?: boolean; className?: string }) {
  const extra = small ? SMALL_SIZE_EXTRA_WEIGHT : 0;
  return (
    <svg viewBox={LOGO_VIEWBOX} role="img" aria-label="DNY Sales Agent" className={`shrink-0 ${className}`}>
      <path d={D_PATH} fill={LOGO_RED} />
      <g className="fill-logo-ink">
        {NY_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={extra ? "fill-logo-ink stroke-logo-ink" : "fill-logo-ink"} strokeWidth={extra || undefined} strokeLinejoin="round">
        {WORD_PATHS.map((w, i) => (
          <path key={i} d={w.d} transform={w.dx ? `translate(${w.dx} 0)` : undefined} />
        ))}
      </g>
      <path d={G_BOWL.d} fill="none" className="stroke-logo-ink" strokeWidth={G_BOWL.width + extra} />
    </svg>
  );
}
