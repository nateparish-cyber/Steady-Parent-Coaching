const SUPABASE_URL = "https://hxljtpfdfdjocbcbuytq.supabase.co";

function sb(path, { method = "GET", body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function isAdmin(req) {
  const key = (req.body?.adminKey) || (req.query?.adminKey);
  return key && process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Server config error" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const r = await sb("/users?select=id,name,username,email,consent_signed,created_at&order=created_at.desc");
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch users" });
    const data = await r.json();
    return res.status(200).json({ users: data || [] });
  }

  if (req.method === "DELETE") {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    // Delete messages, profile, then user
    await sb(`/messages?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
    await sb(`/profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
    const r = await sb(`/users?id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!r.ok) return res.status(500).json({ error: "Failed to delete user" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
