import { askClaude } from '../lib/anthropic.js'
import { SEASON2_CHEFS } from '../lib/season2.js'
import { estimateNutrition } from '../lib/nutrition.js'

function parseObj(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\{[\s\S]*\}/)
  if (m) t = m[0]
  try { return JSON.parse(t) } catch (e) { return null }
}

// 시즌2 저장 데이터에서 일치하는 dish 찾기 — 셰프 + 요리명 부분 매칭.
function findStoredDish(chefId, name) {
  if (!chefId || !name) return null
  const c = SEASON2_CHEFS[chefId]
  if (!c) return null
  const norm = s => String(s || '').toLowerCase().replace(/[\s·ㆍ,.()\"\']/g, '')
  const n = norm(name)
  for (const d of (c.dishes || [])) {
    const clean = (d.dish || '').split(' — ')[0].replace(/\([^)]*\)/g, '').trim()
    const a = norm(clean), b = norm(d.dish)
    if (a && (a.includes(n) || n.includes(a))) return d
    if (b && (b.includes(n) || n.includes(b.slice(0, 20)))) return d
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { name, ingredients, chef, style, fast } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name 필요' })

    // 저장된 시즌2 레시피가 있으면 그걸 우선 반환 (LLM 호출 없이) — 방송 실제 기법 사용.
    const stored = findStoredDish(chef && chef.id, name)
    if (stored && Array.isArray(stored.steps) && stored.steps.length >= 3) {
      return res.status(200).json({
        name: stored.dish ? stored.dish.split(' — ')[0].trim() : name,
        time: '',
        ingredients: (stored.ingredients || []).map(it => ({ item: String(it), amount: '' })),
        steps: stored.steps.map(String),
        nutrition: estimateNutrition(stored.ingredients || []),
        tip: chef && chef.name ? (chef.name + ' 셰프가 시즌2에서 실제로 만든 요리예요.') : ''
      })
    }

    // 저장된 게 없으면 LLM으로 생성
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
      nutrition: estimateNutrition((Array.isArray(o.ingredients) ? o.ingredients.map(x => x && x.item ? String(x.item) : String(x || '')) : [])),
      tip: o.tip ? String(o.tip) : ''
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
