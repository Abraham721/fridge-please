import { askClaude, parseJsonArray } from '../lib/anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { image } = req.body || {}
    if (!image) return res.status(400).json({ error: 'image(base64 dataURL)가 필요해요.' })
    const [meta, b64] = String(image).split(',')
    const mediaType = ((meta || '').match(/data:(.*?);/) || [])[1] || 'image/jpeg'
    const text = await askClaude({
      system: [
        '너는 영수증 OCR + 식재료 추출 전문가다.',
        '입력: 마트/슈퍼/편의점 영수증 사진.',
        '출력: 영수증에 적힌 품목 중 "식재료/식품"만 한국어로 식별한 JSON 배열.',
        '',
        '규칙:',
        '1. 식품·식재료만 추출. 위생·세제·주방용품·일반 잡화 제외.',
        '2. 브랜드명/제조사/품목 번호/수량/가격/날짜는 제거하고 일반 식재료 이름으로 정제. 예: "롯데 진주햄 500g" → "햄". "포스코식품 묶음삼겹살" → "삼겹살".',
        '3. 중복 제거, 같은 재료는 한 번만.',
        '4. 식재료가 아닌 항목(빈 칸, 합계, 거스름돈, 카드번호)은 무시.',
        '5. 추측 금지 — 글자가 흐리면 빼고 확실한 것만.',
        '',
        '출력은 JSON 배열만. 설명·문장 금지.',
        '예: ["삼겹살","두부","대파","계란","우유"]'
      ].join('\n'),
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: '이 영수증의 식재료를 위 규칙대로 JSON 배열로만 답해.' }
      ],
      maxTokens: 600
    })
    res.status(200).json({ ingredients: parseJsonArray(text).map(String).filter(Boolean) })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
