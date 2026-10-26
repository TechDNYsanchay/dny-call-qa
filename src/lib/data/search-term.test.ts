import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ supabaseUser: vi.fn(), supabaseAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("search terms", () => {
  it("strips characters that are filter syntax or wildcards", async () => {
    const { searchTerm } = await import("./index");
    expect(searchTerm("Mohit, (Noida)*")).toBe("Mohit Noida");
    expect(searchTerm("a%b_c.d:e")).toBe("a b c d e");
    expect(searchTerm("  +91 94136  ")).toBe("+91 94136");
    expect(searchTerm("x".repeat(100))).toHaveLength(60);
  });
});
