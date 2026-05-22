import { askClaude, parseJsonArray } from '../lib/anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { dish } = req.body || {}
    if (!dish) return res.status(400).json({ error: 'dish가 필요해요.' })
    const text = await askClaude({
      system: '너는 요리 재료 도우미다. 요리에 보통 필요한 재료를 한국어 JSON 배열로만 답한다.',
      content: [{ type: 'text', text: '"' + dish + '"를 만들 때 보통 필요한 재료를 JSON 배열로만. 예: ["돼지고기","김치","두부"]. 다른 말 금지.' }]
    })
    res.status(200).json({ ingredients: parseJsonArray(text).map(String).filter(Boolean) })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
