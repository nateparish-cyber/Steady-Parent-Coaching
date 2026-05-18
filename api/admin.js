// Handles: consent (POST), users (GET/DELETE), kb (GET/POST)
import { timingSafeEqual } from "crypto";
import { sendEmail, NATE_EMAIL } from "./_email.js";

const SUPABASE_URL = "https://hxljtpfdfdjocbcbuytq.supabase.co";

// In-memory rate limiter: tracks failed admin attempts by IP
const failedAttempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (now - record.windowStart > WINDOW_MS) { failedAttempts.delete(ip); return false; }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip);
  if (!record || now - record.windowStart > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    record.count++;
  }
}

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
  const key = req.body?.adminKey || req.query?.adminKey;
  const expected = process.env.ADMIN_PASSWORD;
  if (!key || !expected) return false;
  try {
    const a = Buffer.from(key.padEnd(expected.length));
    const b = Buffer.from(expected.padEnd(key.length));
    // Both must be same length for timingSafeEqual
    if (key.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Server config error" });

  const action = req.query.action || req.body?.action;

  // ── Consent (no admin key needed — user marks their own consent) ──────────
  if (action === "consent") {
    const { userId, typedName, consentText } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const patch = { consent_signed: true, consent_signed_at: new Date().toISOString() };
    if (typedName) patch.consent_typed_name = String(typedName).trim().slice(0, 200);
    const r = await sb(`/users?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
    if (!r.ok) return res.status(500).json({ error: "Failed to update consent" });

    if (consentText) {
      try {
        const u = await sb(`/users?id=eq.${encodeURIComponent(userId)}&select=name,email,username`);
        const rows = await u.json();
        const user = rows?.[0];
        if (user) {
          const tasks = [];
          tasks.push(sendEmail({
            to: NATE_EMAIL,
            subject: `Signed Agreement — ${user.name}`,
            text: `Account: ${user.username} (${user.email})\nSigned: ${new Date().toLocaleString()}\n\n${consentText}`,
          }));
          if (user.email) {
            const firstName = (user.name || "").split(" ")[0] || "there";
            tasks.push(sendEmail({
              to: user.email,
              subject: "Welcome to Steady Parenting Coach — Your Signed Documents",
              text: `Hi ${firstName},\n\nWelcome! Your account is now active.\n\nBelow is a copy of your signed documents for your records.\n\n— Steady Parenting Coach\n\n${consentText}`,
            }));
          }
          await Promise.allSettled(tasks);
        }
      } catch (err) {
        console.error("consent email failed:", err.message);
      }
    }
    return res.status(200).json({ success: true });
  }

  // ── KB read (no admin key needed) ─────────────────────────────────────────
  if (action === "kb" && req.method === "GET") {
    const r = await sb("/knowledge_base?id=eq.1&select=content");
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch KB" });
    const data = await r.json();
    return res.status(200).json({ content: data?.[0]?.content || "" });
  }

  // ── Admin-only operations ─────────────────────────────────────────────────
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  if (!isAdmin(req)) {
    recordFailedAttempt(ip);
    return res.status(403).json({ error: "Forbidden" });
  }

  // KB write
  if (action === "kb" && req.method === "POST") {
    const { content } = req.body;
    const r = await sb("/knowledge_base?id=eq.1", { method: "PATCH", body: { content }, prefer: "return=minimal" });
    if (!r.ok) return res.status(500).json({ error: "Failed to save KB" });
    return res.status(200).json({ success: true });
  }

  // Survey responses list + summary stats
  if (action === "survey-responses" && req.method === "GET") {
    const r = await sb("/survey_responses?select=*,users(name,username,email)&order=created_at.desc&limit=500");
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch survey responses" });
    const responses = await r.json();

    // Quick aggregates
    const keys = ["useful", "meets_expectations", "helps_manage_anxiety", "helps_meet_goals", "confident_parenting"];
    const averages = {};
    for (const k of keys) {
      const vals = responses.map(r => r[k]).filter(v => typeof v === "number");
      averages[k] = vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length } : { avg: null, count: 0 };
    }

    // User state counts (PostgREST returns count in Content-Range header when count=exact)
    const [cR, dR] = await Promise.all([
      sb("/users?survey_completed_at=not.is.null&select=id&limit=0", { prefer: "count=exact" }),
      sb("/users?survey_dismissed_at=not.is.null&select=id&limit=0", { prefer: "count=exact" }),
    ]);
    const parseCount = h => Number((h.headers.get("content-range") || "*/0").split("/")[1]) || 0;
    const completedCount = parseCount(cR);
    const dismissedCount = parseCount(dR);

    return res.status(200).json({ responses, averages, completedCount, dismissedCount });
  }

  // Users list
  if (action === "users" && req.method === "GET") {
    const r = await sb("/users?select=id,name,username,email,consent_signed,created_at&order=created_at.desc");
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch users" });
    return res.status(200).json({ users: await r.json() || [] });
  }

  // User delete — atomic via stored procedure
  if (action === "users" && req.method === "DELETE") {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_user_cascade`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uid: userId }),
    });
    if (!r.ok) return res.status(500).json({ error: "Failed to delete user" });
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}
