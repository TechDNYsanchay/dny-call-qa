"use client";

import { ErrorNotice } from "@/components/error-notice";

/** A page that failed to load, shown under the normal header. */
export default function PageError({ error }: { error: unknown; retry: () => void }) {
  return <ErrorNotice error={error} />;
}
