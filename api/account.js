// Handles: recover (POST) and reset-password (POST)
import { hashPassword, supabase } from "./_auth-helpers.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body;

  // ── Recover account ───────────────────────────────────────────────────────
  if (action === "recover") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const { data } = await supabase("GET", `/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*`);
    const user = data?.[0];
    if (!user) return res.status(404).json({ error: "No account found with that email address." });

    const tempPw = "temp-" + require("crypto").randomBytes(6).toString("base64url").slice(0, 8);
    const passwordHash = await hashPassword(tempPw);
    await supabase("PATCH", `/users?id=eq.${user.id}`, { password_hash: passwordHash });

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Steady Parent Coach <onboarding@resend.dev>",
          to: [email.toLowerCase()],
          subject: "Steady Parent Coach — Account Recovery",
          text: `Hi ${user.name},\n\nHere are your account credentials:\n\nUsername: ${user.username}\nTemporary Password: ${tempPw}\n\nPlease sign in and update your password.\n\n— Steady Parent Coach`,
        }),
      });
    } catch {}

    return res.status(200).json({ success: true });
  }

  // ── Reset password ────────────────────────────────────────────────────────
  if (action === "reset") {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Invalid request." });
    }
    const passwordHash = await hashPassword(newPassword);
    const { ok } = await supabase("PATCH", `/users?id=eq.${userId}`, { password_hash: passwordHash });
    if (!ok) return res.status(500).json({ error: "Failed to reset password." });
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}
