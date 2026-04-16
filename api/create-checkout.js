import Stripe from 'stripe';

const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co';
const PRICE_ID = 'price_1TMKc2HZwOOLEsb2l9bqAWM5';
const TRIAL_DAYS = 7;

async function supabaseGet(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  return res.ok ? (await res.json())[0] ?? null : null;
}

async function supabasePatch(path, body, key) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
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
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!sbKey || !stripeKey) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const { userId, email, name } = req.body;
    if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

    let user = await supabaseGet(`/users?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,grandfathered,subscription_status`, sbKey);

    // User exists only in localStorage — create their Supabase record now
    if (!user) {
      await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ id: userId, name: name || '', email: email.toLowerCase(), created_at: new Date().toISOString(), consent_signed: false }),
      });
      user = { stripe_customer_id: null, grandfathered: false, subscription_status: null };
    }

    if (user.grandfathered) return res.status(200).json({ grandfathered: true });
    if (['active', 'trialing'].includes(user.subscription_status)) return res.status(200).json({ alreadyActive: true });

    const stripe = new Stripe(stripeKey);

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, name });
      customerId = customer.id;
      await supabasePatch(`/users?id=eq.${encodeURIComponent(userId)}`, { stripe_customer_id: customerId }, sbKey);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${req.headers.origin || 'https://steady-parent-coaching.vercel.app'}/?checkout=success`,
      cancel_url: `${req.headers.origin || 'https://steady-parent-coaching.vercel.app'}/?checkout=cancelled`,
      metadata: { userId },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    res.status(500).json({ error: err.message });
  }
}
