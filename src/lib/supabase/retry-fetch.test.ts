import { afterEach, describe, expect, it, vi } from "vitest";
import { retryingFetch } from "./retry-fetch";

const reply = (status: number) => new Response(status === 200 ? "[]" : '{"message":"Internal server error."}', { status });
const NO_WAIT = [0, 0, 0];

afterEach(() => vi.unstubAllGlobals());

describe("retrying Supabase reads", () => {
  it("tries a read again after a server error and returns the answer that worked", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(500)).mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetch);
    const response = await retryingFetch("https://db.example/rest/v1/people", undefined, NO_WAIT);
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("tries again after a dropped connection", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetch);
    expect((await retryingFetch("https://db.example/rest/v1/people", { method: "GET" }, NO_WAIT)).status).toBe(200);
  });

  it("gives up after the last try and hands back the error", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(500));
    vi.stubGlobal("fetch", fetch);
    expect((await retryingFetch("https://db.example/rest/v1/people", undefined, NO_WAIT)).status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(4);

    const dropped = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", dropped);
    await expect(retryingFetch("https://db.example/rest/v1/people", undefined, NO_WAIT)).rejects.toThrow("fetch failed");
    expect(dropped).toHaveBeenCalledTimes(4);
  });

  it("does not repeat client errors, which another try would not fix", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(401));
    vi.stubGlobal("fetch", fetch);
    expect((await retryingFetch("https://db.example/rest/v1/people", undefined, NO_WAIT)).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never repeats a write", async () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const fetch = vi.fn().mockResolvedValue(reply(500));
      vi.stubGlobal("fetch", fetch);
      expect((await retryingFetch("https://db.example/rest/v1/leads", { method }, NO_WAIT)).status).toBe(500);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("stops when the request was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetch);
    await expect(retryingFetch("https://db.example/rest/v1/people", { signal: controller.signal }, NO_WAIT)).rejects.toThrow("aborted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
