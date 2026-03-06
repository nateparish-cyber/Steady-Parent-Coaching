import { hashPassword, verifyPassword, supabase } from "./_auth-helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body;

  const { data } = await supabase("GET", `/users?username=eq.${encodeURIComponent(username)}&select=*`);
  const user = data?.[0];

  if (!user) return res.status(401).json({ error: "Incorrect username or password." });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect username or password." });

  // Upgrade old weak hash to PBKDF2 transparently
  if (!user.password_hash.startsWith("pbkdf2:")) {
    const newHash = await hashPassword(password);
    await supabase("PATCH", `/users?id=eq.${user.id}`, { password_hash: newHash });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      consentSigned: user.consent_signed,
      role: "client",
    },
  });
}
