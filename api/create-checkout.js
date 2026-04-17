const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRICE_ID = 'price_1TMKc2HZwOOLEsb2l9bqAWM5';
const TRIAL_DAYS = 7;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, email, name } = req.body;
    if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

    // Check if user already has a Stripe customer ID
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id, grandfathered, subscription_status')
      .eq('id', userId)
      .single();

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
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', userId);
    }

    // Create Checkout session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { trial_period_days: TRIAL_DAYS },
      success_url: `${req.headers.origin || 'https://www.steadyparentingcoach.com'}/app?checkout=success`,
      cancel_url: `${req.headers.origin || 'https://www.steadyparentingcoach.com'}/app?checkout=cancelled`,
      metadata: { userId },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    res.status(500).json({ error: err.message });
  }
};
