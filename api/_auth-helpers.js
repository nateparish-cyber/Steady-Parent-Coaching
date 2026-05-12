// Shared auth helpers for API routes (PBKDF2 via Web Crypto — no npm deps)
import { timingSafeEqual } from "node:crypto";

const SUPABASE_URL = "https://hxljtpfdfdjocbcbuytq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4bGp0cGZkZmRqb2NiY2J1eXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDczMzIsImV4cCI6MjA4ODMyMzMzMn0.JDK05pK6Rs_lRPi_1BnqezeensGdCqXu7ugXlaKJCIo";

const SUPA_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  // Support migration from old weak hash (starts with "h")
  if (!stored.startsWith("pbkdf2:")) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) { hash = ((hash << 5) - hash) + password.charCodeAt(i); hash |= 0; }
    return "h" + Math.abs(hash).toString(36) === stored;
  }
  const [, saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  const newHashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return newHashHex === hashHex;
}

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: { ...SUPA_HEADERS, ...(method === "GET" ? {} : { "Prefer": "return=representation" }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// Verify that a sessionToken belongs to userId
async function verifySession(userId, sessionToken) {
  if (!userId || !sessionToken) return false;
  const { data } = await supabase("GET", `/users?id=eq.${encodeURIComponent(userId)}&select=session_token`);
  const stored = data?.[0]?.session_token;
  if (!stored || stored.length !== sessionToken.length) return false;
  // Constant-time comparison
  const a = Buffer.from(stored);
  const b = Buffer.from(sessionToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { hashPassword, verifyPassword, supabase, verifySession };
