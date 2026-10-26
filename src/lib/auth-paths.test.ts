import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./auth-paths";

describe("public paths", () => {
  it("lets sign-in pages and secret-checked APIs through", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/api/webhooks/callyzer")).toBe(true);
    expect(isPublicPath("/api/cron/sweep")).toBe(true);
    expect(isPublicPath("/api/scoring/next")).toBe(true);
  });

  it("protects every screen", () => {
    for (const p of ["/", "/calls", "/calls/abc", "/people/abc", "/scorecards", "/loginx", "/api/other"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});

describe("after-login redirect", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/calls/123")).toBe("/calls/123");
    expect(safeNextPath("/people/abc?tab=x")).toBe("/people/abc?tab=x");
  });

  it("refuses other sites and loops", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
