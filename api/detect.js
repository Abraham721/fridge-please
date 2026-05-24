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
        '너는 식재료 인식 전문가다. 사진에 실제로 보이는 식재료만 한국어로 식별한다.',
        '',
        '규칙:',
        '1. 가능한 한 가장 구체적인 이름을 쓴다. 상위 범주로 뭉뚱그리지 않는다.',
        "   - 생선은 종을 특정: '장어', '고등어', '연어', '갈치' (X '생선')",
        "   - 조개·해산물은 종류를 구분: '굴', '가리비', '홍합', '바지락', '전복', '새우', '오징어' (X '조개', X '해산물')",
        "   - 고기는 부위를 구분: '삼겹살', '목살', '닭다리', '소고기 등심' (X '고기')",
        "   - 채소는 품종을 특정: '대파', '쪽파', '양파', '청양고추' (X '파', X '채소')",
        '2. 사진에 없는 재료는 절대 지어내지 않는다.',
        '3. 같은 재료는 한 번만. 중복 금지.',
        '4. 종을 정말 특정할 수 없을 때만 일반 이름을 쓴다.',
        '5. 식재료가 아닌 물건(그릇, 포장지, 손, 도마)은 제외한다.',
        '6. 주재료(고기·생선·해산물·채소·면·밥·달걀·두부 등)는 빠뜨리지 말고, 눈에 잘 띄는 주재료를 배열 앞쪽에 둔다. 양념·소스병은 보이면 뒤쪽에.',
        '',
        '출력은 JSON 배열만. 설명·문장·코드블록 금지.'
      ].join('\n'),
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: '이 사진 속 식재료를 위 규칙대로 가장 구체적인 이름으로 식별해서 JSON 배열로만 답해.\n예: ["장어","굴","가리비","대파"]' }
      ]
    })
    res.status(200).json({ ingredients: parseJsonArray(text).map(String).filter(Boolean) })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
