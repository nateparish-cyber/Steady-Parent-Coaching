// Account recovery: forgot-password + forgot-username flows.
// Both actions always respond success (even if the account doesn't exist)
// to avoid leaking whether an email/username is registered.
import { randomBytes } from "crypto";
import { hashPassword, supabase } from "./_auth-helpers.js";
import { sendEmail } from "./_email.js";

// Temp-password alphabet: no 0/O/o, 1/l/I — anything that's easy to mis-copy from an email.
const TEMP_PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateTempPassword(len = 10) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += TEMP_PW_ALPHABET[bytes[i] % TEMP_PW_ALPHABET.length];
  return out;
}

async function findUserByEmailOrUsername(handle) {
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  const isEmail = h.includes("@");
  const query = isEmail
    ? `/users?email=eq.${encodeURIComponent(h)}&select=*`
    : `/users?username=eq.${encodeURIComponent(h)}&select=*`;
  const { data } = await supabase("GET", query);
  return data?.[0] ?? null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body;

  // ── Forgot password: email OR username → send new temp password ─────────
  // "recover" is kept as an alias so any cached older client keeps working.
  if (action === "reset-password" || action === "recover") {
    const handle = (req.body.handle || req.body.email || req.body.username || "").trim();
    if (!handle) return res.status(400).json({ error: "Please enter your email or username." });

    const user = await findUserByEmailOrUsername(handle);
    // Always respond success — don't leak whether the account exists.
    if (!user || !user.email) return res.status(200).json({ success: true });

    const tempPw = generateTempPassword(10);
    try {
      const passwordHash = await hashPassword(tempPw);
      await supabase("PATCH", `/users?id=eq.${user.id}`, { password_hash: passwordHash });
      const firstName = (user.name || "").split(" ")[0] || "there";
      await sendEmail({
        to: user.email,
        subject: "Steady Parenting Coach — Your new password",
        text: `Hi ${firstName},\n\nHere's a temporary password so you can sign back in:\n\n  Username:     ${user.username}\n  New password: ${tempPw}\n\nSign in at https://www.steadyparentingcoach.com/app, then change your password from your profile whenever you like.\n\nIf you didn't request this, you can ignore this email — the previous password will no longer work, but nobody else has access to your account.\n\n— Steady Parenting Coach`,
      });
    } catch (err) {
      console.error("reset-password send failed:", err.message);
    }
    return res.status(200).json({ success: true });
  }

  // ── Forgot username: email → send username only, do NOT touch password ──
  if (action === "recover-username") {
    const em = (req.body.email || "").trim().toLowerCase();
    if (!em) return res.status(400).json({ error: "Please enter your email." });

    const { data } = await supabase("GET", `/users?email=eq.${encodeURIComponent(em)}&select=*`);
    const user = data?.[0];
    // Always respond success — don't leak account existence.
    if (!user) return res.status(200).json({ success: true });

    try {
      const firstName = (user.name || "").split(" ")[0] || "there";
      await sendEmail({
        to: user.email,
        subject: "Steady Parenting Coach — Your username",
        text: `Hi ${firstName},\n\nYou asked for a reminder of your Steady Parenting Coach username:\n\n  Username: ${user.username}\n\nSign in at https://www.steadyparentingcoach.com/app. If you also need a new password, choose "I forgot my password" from the sign-in screen.\n\n— Steady Parenting Coach`,
      });
    } catch (err) {
      console.error("recover-username send failed:", err.message);
    }
    return res.status(200).json({ success: true });
  }

  // ── Reset password directly (used by future in-app profile → change password flow) ──
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
