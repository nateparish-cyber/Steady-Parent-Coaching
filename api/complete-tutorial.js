import { verifySession, supabase } from './_auth-helpers.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, sessionToken } = req.body;
  if (!userId || !sessionToken) return res.status(400).json({ error: 'Missing userId or sessionToken' });

  const valid = await verifySession(userId, sessionToken);
  if (!valid) return res.status(403).json({ error: 'Unauthorized' });

  await supabase('PATCH', `/users?id=eq.${encodeURIComponent(userId)}`, { tutorial_done: true });
  return res.status(200).json({ success: true });
}
