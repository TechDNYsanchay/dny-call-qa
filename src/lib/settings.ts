// Settings founders change on the Team members page. Pipeline and server-action code only.

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

const REPORTS_TEST_INBOX = "reports_test_inbox";

/**
 * While testing, every report goes to one inbox instead of the real people. Set on the Team
 * members page; until it's set there, the REPORTS_TO environment variable decides.
 * Returns the test inbox, or null when reports go to each person.
 */
export async function reportsTestInbox(): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("app_settings").select("value").eq("key", REPORTS_TEST_INBOX).maybeSingle();
  if (error) throw new Error(`settings: ${error.message}`);
  if (!data) return process.env.REPORTS_TO || null;
  return typeof data.value === "string" && data.value ? data.value : null;
}

export async function setReportsTestInbox(inbox: string | null, by: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({ key: REPORTS_TEST_INBOX, value: inbox, updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw new Error(`settings: ${error.message}`);
}

const DAILY_EMAIL_TO = "daily_email_to";

/**
 * "One daily email": the addresses that get the single 8 am email with everything in it (usually
 * the founders). While it's set, no other report email goes out. Null when it's off.
 */
export async function dailyEmailTo(): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin().from("app_settings").select("value").eq("key", DAILY_EMAIL_TO).maybeSingle();
  if (error) throw new Error(`settings: ${error.message}`);
  const list = Array.isArray(data?.value) ? data.value.filter((x): x is string => typeof x === "string" && x.includes("@")) : [];
  return list.length ? list : null;
}

export async function setDailyEmailTo(to: string[] | null, by: string | null): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({ key: DAILY_EMAIL_TO, value: to?.length ? to : null, updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw new Error(`settings: ${error.message}`);
}
