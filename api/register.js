import { randomBytes } from "crypto";
import { hashPassword, supabase } from "./_auth-helpers.js";
import { sendEmail, NATE_EMAIL } from "./_email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, username, password } = req.body;

  // Check username taken
  const { data: existing } = await supabase("GET", `/users?username=eq.${encodeURIComponent(username)}&select=id`);
  if (existing?.length > 0) return res.status(409).json({ error: "Username already taken." });

  // Check email taken
  const { data: existingEmail } = await supabase("GET", `/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`);
  if (existingEmail?.length > 0) return res.status(409).json({ error: "An account with that email already exists." });

  const id = "u_" + Date.now().toString(36);
  const passwordHash = await hashPassword(password);
  const sessionToken = randomBytes(32).toString("hex");

  const { ok, data } = await supabase("POST", "/users", {
    id,
    name: name.trim(),
    username,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    session_token: sessionToken,
    created_at: new Date().toISOString(),
    consent_signed: false,
  });

  if (!ok) return res.status(500).json({ error: "Failed to create account." });

  const user = data[0];

  try {
    await sendEmail({
      to: NATE_EMAIL,
      subject: `New Steady Parent Coach signup — ${user.name}`,
      text: `New account created (consent not yet signed):\n\nName: ${user.name}\nUsername: ${user.username}\nEmail: ${user.email}\nUser ID: ${user.id}\nRegistered: ${new Date().toLocaleString()}`,
    });
  } catch (err) {
    console.error("register email failed:", err.message);
  }

  return res.status(200).json({
    user: { id: user.id, name: user.name, username: user.username, email: user.email, sessionToken, role: "client" },
  });
}
