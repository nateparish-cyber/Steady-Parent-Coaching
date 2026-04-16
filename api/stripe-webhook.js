import Stripe from 'stripe';

const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co';

async function supabasePatch(path, body, key) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sbKey || !stripeKey || !webhookSecret) return res.status(500).json({ error: 'Server configuration error' });

  const stripe = new Stripe(stripeKey);
  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const obj = event.data.object;

  async function updateStatus(sub) {
    const status = sub.status;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    await supabasePatch(`/users?stripe_customer_id=eq.${encodeURIComponent(sub.customer)}`,
      { subscription_status: status, subscription_id: sub.id, trial_end: trialEnd }, sbKey);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.subscription) {
          const sub = await stripe.subscriptions.retrieve(obj.subscription);
          await updateStatus(sub);
        }
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await updateStatus(obj);
        break;
      case 'customer.subscription.deleted':
        await supabasePatch(`/users?stripe_customer_id=eq.${encodeURIComponent(obj.customer)}`,
          { subscription_status: 'canceled', subscription_id: null }, sbKey);
        break;
      case 'invoice.payment_failed':
        await supabasePatch(`/users?stripe_customer_id=eq.${encodeURIComponent(obj.customer)}`,
          { subscription_status: 'past_due' }, sbKey);
        break;
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
