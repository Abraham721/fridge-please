import { askClaude, parseJsonArray } from '../lib/anthropic.js'
import { CHEF_RECIPES } from '../lib/chefRecipes.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { ingredients, chef } = req.body || {}
    let chefLine = ''
    if (chef && chef.name) {
      chefLine = ' 반드시 다음 셰프의 스타일로 추천해: ' + chef.name + ' — ' + (chef.hint || '') +
        (chef.signatures && chef.signatures.length ? (' (시그니처: ' + chef.signatures.join(', ') + ')') : '')
      const refs = (chef.id && CHEF_RECIPES[chef.id]) || []
      if (refs.length) {
        const refText = refs.slice(0, 3).map(r => r.name + '(' + (r.ingredients || []).slice(0, 6).join('·') + ')').join(' / ')
        chefLine += ' 이 셰프의 대표 레시피를 참고해 같은 결로 추천해: ' + refText + '.'
      }
      chefLine += ' 이 셰프라면 주어진 재료로 어떻게 만들지 떠올려서 추천해.'
    }
    const text = await askClaude({
      system: '너는 요리 추천기다. 입력 재료로 만들 수 있는 요리를 JSON 배열로만 답한다. 한국어.',
      content: [{ type: 'text', text:
        '가진 재료: ' + JSON.stringify(ingredients || []) + '.' + chefLine +
        ' 만들 수 있는(또는 1~2개만 더 사면 되는) 요리 최대 5개를 ' +
        '[{"name":요리명,"missing":[부족재료],"note":"한 줄 설명","steps":["간단 조리 단계1","단계2","단계3"]}] ' +
        'JSON 배열로만 답해. 다른 말 금지.' }],
      maxTokens: 1500
    })
    const recipes = parseJsonArray(text).map(x => ({
      name: x && x.name ? String(x.name) : '',
      missing: x && Array.isArray(x.missing) ? x.missing.map(String) : [],
      note: x && x.note ? String(x.note) : '',
      steps: x && Array.isArray(x.steps) ? x.steps.map(String) : []
    })).filter(x => x.name)
    res.status(200).json({ recipes })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
