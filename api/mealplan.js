// 냉장고 전체 → 며칠치 식단표. 한 번의 LLM 호출로 끼니 그리드를 JSON으로 받는다.
// 셰프가 있으면 그 셰프의 시즌2 + 도메인 풀에서, 없으면 8셰프 전체 + 일반 풀에서 후보 구성.
// 재료 소진을 의식한 식단: 한 재료가 여러 끼니에 분산되게(예: 양배추 한 통 → 양배추쌈 + 볶음 + 국).
import { askClaude } from '../lib/anthropic.js'
import { CHEF_RECIPES } from '../lib/chefRecipes.js'
import { RECIPE_DB } from '../lib/recipeDB.js'
import { SEASON2_CHEFS } from '../lib/season2.js'
import { mainIngredients } from '../lib/retrieve.js'
import { estimateNutrition } from '../lib/nutrition.js'

function parseObj(text) {
  let t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim()
  const m = t.match(/\{[\s\S]*\}/)
  if (m) t = m[0]
  try { return JSON.parse(t) } catch (e) { return null }
}
const cleanName = (s) => String(s || '').split(' — ')[0].replace(/\([^)]*\)/g, '').trim()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { ingredients, chef, days, mealsPerDay, people, style, avoid } = req.body || {}
    const ings = Array.isArray(ingredients) ? ingredients.map(String).filter(Boolean) : []
    const D = Math.max(1, Math.min(7, parseInt(days, 10) || 3))
    const M = Math.max(1, Math.min(3, parseInt(mealsPerDay, 10) || 3))
    const P = Math.max(1, Math.min(8, parseInt(people, 10) || 2))
    const mains = mainIngredients(ings)
    const avoidList = Array.isArray(avoid) ? avoid.map(String).filter(Boolean) : []

    // 후보 풀 구성 — 셰프 페르소나가 있으면 그 셰프 위주.
    const pool = []
    const seen = new Set()
    const push = (name, chefName, cuisine, ingArr) => {
      const n = cleanName(name); if (!n || seen.has(n)) return
      seen.add(n); pool.push({ name: n, chef: chefName || '', cuisine: cuisine || '', ingredients: ingArr || [] })
    }

    if (chef && chef.id) {
      const cui = chef.cuisine || ''
      for (const r of (CHEF_RECIPES[chef.id] || [])) push(r.name, chef.name, cui, r.ingredients)
      const s = SEASON2_CHEFS[chef.id]
      if (s) for (const d of (s.dishes || [])) push(d.dish, chef.name, cui, d.ingredients)
      const doms = (Array.isArray(chef.domains) && chef.domains.length) ? chef.domains : (cui ? [cui] : [])
      for (const r of RECIPE_DB) if (!doms.length || doms.includes(r.cuisine)) push(r.name, '', r.cuisine, r.ingredients)
    } else {
      // 8명 전체 + 일반 풀
      for (const id of Object.keys(SEASON2_CHEFS)) {
        const c = SEASON2_CHEFS[id]
        for (const d of (c.dishes || [])) push(d.dish, c.name, c.cuisine, d.ingredients)
      }
      for (const id of Object.keys(CHEF_RECIPES)) {
        const c = SEASON2_CHEFS[id]
        for (const r of CHEF_RECIPES[id]) push(r.name, c ? c.name : '', c ? c.cuisine : '', r.ingredients)
      }
      for (const r of RECIPE_DB) push(r.name, '', r.cuisine, r.ingredients)
    }
    // 사용자 주재료를 적어도 1개 쓰는 후보를 우선 정렬, 그 다음 일반 후보.
    const matchScore = (c) => mains.reduce((s, m) => s + (c.ingredients.some(i => String(i).includes(m)) ? 1 : 0), 0)
    pool.sort((a, b) => matchScore(b) - matchScore(a))
    const candText = pool.slice(0, 80).map(c =>
      `${c.name}${c.chef ? '|'+c.chef : ''}[${c.cuisine}] 재료:${c.ingredients.slice(0,8).join('·')}`
    ).join('\n')

    let chefBlock = ''
    if (chef && chef.name) {
      chefBlock = '\n[셰프] ' + chef.name + ' — ' + (chef.hint || chef.style || '') +
        '\n식단 전체를 ' + chef.name + ' 결로 짜라(다른 셰프 메뉴는 가급적 쓰지 마라).'
    } else {
      chefBlock = '\n[셰프] 무관 — 8셰프(최현석·박은영·샘킴·정호영·김풍·손종원·윤남노·권성준) 중 다양하게 섞어 식단을 짜되, 같은 셰프가 하루에 두 번 이상 나오지 않게 분산하라.'
    }
    const styleLine = (style && String(style).trim()) ? '\n[사용자 요구] "' + String(style).trim() + '" — 식단 전반에 반영.' : ''
    const avoidLine = avoidList.length ? '\n[회피 재료] ' + avoidList.join(', ') + ' — 이 재료가 들어가는 메뉴는 절대 넣지 마.' : ''
    const mealLabels = (M === 1 ? ['저녁'] : (M === 2 ? ['점심','저녁'] : ['아침','점심','저녁']))
    const labelsLine = '끼니 라벨: ' + mealLabels.join('·')

    const text = await askClaude({
      system: '너는 가정용 식단을 짜주는 셰프 코치다. 한국어 JSON 객체만 출력. 사용자가 가진 재료를 최대한 소진하도록 같은 재료를 여러 끼니에 분배해 식단을 짠다. 후보 목록에 없는 요리는 함부로 지어내지 말고, 변주는 후보 기반.',
      content: [{ type: 'text', text:
        '[냉장고 전체] ' + JSON.stringify(ings) +
        '\n[주재료] ' + (mains.length ? mains.join(', ') : '(없음)') +
        '\n[인원] ' + P + '명' +
        '\n[기간] ' + D + '일 × ' + M + '끼/일 = 총 ' + (D*M) + '끼 (' + labelsLine + ')' +
        chefBlock + styleLine + avoidLine +
        '\n\n[후보 메뉴]\n' + candText +
        '\n\n규칙: ' +
        '(1) 후보 메뉴 중에서 골라 식단을 짠다. 같은 메뉴가 두 번 나오면 안 된다. ' +
        '(2) 사용자가 가진 주재료를 최대한 활용한다. 한 재료를 여러 끼니에 분배해 효율적으로 소진하라(예: 양배추 한 통 → 양배추쌈+볶음+국). ' +
        '(3) 아침은 가볍게(국·죽·간단식), 점심은 한 끼 든든, 저녁은 셰프 시그니처를 우선. ' +
        '(4) 일별로 영양 균형(단백질·탄수·채소). ' +
        '(5) shoppingList — 식단 전체에 필요한데 냉장고에 없는 재료를 모아 한 번에 살 수 있게 정리(중복 제거). 양념은 최소화. ' +
        '(6) reuseNote — 식단의 재료 소진 전략을 한 줄로(예: "양배추 한 통이 D1 볶음→D2 국→D3 쌈으로 다 소진"). ' +
        '\n\n출력 형식: {' +
        '"days":[{"label":"D1","meals":[{"type":"아침","name":요리명,"chef":셰프명또는빈값,"mainIngredients":[메인재료2~3],"missing":[냉장고에없어사야할재료],"note":"한줄설명"},...]}],' +
        '"shoppingList":[재료1,재료2,...],' +
        '"reuseNote":"한줄 전략"' +
        '} JSON 객체만, 다른 말 금지.'
      }],
      maxTokens: 3500
    })

    const o = parseObj(text) || {}
    const daysOut = Array.isArray(o.days) ? o.days.slice(0, D) : []
    const result = {
      days: daysOut.map((d, i) => ({
        label: d && d.label ? String(d.label) : ('D' + (i+1)),
        meals: Array.isArray(d && d.meals) ? d.meals.slice(0, M).map(m => {
          const name = m && m.name ? String(m.name) : ''
          // 후보 매칭으로 영양 추정
          const cand = pool.find(c => c.name === name) || pool.find(c => name && c.name.includes(name.slice(0,4)))
          const ingArr = cand ? cand.ingredients : []
          return {
            type: m && m.type ? String(m.type) : '',
            name,
            chef: m && m.chef ? String(m.chef) : (cand ? cand.chef : ''),
            mainIngredients: m && Array.isArray(m.mainIngredients) ? m.mainIngredients.map(String) : [],
            missing: m && Array.isArray(m.missing) ? m.missing.map(String) : [],
            note: m && m.note ? String(m.note) : '',
            nutrition: estimateNutrition(ingArr)
          }
        }) : []
      })),
      shoppingList: Array.isArray(o.shoppingList) ? o.shoppingList.map(String).filter(Boolean) : [],
      reuseNote: o.reuseNote ? String(o.reuseNote) : ''
    }
    res.status(200).json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
