// Server-side email via Resend REST API (no npm dep)

const FROM = process.env.EMAIL_FROM || "Steady Parent Coach <noreply@steadyparentingcoach.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "nate.parish@gmail.com";
const NATE_EMAIL = "nate.parish@gmail.com";

async function sendEmail({ to, subject, text, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const body = {
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    reply_to: replyTo || REPLY_TO,
  };
  if (text) body.text = text;
  if (html) body.html = html;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Resend ${r.status}: ${err}`);
  }
  return r.json();
}

export { sendEmail, NATE_EMAIL };
