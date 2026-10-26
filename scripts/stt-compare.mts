// Runs the same real calls through every speech-to-text service that has a key in .env.local
// and writes stt-compare/index.html: each call's recording with the services' transcripts side
// by side, so DNY can judge names, numbers and who-said-what by ear. Saves nothing to the database.
//
//   npm run stt:compare               the 6 most recent recordings
//   npm run stt:compare -- --calls 20
//
// stt-compare/ holds real client conversations: it is git-ignored and never deployed.

import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { availableTranscribers } from "../src/lib/transcription/index";
import type { SpeakerTurn } from "../src/lib/transcription/turns";
import { db, must } from "./lib.mjs";

const { values } = parseArgs({ options: { calls: { type: "string", default: "6" } } });
const limit = Math.max(1, Math.min(50, Number(values.calls) || 6));

const transcribers = availableTranscribers(process.env);
if (transcribers.length === 0) {
  console.log("No speech-to-text keys in .env.local yet (DEEPGRAM_API_KEY, SARVAM_API_KEY, ELEVENLABS_API_KEY).");
  process.exit(1);
}

const calls = must(
  await db
    .from("calls")
    .select("id, started_at, duration_sec, call_direction, recording_path")
    .eq("recording_status", "available")
    .not("recording_path", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit),
  "calls",
);
console.log(`${calls.length} recordings × ${transcribers.map((t) => t.id).join(", ")}`);

interface Attempt {
  provider: string;
  seconds: number;
  turns?: SpeakerTurn[];
  error?: string;
}
const results: { call: (typeof calls)[number]; audioUrl: string; attempts: Attempt[] }[] = [];

for (const call of calls) {
  // 12 hours: long enough to listen through the page today.
  const { data: link, error } = await db.storage.from("recordings").createSignedUrl(call.recording_path!, 12 * 60 * 60);
  if (error) throw new Error(`recording link: ${error.message}`);
  const attempts = await Promise.all(
    transcribers.map(async (t): Promise<Attempt> => {
      const started = performance.now();
      try {
        const turns = await t.transcribe({ url: link.signedUrl });
        return { provider: t.id, seconds: (performance.now() - started) / 1000, turns };
      } catch (e) {
        return { provider: t.id, seconds: (performance.now() - started) / 1000, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  for (const a of attempts) {
    console.log(`  ${call.id.slice(0, 8)} ${String(call.duration_sec).padStart(4)}s  ${a.provider.padEnd(24)} ${a.error ? `FAILED ${a.error}` : `${a.turns!.length} turns, ${new Set(a.turns!.map((t) => t.speaker)).size} speakers, ${a.seconds.toFixed(1)}s`}`);
  }
  results.push({ call, audioUrl: link.signedUrl, attempts });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

function column(a: Attempt, callIndex: number): string {
  const head = `<h3>${esc(a.provider)} <small>${a.seconds.toFixed(1)} s</small></h3>`;
  if (a.error) return `<div class="col">${head}<p class="err">Failed: ${esc(a.error)}</p></div>`;
  const order = [...new Set(a.turns!.map((t) => t.speaker))];
  const lines = a
    .turns!.map(
      (t) =>
        `<li><button onclick="play(${callIndex},${t.startSec})">${clock(t.startSec)}</button><b class="s${order.indexOf(t.speaker) % 4}">S${order.indexOf(t.speaker) + 1}</b> ${esc(t.text)}</li>`,
    )
    .join("");
  return `<div class="col">${head}<p class="meta">${order.length} speakers · ${a.turns!.length} turns</p><ol>${lines}</ol></div>`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Speech-to-text comparison</title><style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#e3e3df}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ececea;--muted:#9a9a94;--card:#1f1f1d;--line:#33332f}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}h3{font-size:13px;margin:0 0 4px}small,.meta{color:var(--muted);font-weight:400}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
audio{width:100%;margin-bottom:12px}.cols{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
ol{list-style:none;margin:0;padding:0;max-height:32rem;overflow-y:auto}li{padding:2px 0}
button{font:12px ui-monospace,monospace;color:var(--muted);background:none;border:0;padding:0 6px 0 0;cursor:pointer}
b{font-size:11px;margin-right:4px}.s0{color:#2563eb}.s1{color:#c2410c}.s2{color:#15803d}.s3{color:#9333ea}.err{color:#b91c1c}
</style></head><body>
<h1>Speech-to-text comparison</h1>
<p class="meta">${results.length} real DNY calls · speakers are numbered by each service · links to the recordings expire in 12 hours.
Check: names, cities and numbers (budget, rent, area), Hindi and English words, and whether S1/S2 switch at the right moments.</p>
${results
  .map(
    (r, i) => `<section><h2>${ist(r.call.started_at)} · ${clock(r.call.duration_sec)} · ${esc(r.call.call_direction ?? "")}</h2>
<audio id="a${i}" controls preload="none" src="${esc(r.audioUrl)}"></audio>
<div class="cols">${r.attempts.map((a) => column(a, i)).join("")}</div></section>`,
  )
  .join("")}
<script>function play(i,t){const a=document.getElementById("a"+i);a.currentTime=t;a.play()}</script>
</body></html>`;

mkdirSync("stt-compare", { recursive: true });
writeFileSync("stt-compare/index.html", html);
writeFileSync("stt-compare/results.json", JSON.stringify(results.map((r) => ({ callId: r.call.id, attempts: r.attempts })), null, 2));
console.log("Wrote stt-compare/index.html");
