const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=grandfathered,subscription_status,trial_end,stripe_customer_id`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
    });
    const rows = await r.json();
    const user = rows?.[0] ?? null;

    if (!user) return res.status(404).json({ error: 'User not found' });

    const isActive = user.grandfathered || user.subscription_status === 'active' || user.subscription_status === 'trialing';

    res.status(200).json({
      active: isActive,
      grandfathered: user.grandfathered || false,
      status: user.subscription_status || 'none',
      trialEnd: user.trial_end || null,
    });
  } catch (err) {
    console.error('subscription-status error:', err);
    res.status(500).json({ error: err.message });
  }
}
