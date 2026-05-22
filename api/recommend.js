import { askClaude, parseJsonArray } from '../lib/anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { ingredients } = req.body || {}
    const text = await askClaude({
      system: '너는 한국 가정식 추천기다. 입력 재료로 만들 수 있는 요리를 JSON 배열로만 답한다.',
      content: [{ type: 'text', text: '가진 재료: ' + JSON.stringify(ingredients || []) + '. 만들 수 있는 요리 최대 5개를 [{"name":요리명,"missing":[부족재료],"note":"한 줄 설명"}] JSON 배열로만. 다른 말 금지.' }]
    })
    const recipes = parseJsonArray(text)
      .map(x => ({ name: x && x.name ? String(x.name) : '', missing: x && Array.isArray(x.missing) ? x.missing.map(String) : [], note: x && x.note ? String(x.note) : '' }))
      .filter(x => x.name)
    res.status(200).json({ recipes })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
