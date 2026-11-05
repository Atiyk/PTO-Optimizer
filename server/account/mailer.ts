import { createTransport } from 'nodemailer';
import type { AccountConfig } from './config';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /** Adds RFC 8058 one-click unsubscribe headers (reminder emails). */
  unsubscribeUrl?: string;
}

export type SendMail = (mail: OutgoingMail) => Promise<void>;

/**
 * Sends through Gmail SMTP with an app password (free; personal accounts allow about 500
 * recipients a day). Mail goes out from the Gmail address itself, so Google signs it with
 * gmail.com's DKIM and no domain of our own is needed.
 */
export function gmailSender(config: AccountConfig): SendMail {
  if (!config.gmailUser || !config.gmailAppPassword) throw new Error('Gmail is not configured.');
  const user = config.gmailUser;
  const pass = config.gmailAppPassword;
  let transport: ReturnType<typeof createTransport> | null = null;
  return async (mail) => {
    transport ??= createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
    await transport.sendMail({
      from: { name: config.fromName, address: user },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.unsubscribeUrl ? {
        list: { unsubscribe: { url: mail.unsubscribeUrl, comment: 'Stop reminder emails' } },
        headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      } : {}),
    });
  };
}
