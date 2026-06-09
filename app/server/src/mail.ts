// Pluggable mailer. In dev (or when SMTP is unconfigured) it logs the message
// to the console so flows are testable without a mail server. If SMTP_* env
// vars are set, it sends via nodemailer (lazy-imported so the dep is optional).

import { env } from "./env.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transportPromise: Promise<any> | null = null;

async function getTransport(): Promise<any | null> {
  if (!env.smtp.host) return null;
  if (!transportPromise) {
    transportPromise = import("nodemailer")
      .then((nm) =>
        nm.createTransport({
          host: env.smtp.host,
          port: env.smtp.port,
          secure: env.smtp.port === 465,
          auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
        })
      )
      .catch(() => null);
  }
  return transportPromise;
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = await getTransport();
  if (!transport) {
    // Console transport — visible in server logs for local testing.
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:console] To: ${mail.to}\n[mail:console] Subject: ${mail.subject}\n${mail.text}\n`
    );
    return;
  }
  await transport.sendMail({
    from: env.smtp.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

export function verificationEmail(link: string): Pick<Mail, "subject" | "text" | "html"> {
  return {
    subject: "Verify your ARS Studio email",
    text: `Welcome to ARS Studio! Confirm your email:\n\n${link}\n\nIf you didn't sign up, ignore this.`,
    html: `<p>Welcome to ARS Studio!</p><p><a href="${link}">Confirm your email</a></p>`,
  };
}

export function resetEmail(link: string): Pick<Mail, "subject" | "text" | "html"> {
  return {
    subject: "Reset your ARS Studio password",
    text: `Reset your password:\n\n${link}\n\nThis link expires in 1 hour. If you didn't ask, ignore this.`,
    html: `<p>Reset your password:</p><p><a href="${link}">Choose a new password</a></p><p>Expires in 1 hour.</p>`,
  };
}
