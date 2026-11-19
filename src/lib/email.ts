import { headers } from "next/headers";

/** Email is switched on by setting RESEND_API_KEY and EMAIL_FROM in Vercel. Until then nothing is sent. */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** Self sign-up needs email (to confirm addresses) and an explicit SIGNUPS_OPEN=true. */
export function signupsOpen(): boolean {
  return process.env.SIGNUPS_OPEN === "true" && emailConfigured();
}

/** The public address of the site, for links inside emails. */
export async function appUrl(): Promise<string> {
  const fixed = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (fixed) return fixed;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** A simple, friendly email with one big button. */
export function emailLayout(opts: { heading: string; body: string; buttonText?: string; buttonUrl?: string; footer?: string }) {
  const button =
    opts.buttonText && opts.buttonUrl
      ? `<p style="margin:24px 0"><a href="${esc(opts.buttonUrl)}" style="background:#d9638b;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:14px;display:inline-block">${esc(opts.buttonText)}</a></p>
         <p style="color:#7a6d72;font-size:13px">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(opts.buttonUrl)}</span></p>`
      : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2b2326">
    <p style="font-size:20px;font-weight:800;margin:0 0 16px">💎 Hidden Gems</p>
    <h1 style="font-size:22px;margin:0 0 12px">${esc(opts.heading)}</h1>
    <p style="font-size:16px;line-height:1.5;margin:0">${esc(opts.body)}</p>${button}
    ${opts.footer ? `<p style="color:#7a6d72;font-size:13px;margin-top:24px">${esc(opts.footer)}</p>` : ""}
  </div>`;
  const text = [opts.heading, "", opts.body, opts.buttonUrl ? `\n${opts.buttonText}: ${opts.buttonUrl}` : "", opts.footer ? `\n${opts.footer}` : ""].join("\n");
  return { html, text };
}

/** Sends one email through Resend. Returns false if it couldn't be sent. */
export async function sendEmail(to: string, subject: string, content: { html: string; text: string }): Promise<boolean> {
  if (process.env.EMAIL_DEBUG_LOG === "1" && process.env.VERCEL_ENV !== "production") {
    console.log(`[email-debug] to=${to} subject=${subject}\n${content.text}`); // local testing only, never in production
    return true;
  }
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html: content.html, text: content.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("Email send failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("Email send error", e);
    return false;
  }
}
