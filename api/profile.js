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
    const r = await sb(`/profiles?user_id=eq.${encodeURIComponent(userId)}&select=working_on,triggers,accommodations,notes`);
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch profile" });
    const data = await r.json();
    return res.status(200).json({ profile: data?.[0] || {} });
  }

  if (req.method === "POST") {
    const { userId, working_on, triggers, accommodations, notes } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const r = await sb("/profiles", {
      method: "POST",
      body: {
        user_id: userId,
        working_on: working_on || "",
        triggers: triggers || "",
        accommodations: accommodations || "",
        notes: notes || "",
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    if (!r.ok) return res.status(500).json({ error: "Failed to save profile" });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
