// Pure helpers for the sign-in flow (used by the proxy and the auth routes).

/** Cookie holding where to go after sign-in, so the emailed link itself stays a fixed URL. */
export const NEXT_PATH_COOKIE = "dny_next";

/** Pages that work without a session. Webhook and cron routes check their own shared secrets. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    // The install manifest (icons are plain files the proxy never sees).
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    // The scoring routine authenticates with its own token, not a sign-in.
    pathname.startsWith("/api/scoring/")
  );
}

/** Only same-site paths, so a sign-in link can never send someone to another website. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (isPublicPath(next.split("?")[0])) return "/";
  return next;
}
