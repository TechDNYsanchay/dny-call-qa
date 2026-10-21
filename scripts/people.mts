// Manage who can sign in. Only people on this list get sign-in links.
//
//   npm run people -- list
//   npm run people -- add --email name@dnyhospitality.com --name "Full Name" --role founder
//   npm run people -- add --email exec@dnyhospitality.com --name "Exec Name" --role executive --callyzer-phone +919800000000
//   npm run people -- deactivate --email exec@dnyhospitality.com
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

if (command === "list") {
  const people = must(await db.from("people").select("full_name, email, role, active, auth_user_id").order("role").order("full_name"), "list");
  for (const p of people) {
    console.log(`${p.active ? " " : "x"} ${p.role.padEnd(10)} ${p.full_name.padEnd(22)} ${p.email.padEnd(34)} ${p.auth_user_id ? "can sign in" : "no login"}`);
  }
  console.log(`\n${people.length} people (x = deactivated)`);
} else if (command === "add") {
  const address = need(email, "email");
  const role = need(values.role, "role") as Role;
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  const loginId = await ensureLogin(address);
  must(
    await db
      .from("people")
      .upsert(
        {
          email: address,
          full_name: need(values.name, "name"),
          role,
          auth_user_id: loginId,
          active: true,
          callyzer_phone: values["callyzer-phone"] ?? null,
          tldv_email: values["tldv-email"]?.toLowerCase() ?? null,
        },
        { onConflict: "email" },
      )
      .select("id"),
    "add person",
  );
  console.log(`Added ${address} as ${role}. They can now request a sign-in link on the login page.`);
} else if (command === "deactivate") {
  const address = need(email, "email");
  const rows = must(await db.from("people").update({ active: false }).eq("email", address).select("id"), "deactivate");
  console.log(rows.length ? `Deactivated ${address}: they lose access straight away.` : `No one with ${address}.`);
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
