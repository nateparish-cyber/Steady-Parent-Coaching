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
    const r = await sb("/knowledge_base?id=eq.1&select=content");
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch KB" });
    const data = await r.json();
    return res.status(200).json({ content: data?.[0]?.content || "" });
  }

  if (req.method === "POST") {
    const { content, adminKey } = req.body;
    if (!process.env.ADMIN_PASSWORD || adminKey !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Try to update existing row
    const patch = await sb("/knowledge_base?id=eq.1", { method: "PATCH", body: { content }, prefer: "return=minimal" });
    if (!patch.ok) return res.status(500).json({ error: "Failed to save KB" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
