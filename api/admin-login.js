export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body;

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return res.status(500).json({ error: "Admin credentials not configured" });
  }

  if (username.trim().toLowerCase() === adminUsername.toLowerCase() && password === adminPassword) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ success: false });
}
