import { askClaude, parseJsonArray } from '../lib/anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { image } = req.body || {}
    if (!image) return res.status(400).json({ error: 'image(base64 dataURL)가 필요해요.' })
    const [meta, b64] = String(image).split(',')
    const mediaType = ((meta || '').match(/data:(.*?);/) || [])[1] || 'image/jpeg'
    const text = await askClaude({
      system: '너는 식재료 인식기다. 사진에서 보이는 식재료 이름만 한국어로 JSON 배열로 답한다. 설명/문장 금지.',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: '이 사진의 식재료를 JSON 배열로만. 예: ["계란","양파","대파"]' }
      ]
    })
    res.status(200).json({ ingredients: parseJsonArray(text).map(String).filter(Boolean) })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
