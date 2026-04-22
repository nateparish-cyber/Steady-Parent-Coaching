import { hashPassword, verifyPassword, supabase } from "./_auth-helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body;

  const { data } = await supabase("GET", `/users?username=eq.${encodeURIComponent(username)}&select=*`);
  const user = data?.[0];

  if (!user) return res.status(401).json({ error: "Incorrect username or password." });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect username or password." });

  // Generate session token
  const { randomBytes } = await import("crypto");
  const sessionToken = randomBytes(32).toString("hex");

  // Upgrade old weak hash to PBKDF2 + save session token
  const patch = { session_token: sessionToken };
  if (!user.password_hash.startsWith("pbkdf2:")) patch.password_hash = await hashPassword(password);
  await supabase("PATCH", `/users?id=eq.${user.id}`, patch);

  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      consentSigned: user.consent_signed,
      sessionToken,
      role: "client",
    },
  });
}
