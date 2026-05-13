import Stripe from 'stripe';
import { verifySession } from './_auth-helpers.js';

const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co';

async function sbPatch(sbKey, userId, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
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

    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=grandfathered,subscription_status,subscription_id,trial_end,stripe_customer_id`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
    });
    const rows = await r.json();
    const user = rows?.[0] ?? null;

    if (!user) return res.status(404).json({ error: 'User not found' });

    let status = user.subscription_status || 'none';
    let trialEnd = user.trial_end || null;
    let isActive = user.grandfathered || status === 'active' || status === 'trialing';

    // Self-heal: if DB says we're not active but the user has a Stripe customer
    // (means they at least started checkout), ask Stripe directly. The webhook
    // may not have fired (or may not be configured), so we trust Stripe as the
    // source of truth and patch Supabase forward.
    if (!isActive && user.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const subs = await stripe.subscriptions.list({
          customer: user.stripe_customer_id,
          status: 'all',
          limit: 5,
        });
        const live = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
        if (live) {
          status = live.status;
          trialEnd = live.trial_end ? new Date(live.trial_end * 1000).toISOString() : null;
          isActive = true;
          await sbPatch(sbKey, userId, {
            subscription_status: status,
            subscription_id: live.id,
            trial_end: trialEnd,
          });
        }
      } catch (stripeErr) {
        console.error('subscription-status stripe fallback failed:', stripeErr.message);
      }
    }

    res.status(200).json({
      active: isActive,
      grandfathered: user.grandfathered || false,
      status,
      trialEnd,
    });
  } catch (err) {
    console.error('subscription-status error:', err);
    res.status(500).json({ error: err.message });
  }
}
