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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Server config error" });

  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const r = await sb(`/messages?user_id=eq.${encodeURIComponent(userId)}&select=role,content&order=id.asc`);
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch messages" });
    const data = await r.json();
    return res.status(200).json({ messages: data || [] });
  }

  if (req.method === "POST") {
    const { userId, messages } = req.body;
    if (!userId || !messages?.length) return res.status(400).json({ error: "Missing userId or messages" });
    const rows = messages.map(m => ({
      user_id: userId,
      role: m.role,
      content: m.content,
      created_at: new Date().toISOString(),
    }));
    const r = await sb("/messages", { method: "POST", body: rows, prefer: "return=minimal" });
    if (!r.ok) return res.status(500).json({ error: "Failed to save messages" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
