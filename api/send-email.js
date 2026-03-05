export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, text } = req.body;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Steady Parent Coach <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send email" });
  }
}
