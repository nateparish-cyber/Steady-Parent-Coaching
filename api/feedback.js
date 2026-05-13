// api/feedback.js — message-level feedback + post-engagement survey

const SUPABASE_URL = 'https://hxljtpfdfdjocbcbuytq.supabase.co'

async function sb(path, { method = 'GET', body, prefer, key } = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  return i >= 1 && i <= 5 ? i : null
}

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

  const body = req.body ?? {}
  const action = body.action

  // ── Survey: should we show it? ─────────────────────────────────────────────
  if (action === 'survey-check') {
    const { user_id } = body
    if (!user_id) return res.status(400).json({ error: 'user_id is required' })
    try {
      const ur = await sb(`/users?id=eq.${encodeURIComponent(user_id)}&select=survey_completed_at,survey_dismissed_at`, { key })
      const urows = await ur.json()
      const u = urows?.[0]
      if (!u) return res.status(404).json({ error: 'User not found' })
      if (u.survey_completed_at || u.survey_dismissed_at) {
        return res.status(200).json({ shouldShow: false })
      }
      // Count distinct UTC days the user has sent a user-role message
      const mr = await sb(`/messages?user_id=eq.${encodeURIComponent(user_id)}&role=eq.user&select=created_at`, { key })
      const msgs = await mr.json()
      const days = new Set((msgs || []).map(m => (m.created_at || '').slice(0, 10)).filter(Boolean))
      return res.status(200).json({ shouldShow: days.size >= 5, days: days.size })
    } catch (err) {
      console.error('survey-check error:', err)
      return res.status(500).json({ error: 'survey-check failed' })
    }
  }

  // ── Survey: submit responses ───────────────────────────────────────────────
  if (action === 'survey-submit') {
    const { user_id, useful, meets_expectations, helps_manage_anxiety, helps_meet_goals, confident_parenting, free_text } = body
    if (!user_id) return res.status(400).json({ error: 'user_id is required' })
    const scores = {
      useful: clampScore(useful),
      meets_expectations: clampScore(meets_expectations),
      helps_manage_anxiety: clampScore(helps_manage_anxiety),
      helps_meet_goals: clampScore(helps_meet_goals),
      confident_parenting: clampScore(confident_parenting),
    }
    if (Object.values(scores).every(v => v === null) && !free_text) {
      return res.status(400).json({ error: 'survey is empty' })
    }
    try {
      const ir = await sb('/survey_responses', {
        method: 'POST', key, prefer: 'return=minimal',
        body: { user_id, ...scores, free_text: free_text ? String(free_text).slice(0, 2000) : null },
      })
      if (!ir.ok) {
        const err = await ir.text()
        console.error('survey insert error:', ir.status, err)
        return res.status(502).json({ error: 'Database error' })
      }
      await sb(`/users?id=eq.${encodeURIComponent(user_id)}`, {
        method: 'PATCH', key, prefer: 'return=minimal',
        body: { survey_completed_at: new Date().toISOString() },
      })
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('survey-submit error:', err)
      return res.status(502).json({ error: 'Failed to save survey' })
    }
  }

  // ── Survey: skip / dismiss permanently ────────────────────────────────────
  if (action === 'survey-dismiss') {
    const { user_id } = body
    if (!user_id) return res.status(400).json({ error: 'user_id is required' })
    try {
      await sb(`/users?id=eq.${encodeURIComponent(user_id)}`, {
        method: 'PATCH', key, prefer: 'return=minimal',
        body: { survey_dismissed_at: new Date().toISOString() },
      })
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('survey-dismiss error:', err)
      return res.status(500).json({ error: 'survey-dismiss failed' })
    }
  }

  // ── Default: per-message feedback (legacy) ────────────────────────────────
  const { user_id, message_id, rating, report_category, free_text, conversation_excerpt } = body

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
