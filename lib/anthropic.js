// Claude(Anthropic) 호출 헬퍼. 키는 서버 환경변수(ANTHROPIC_API_KEY)에서만 읽는다.
// 절대 프론트엔드/저장소에 키를 두지 않는다.
export async function askClaude({ system, content, maxTokens = 1024 }) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았어요.')
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error('Anthropic ' + r.status + ': ' + t.slice(0, 300))
  }
  const j = await r.json()
  return (j.content && j.content[0] && j.content[0].text) || ''
}

export function parseJsonArray(text) {
  if (!text) return []
  let t = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\[[\s\S]*\]/)
  if (m) t = m[0]
  try { const a = JSON.parse(t); return Array.isArray(a) ? a : [] } catch (e) { return [] }
}
