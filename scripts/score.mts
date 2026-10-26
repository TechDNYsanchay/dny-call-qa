// Scoring by hand, the same steps the nightly routine takes through the scoring API
// (src/lib/scoring/pipeline.ts does the checks and the maths for both).
//
//   npm run score -- next [--call <id>]          print the next first call ready for scoring (or that call)
//   npm run score -- skip <callId>                not a sales call (vendor, telecom, applicant, personal): never scored
//   npm run score -- save <callId> <result.json> [--dry-run]
//                                                 check the result, save score, metrics and lead fields
//                                                 (--dry-run: check and print the score, save nothing)
//
// The result must match CallResultSchema (src/lib/scoring/schema.ts); see scoring/first-call-guide.md.

import { readFileSync } from "node:fs";
import { checkAndSave, nextReadyCallId, scoringPackage, skipCall, type Db } from "../src/lib/scoring/pipeline";
import { db } from "./lib.mjs";

const [command, ...args] = process.argv.slice(2);
const store = db as unknown as Db;

if (command === "next") {
  const flag = args.indexOf("--call");
  const callId = flag >= 0 ? args[flag + 1] : await nextReadyCallId(store);
  if (!callId) {
    console.log("No calls are ready for scoring.");
    process.exit(0);
  }
  console.log(JSON.stringify(await scoringPackage(store, callId), null, 2));
} else if (command === "skip") {
  const [callId] = args;
  if (!callId) throw new Error("Usage: npm run score -- skip <callId>");
  console.log((await skipCall(store, callId)) ? "Marked as not a sales call; it won't be scored." : `No unscored call ${callId}`);
} else if (command === "save") {
  const [callId, file] = args.filter((a) => !a.startsWith("--"));
  if (!callId || !file) throw new Error("Usage: npm run score -- save <callId> <result.json> [--dry-run]");
  const dryRun = args.includes("--dry-run");
  const outcome = await checkAndSave(store, callId, JSON.parse(readFileSync(file, "utf8")), { dryRun });
  if (!outcome.ok) {
    console.error("The result didn't pass the checks:");
    for (const e of outcome.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`${outcome.saved ? "Saved" : "Checks passed (nothing saved)"}: ${outcome.summary}`);
} else {
  console.log("Usage: npm run score -- next [--call <id>] | skip <callId> | save <callId> <result.json> [--dry-run]  (see scripts/score.mts)");
  process.exitCode = 1;
}
