// Manage who can sign in. Only people on this list get sign-in links.
//
//   npm run people -- list
//   npm run people -- add --email name@dnyhospitality.com --name "Full Name" --role founder
//   npm run people -- add --email exec@dnyhospitality.com --name "Exec Name" --role executive --callyzer-phone +919800000000
//   npm run people -- add --name "Exec Name" --role executive --callyzer-phone +919800000000   (tracked by phone; add --email later)
//   npm run people -- deactivate --email exec@dnyhospitality.com   (or --callyzer-phone +91...)
//   npm run people -- test-link --email aisha@sample.invalid      (sample accounts only)
//
// Roles: founder, manager, admin (see everything) · executive, consultant (see their own calls).

import { parseArgs } from "node:util";
import { db, ensureLogin, must, SAMPLE_EMAIL_DOMAIN } from "./lib.mjs";

const ROLES = ["founder", "manager", "admin", "executive", "consultant"] as const;
type Role = (typeof ROLES)[number];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    "callyzer-phone": { type: "string" },
    "tldv-email": { type: "string" },
  },
});
const command = positionals[0];
const email = values.email?.trim().toLowerCase();

function need<T>(value: T | undefined, flag: string): T {
  if (value === undefined || value === "") throw new Error(`--${flag} is required`);
  return value;
}

/** "+91-93225 40272" -> "+919322540272", the format the Callyzer sync stores. */
function toPhone(value: string | undefined): string | null {
  if (!value) return null;
  const phone = value.replace(/[\s-]/g, "");
  if (!/^\+\d{10,15}$/.test(phone)) throw new Error(`--callyzer-phone must look like +919800000000 (got "${value}")`);
  return phone;
}
const phone = toPhone(values["callyzer-phone"]);

if (command === "list") {
  const people = must(
    await db.from("people").select("full_name, email, role, active, auth_user_id, callyzer_phone").order("role").order("full_name"),
    "list",
  );
  for (const p of people) {
    const login = p.auth_user_id ? "can sign in" : "no login";
    console.log(`${p.active ? " " : "x"} ${p.role.padEnd(10)} ${p.full_name.padEnd(22)} ${(p.email ?? "(no email)").padEnd(34)} ${(p.callyzer_phone ?? "").padEnd(14)} ${login}`);
  }
  console.log(`\n${people.length} people (x = deactivated)`);
} else if (command === "add") {
  const role = need(values.role, "role") as Role;
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  if (!email && !phone) throw new Error("--email or --callyzer-phone is required");

  // Adding someone again updates them; they're found by email or by Callyzer phone.
  const matches = new Set<string>();
  if (email) for (const p of must(await db.from("people").select("id").eq("email", email), "find person")) matches.add(p.id);
  if (phone) for (const p of must(await db.from("people").select("id").eq("callyzer_phone", phone), "find person")) matches.add(p.id);
  if (matches.size > 1) throw new Error(`${email} and ${phone} belong to two different people; fix one of them first`);

  const fields = {
    full_name: need(values.name, "name"),
    role,
    active: true,
    ...(email && { email, auth_user_id: await ensureLogin(email) }),
    ...(phone && { callyzer_phone: phone }),
    ...(values["tldv-email"] && { tldv_email: values["tldv-email"].toLowerCase() }),
  };
  const [existingId] = matches;
  const person = existingId
    ? must<{ id: string }>(await db.from("people").update(fields).eq("id", existingId).select("id").single(), "update person")
    : must<{ id: string }>(await db.from("people").insert(fields).select("id").single(), "add person");

  // Calls the sync stored before this person was on the list.
  const linked = phone
    ? must(await db.from("calls").update({ person_id: person.id }).eq("agent_phone", phone).is("person_id", null).select("id"), "link calls")
    : [];
  console.log(
    `${existingId ? "Updated" : "Added"} ${fields.full_name} as ${role}` +
      (linked.length ? `, linked ${linked.length} earlier call(s)` : "") +
      (email ? ". They can now request a sign-in link on the login page." : ". Tracked by phone only: add --email later so they can sign in and get reports."),
  );
} else if (command === "deactivate") {
  if (!email && !phone) throw new Error("--email or --callyzer-phone is required");
  const who = email ?? phone!;
  const query = db.from("people").update({ active: false });
  const rows = must(await (email ? query.eq("email", email) : query.eq("callyzer_phone", phone!)).select("id"), "deactivate");
  console.log(rows.length ? `Deactivated ${who}: they lose access straight away.` : `No one with ${who}.`);
} else if (command === "test-link") {
  const address = need(email, "email");
  // A sign-in link is a credential, so this only works for the invented sample accounts.
  if (!address.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)) throw new Error(`test-link only works for @${SAMPLE_EMAIL_DOMAIN} sample accounts`);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: address });
  if (error) throw new Error(`generate link: ${error.message}`);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  console.log(`${site}/auth/callback?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}`);
} else {
  console.log("Usage: npm run people -- list | add | deactivate | test-link  (see scripts/people.mts)");
  process.exitCode = 1;
}
