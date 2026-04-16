import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const subscription = event.data.object;

  async function updateStatus(subscription) {
    const customerId = subscription.customer;
    const status = subscription.status;
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;
    const subscriptionId = subscription.id;

    await supabase
      .from('users')
      .update({ subscription_status: status, subscription_id: subscriptionId, trial_end: trialEnd })
      .eq('stripe_customer_id', customerId);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = subscription;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await updateStatus(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await updateStatus(subscription);
        break;
      case 'customer.subscription.deleted':
        await supabase
          .from('users')
          .update({ subscription_status: 'canceled', subscription_id: null })
          .eq('stripe_customer_id', subscription.customer);
        break;
      case 'invoice.payment_failed':
        await supabase
          .from('users')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', subscription.customer);
        break;
      default:
        break;
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
