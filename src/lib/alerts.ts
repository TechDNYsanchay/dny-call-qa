// Emails tech@ (ALERTS_TO, else SMTP_USER) when the pipeline goes wrong, so a failure is noticed
// the same day. Each kind of alert (its key) is sent at most once every few hours.
// Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import { sendEmail } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_EVERY_HOURS = 6;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Sends one alert unless the same `key` was sent within `everyHours`. Never throws: an alert that
 * can't be sent is logged, so it never hides the failure it reports.
 */
export async function alert(key: string, subject: string, lines: string[], everyHours = DEFAULT_EVERY_HOURS): Promise<boolean> {
  try {
    const to = process.env.ALERTS_TO || process.env.SMTP_USER;
    if (!to) {
      console.error(`alert ${key}: no ALERTS_TO or SMTP_USER; ${subject}`);
      return false;
    }
    const db = supabaseAdmin();
    const { data: last } = await db.from("alert_log").select("last_sent_at, times").eq("key", key).maybeSingle();
    if (last && Date.now() - new Date(last.last_sent_at).getTime() < everyHours * 60 * 60 * 1000) return false;

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
    const text = [...lines, "", `App: ${site}`, `This alert repeats at most every ${everyHours} hours while the problem lasts.`].join("\n");
    const html = `<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1a">${lines
      .map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`)
      .join("")}<p style="margin:16px 0 0;color:#6b6b65;font-size:12px"><a href="${esc(site)}">${esc(site)}</a> · repeats at most every ${everyHours} hours while the problem lasts.</p></div>`;
    await sendEmail(to, { subject: `⚠ DNY Sales Agent: ${subject}`, text, html });
    await db.from("alert_log").upsert({ key, last_sent_at: new Date().toISOString(), times: (last?.times ?? 0) + 1 });
    return true;
  } catch (error) {
    console.error(`alert ${key} not sent:`, error instanceof Error ? error.message : error, `(${subject})`);
    return false;
  }
}
