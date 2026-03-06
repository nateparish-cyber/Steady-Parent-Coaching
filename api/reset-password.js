import { hashPassword, supabase } from "./_auth-helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, newPassword } = req.body;
  if (!userId || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const passwordHash = await hashPassword(newPassword);
  const { ok } = await supabase("PATCH", `/users?id=eq.${userId}`, { password_hash: passwordHash });

  if (!ok) return res.status(500).json({ error: "Failed to reset password." });
  return res.status(200).json({ success: true });
}
