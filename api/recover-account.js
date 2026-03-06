import { hashPassword, supabase } from "./_auth-helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const { data } = await supabase("GET", `/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=*`);
  const user = data?.[0];

  if (!user) return res.status(404).json({ error: "No account found with that email address." });

  const tempPw = "temp-" + Math.random().toString(36).slice(2, 8);
  const passwordHash = await hashPassword(tempPw);
  await supabase("PATCH", `/users?id=eq.${user.id}`, { password_hash: passwordHash });

  // Send recovery email via Resend
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steady Parent Coach <onboarding@resend.dev>",
      to: [email.toLowerCase()],
      subject: "Steady Parent Coach — Account Recovery",
      text: `Hi ${user.name},\n\nHere are your account credentials for Steady Parent Coach:\n\nUsername: ${user.username}\nTemporary Password: ${tempPw}\n\nPlease sign in and update your password.\n\nIf you did not request this, please contact Nate directly.\n\n— Steady Parent Coach`,
    }),
  });

  return res.status(200).json({ success: true });
}
