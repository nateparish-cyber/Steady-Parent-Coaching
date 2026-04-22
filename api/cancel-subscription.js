import Stripe from 'stripe';
import { verifySession } from './_auth-helpers.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co';

async function sbGet(path, key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  return r.json();
}

async function sbPatch(path, body, key) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const { userId, sessionToken } = req.body;
    if (!userId || !sessionToken) return res.status(400).json({ error: 'Missing userId or sessionToken' });

    const valid = await verifySession(userId, sessionToken);
    if (!valid) return res.status(403).json({ error: 'Unauthorized' });

    const rows = await sbGet(`/users?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,subscription_id,subscription_status,grandfathered`, sbKey);
    const user = rows?.[0] ?? null;

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.grandfathered) return res.status(400).json({ error: 'Grandfathered accounts cannot be cancelled here. Contact nate.parish@gmail.com.' });
    if (!user.stripe_customer_id) return res.status(400).json({ error: 'No subscription found.' });

    // Find the active subscription
    let subscriptionId = user.subscription_id;
    if (!subscriptionId) {
      const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'all', limit: 5 });
      const active = subs.data.find(s => ['active', 'trialing'].includes(s.status));
      if (!active) return res.status(400).json({ error: 'No active subscription found.' });
      subscriptionId = active.id;
    }

    // Cancel at period end (user keeps access until billing cycle ends)
    const cancelled = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

    // Update DB
    await sbPatch(`/users?id=eq.${encodeURIComponent(userId)}`, { subscription_status: 'canceling' }, sbKey);

    return res.status(200).json({
      success: true,
      cancelAt: new Date(cancelled.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('cancel-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}
