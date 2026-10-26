// Sends the report emails through Gmail (Google Workspace) from SMTP_USER, with a Google app
// password in SMTP_PASSWORD. REPORTS_TO, when set, receives every email instead of the real
// recipients, for testing.

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { Email } from "./report-emails";

export class MailNotConfigured extends Error {}

let transport: Transporter | null = null;

function mailer(): Transporter {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new MailNotConfigured("SMTP_USER and SMTP_PASSWORD aren't set");
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: { user, pass },
  });
  return transport;
}

/** Who actually receives a message meant for `intended`: REPORTS_TO while testing. */
export function recipientFor(intended: string | null): string | null {
  return process.env.REPORTS_TO || intended;
}

export async function sendEmail(to: string, email: Email): Promise<void> {
  await mailer().sendMail({
    from: { name: "DNY Sales Agent", address: process.env.SMTP_USER! },
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
