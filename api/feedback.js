// api/feedback.js — receives feedback from clients and writes to Supabase

const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const { user_id, message_id, rating, report_category, free_text, conversation_excerpt } = req.body ?? {}

  if (!user_id) return res.status(400).json({ error: 'user_id is required' })
  if (!rating && !report_category) return res.status(400).json({ error: 'rating or report_category is required' })
  if (rating && !['helpful', 'not_helpful'].includes(rating)) {
    return res.status(400).json({ error: 'invalid rating value' })
  }

  const payload = {
    user_id,
    message_id: message_id ?? null,
    rating: rating ?? null,
    report_category: report_category ?? null,
    free_text: free_text ? String(free_text).slice(0, 2000) : null,
    conversation_excerpt: conversation_excerpt ? String(conversation_excerpt).slice(0, 3000) : null,
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('Supabase insert error:', r.status, err)
      return res.status(502).json({ error: 'Database error' })
    }
  } catch (err) {
    console.error('Fetch to Supabase failed:', err)
    return res.status(502).json({ error: 'Failed to reach database' })
  }

  return res.status(200).json({ ok: true })
}
