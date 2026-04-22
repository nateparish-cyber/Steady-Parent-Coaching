import Stripe from 'stripe';

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

const PRICE_ID = 'price_1TMKc2HZwOOLEsb2l9bqAWM5';
const TRIAL_DAYS = 7;
const ALLOWED_ORIGINS = ['https://www.steadyparentingcoach.com', 'https://steadyparentingcoach.com', 'http://localhost:3000'];
function safeOrigin(origin) { return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.steadyparentingcoach.com'; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbKey) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const { userId, email, name } = req.body;
    if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

    // Check if user already has a Stripe customer ID
    const rows = await sbGet(`/users?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,grandfathered,subscription_status`, sbKey);
    const user = rows?.[0] ?? null;

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Grandfathered users don't need checkout
    if (user.grandfathered) return res.status(200).json({ grandfathered: true });

    // Already active — no need to checkout again
    if (['active', 'trialing'].includes(user.subscription_status)) {
      return res.status(200).json({ alreadyActive: true });
    }

    // Create or reuse Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, name });
      customerId = customer.id;
      await sbPatch(`/users?id=eq.${encodeURIComponent(userId)}`, { stripe_customer_id: customerId }, sbKey);
    }

    // Create Checkout session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${safeOrigin(req.headers.origin)}/app?checkout=success`,
      cancel_url: `${safeOrigin(req.headers.origin)}/app?checkout=cancelled`,
      metadata: { userId },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
