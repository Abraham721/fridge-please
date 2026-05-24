import { askClaude } from '../lib/anthropic.js'

function parseObj(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\{[\s\S]*\}/)
  if (m) t = m[0]
  try { return JSON.parse(t) } catch (e) { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { name, ingredients, chef, style, fast } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name 필요' })
    let chefLine = ''
    if (chef && chef.name) chefLine = ' ' + chef.name + ' 셰프 스타일로(' + (chef.hint || '') + ').'
    const styleLine = (style && String(style).trim()) ? (' 사용자 요구: "' + String(style).trim() + '".') : ''
    const fastLine = fast ? ' 15분 이내로 만들 수 있게 단계를 단순화.' : ''
    const text = await askClaude({
      system: '너는 상세 레시피 작성기다. 집에서 따라할 수 있는 구체적 레시피를 JSON 객체로만 답한다. 한국어.',
      content: [{ type: 'text', text:
        '요리: "' + name + '".' + chefLine + styleLine + fastLine +
        ' 사용자가 가진 재료: ' + JSON.stringify(ingredients || []) + '. 이 요리의 상세 레시피를 ' +
        '{"name":요리명,"time":예상시간(분,정수),"ingredients":[{"item":재료명,"amount":"분량"}],' +
        '"steps":["구체 단계1","단계2"...(5~8단계, 양·불세기·시간 포함해 따라하기 쉽게)],"tip":"한 줄 팁"} ' +
        'JSON 객체로만 답해. 다른 말 금지.' }],
      maxTokens: 1800
    })
    const o = parseObj(text) || {}
    res.status(200).json({
      name: o.name ? String(o.name) : name,
      time: (o.time || o.time === 0) ? String(o.time) : '',
      ingredients: Array.isArray(o.ingredients)
        ? o.ingredients.map(x => ({ item: x && x.item ? String(x.item) : String(x || ''), amount: x && x.amount ? String(x.amount) : '' })).filter(x => x.item)
        : [],
      steps: Array.isArray(o.steps) ? o.steps.map(String) : [],
      tip: o.tip ? String(o.tip) : ''
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
