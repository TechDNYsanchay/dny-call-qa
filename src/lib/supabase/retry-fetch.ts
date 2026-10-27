// Supabase now and then answers with a 5xx or drops the connection for a few seconds. Reads are
// safe to repeat, so they are tried again a few times before a page gives up; writes never are.

export const RETRY_DELAYS_MS = [250, 750, 2000];

const isRead = (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  return method === "GET" || method === "HEAD";
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch for the Supabase clients: reads that fail with a server error or a dropped connection are retried. */
export function retryingFetch(input: RequestInfo | URL, init?: RequestInit, delays: number[] = RETRY_DELAYS_MS): Promise<Response> {
  if (!isRead(input, init)) return fetch(input, init);
  return (async () => {
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= delays.length;
      try {
        const response = await fetch(input, init);
        if (last || response.status < 500) return response;
        await response.body?.cancel();
      } catch (error) {
        if (last || init?.signal?.aborted) throw error;
      }
      await wait(delays[attempt]!);
    }
  })();
}
