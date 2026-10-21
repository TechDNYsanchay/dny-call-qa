import { describe, expect, it } from "vitest";
import { presentedCronSecret, readWebhook, secretMatches } from "./webhooks";

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("webhook and cron secrets", () => {
  it("fails closed when no secret is configured", () => {
    expect(secretMatches("anything", undefined)).toBe(false);
    expect(secretMatches(null, "s3cret")).toBe(false);
  });

  it("matches only the exact secret", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3cre", "s3cret")).toBe(false);
  });

  it("reads the cron bearer token", () => {
    const req = new Request("https://x.test/api/cron/sweep", { headers: { authorization: "Bearer abc" } });
    expect(presentedCronSecret(req)).toBe("abc");
  });

  it("rejects, accepts and parses webhook calls", async () => {
    const notConfigured = await readWebhook(post("https://x.test/h", "{}"), undefined);
    expect("error" in notConfigured && notConfigured.error.status).toBe(503);

    const wrong = await readWebhook(post("https://x.test/h", "{}", { "x-webhook-secret": "nope" }), "s3cret");
    expect("error" in wrong && wrong.error.status).toBe(401);

    const badJson = await readWebhook(post("https://x.test/h?secret=s3cret", "not json"), "s3cret");
    expect("error" in badJson && badJson.error.status).toBe(400);

    const ok = await readWebhook(post("https://x.test/h?secret=s3cret", '{"callId":"cz-1"}'), "s3cret");
    expect(ok).toEqual({ payload: { callId: "cz-1" } });
  });
});
