"use server";

// A founder's, manager's or admin's review of the AI's score (the brief's calibration): agree, or
// correct the areas and hard fails with a note. The score is recomputed by the same code the
// nightly scoring uses, and the AI's original is kept for measuring agreement.

import { getCurrentPerson } from "@/lib/data";
import { disputeEmail } from "@/lib/email/report-emails";
import { MailNotConfigured, sendEmail } from "@/lib/email/send";
import { formatClock, formatDay, formatPhone, toIst } from "@/lib/format";
import { finaliseScore, type Band, type Level } from "@/lib/scoring/compute";
import type { CallMetrics } from "@/lib/scoring/metrics";
import { areasFor, hardFailsFor } from "@/lib/scoring/scorecards";
import { reportsTestInbox } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface ReviewState {
  error?: string;
  done?: "agree" | "corrected";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reviewCall(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can review scores." };

  const callId = String(form.get("callId") ?? "");
  const verdict = form.get("verdict");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!UUID.test(callId) || (verdict !== "agree" && verdict !== "corrected")) return { error: "Something was missing; refresh and try again." };

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("call_scores")
    .select("score, band, levels, hard_fails, ai_score, ai_band, ai_levels, ai_hard_fails, dispute_comment, dispute_resolved_at, calls ( stream, duration_sec, call_metrics ( client_share ) )")
    .eq("call_id", callId)
    .maybeSingle();
  if (error) return { error: `Couldn't load the score: ${error.message}` };
  if (!row) return { error: "This call hasn't been scored." };

  // The AI's numbers, kept from the first review on.
  const ai = {
    ai_score: row.ai_score ?? row.score,
    ai_band: row.ai_band ?? row.band,
    ai_levels: row.ai_levels ?? row.levels,
    ai_hard_fails: row.ai_hard_fails ?? row.hard_fails,
  };
  const now = new Date().toISOString();
  // Reviewing a disputed score answers the dispute.
  const resolves = row.dispute_comment && !row.dispute_resolved_at ? { dispute_resolved_at: now } : {};
  const review = { overridden_by: me.id, override_reason: note || null, review_verdict: verdict, reviewed_at: now, ...ai, ...resolves };

  if (verdict === "agree") {
    const { error: saveError } = await db
      .from("call_scores")
      .update({ ...review, score: ai.ai_score, band: ai.ai_band, levels: ai.ai_levels, hard_fails: ai.ai_hard_fails })
      .eq("call_id", callId);
    return saveError ? { error: `Couldn't save: ${saveError.message}` } : { done: "agree" };
  }

  if (note.length < 5) return { error: "Add a short note saying why you changed the score." };
  const call = row.calls as unknown as { stream: "first_call" | "vision_call"; duration_sec: number; call_metrics: { client_share: number } | null };
  const levels: Record<string, Level> = {};
  for (const area of areasFor(call.stream)) {
    const level = Number(form.get(`level:${area.id}`));
    if (level !== 0 && level !== 5 && level !== 10) return { error: `Choose 0, 5 or 10 for ${area.name}.` };
    levels[area.id] = level;
  }
  // Only the hard fails a person judges; measured ones (like VC client talk) stay with the code.
  const judged = hardFailsFor(call.stream).filter((h) => !h.measured).map((h) => h.id);
  const hardFails = form.getAll("hardFail").map(String).filter((id) => judged.includes(id));

  // finaliseScore's measured rules read only the length and the client's talk share.
  const metrics = { durationSec: call.duration_sec, clientShare: Number(call.call_metrics?.client_share ?? 1) } as CallMetrics;
  const final = finaliseScore(call.stream, { levels, hardFails }, metrics);
  const { error: saveError } = await db
    .from("call_scores")
    .update({ ...review, score: final.score, band: final.band, levels: final.levels, hard_fails: final.hardFails, overrides: final.overrides })
    .eq("call_id", callId);
  return saveError ? { error: `Couldn't save: ${saveError.message}` } : { done: "corrected" };
}

export interface DisputeState {
  error?: string;
  done?: string;
}

/** The executive whose call it is challenges the score; founders, managers and admins are emailed. */
export async function disputeScore(_prev: DisputeState, form: FormData): Promise<DisputeState> {
  const me = await getCurrentPerson();
  if (!me) return { error: "Sign in again to send this." };
  const callId = String(form.get("callId") ?? "");
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000);
  if (!UUID.test(callId)) return { error: "Something was missing; refresh and try again." };
  if (comment.length < 10) return { error: "Say what the score got wrong, in a sentence or two." };

  const db = supabaseAdmin();
  const { data: call, error } = await db
    .from("calls")
    .select("id, person_id, started_at, client_phone, leads ( name ), call_scores ( score, band, dispute_comment, dispute_resolved_at )")
    .eq("id", callId)
    .maybeSingle();
  if (error) return { error: `Couldn't load the call: ${error.message}` };
  const score = call?.call_scores as unknown as { score: number; band: Band; dispute_comment: string | null; dispute_resolved_at: string | null } | null;
  if (!call || call.person_id !== me.id) return { error: "You can only dispute scores on your own calls." };
  if (!score) return { error: "This call hasn't been scored." };
  if (score.dispute_comment && !score.dispute_resolved_at) return { error: "You've already disputed this score; a founder will review it." };

  const { error: saveError } = await db
    .from("call_scores")
    .update({ dispute_comment: comment, disputed_at: new Date().toISOString(), disputed_by: me.id, dispute_resolved_at: null })
    .eq("call_id", callId);
  if (saveError) return { error: `Couldn't save: ${saveError.message}` };

  // Tell the reviewers. The dispute is saved either way and shows on the Team page.
  try {
    const testInbox = await reportsTestInbox();
    const { data: reviewers } = await db.from("people").select("email").in("role", ["founder", "manager", "admin"]).eq("active", true).not("email", "is", null);
    const recipients = testInbox ? [testInbox] : [...new Set((reviewers ?? []).map((r) => r.email!))];
    const lead = call.leads as unknown as { name: string | null } | null;
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
    const email = disputeEmail({
      who: me.name,
      client: lead?.name ?? (call.client_phone ? formatPhone(call.client_phone) : "Unknown client"),
      when: `${formatDay(toIst(call.started_at))}, ${formatClock(toIst(call.started_at))}`,
      score: Number(score.score),
      band: score.band,
      comment,
      link: `${site}/calls/${callId}`,
    });
    for (const to of recipients) await sendEmail(to, email);
  } catch (e) {
    if (!(e instanceof MailNotConfigured)) console.error("dispute email", e);
  }
  return { done: "Sent. A founder will review the score; you'll see the outcome here." };
}
