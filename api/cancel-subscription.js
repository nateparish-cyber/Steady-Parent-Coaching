const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id, subscription_id, subscription_status, grandfathered')
      .eq('id', userId)
      .single();

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
    await supabase.from('users').update({ subscription_status: 'canceling' }).eq('id', userId);

    res.status(200).json({
      success: true,
      cancelAt: new Date(cancelled.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('cancel-subscription error:', err);
    res.status(500).json({ error: err.message });
  }
};
