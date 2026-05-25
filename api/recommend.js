import { askClaude, parseJsonArray } from '../lib/anthropic.js'
import { CHEF_RECIPES } from '../lib/chefRecipes.js'
import { retrieveCandidates, dishesToCandidates } from '../lib/retrieve.js'
import { RECIPE_DB } from '../lib/recipeDB.js'
import { season2Signatures, SEASON2_CHEFS } from '../lib/season2.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { ingredients, chef, style, fast } = req.body || {}
    const ings = Array.isArray(ingredients) ? ingredients.map(String).filter(Boolean) : []
    const domains = (chef && Array.isArray(chef.domains) && chef.domains.length) ? chef.domains : null

    // 1단 검색 + 2단 셰프 도메인 필터 — 후보가 적으면 점진적으로 완화(폴백)
    let cands = retrieveCandidates(ings, domains, { maxMissing: 2, limit: 24 })
    if (domains && cands.length < 5) cands = retrieveCandidates(ings, domains, { maxMissing: 3, limit: 24 })
    if (cands.length < 3) cands = retrieveCandidates(ings, null, { maxMissing: 2, limit: 24 })
    if (cands.length === 0) cands = retrieveCandidates(ings, null, { maxMissing: 3, limit: 20 })

    // 셰프를 골랐으면 그 셰프가 실제로 한 요리(시즌2 확정/유력 + 가정식) 중 냉장고 주재료와
    // 맞는 것을 후보에 합친다 — 셰프 결의 요리가 재료로 직접 추천되도록.
    if (chef && chef.id) {
      const cui = chef.cuisine || ''
      const rep = [
        ...(CHEF_RECIPES[chef.id] || []).map(r => ({ name: r.name, cuisine: cui, ingredients: r.ingredients })),
        ...((SEASON2_CHEFS[chef.id] && SEASON2_CHEFS[chef.id].dishes) || [])
          .map(d => ({ name: d.dish.split(' — ')[0].replace(/\([^)]*\)/g, '').trim(), cuisine: cui, ingredients: d.ingredients }))
      ]
      const repCands = dishesToCandidates(rep, ings).filter(c => c.haveMain && c.haveMain.length > 0)
      const seen = new Set(cands.map(c => c.name))
      for (const rc of repCands) if (rc.name && !seen.has(rc.name)) { cands.push(rc); seen.add(rc.name) }
      cands = cands.slice(0, 24)
    }

    // 후보가 0개(냉장고가 비었거나 양념만 있을 때) — 셰프를 골랐다면 그 셰프의 "레퍼토리"
    // (도메인 일반요리 + 시즌2 확정 + 가정식 레시피)에서 매번 섞어 뽑아(회전) "추천 없음"을 방지.
    // sparse=true로 표시해 프론트가 "재료를 더 넣으면 더 잘 맞춰드려요" 안내를 띄운다.
    let sparse = false
    if (cands.length === 0 && chef && chef.id) {
      const cui = chef.cuisine || ''
      const doms = (Array.isArray(chef.domains) && chef.domains.length) ? chef.domains : (cui ? [cui] : [])
      const domainDishes = RECIPE_DB.filter(r => doms.includes(r.cuisine))
        .map(r => ({ name: r.name, cuisine: r.cuisine, ingredients: r.ingredients }))
      const s2dishes = ((SEASON2_CHEFS[chef.id] && SEASON2_CHEFS[chef.id].dishes) || [])
        .filter(d => d.conf === 'high')
        .map(d => ({ name: d.dish.split(' — ')[0].replace(/\([^)]*\)/g, '').trim(), cuisine: cui, ingredients: d.ingredients }))
      const refDishes = (CHEF_RECIPES[chef.id] || []).map(r => ({ name: r.name, cuisine: cui, ingredients: r.ingredients }))
      // 합치고 이름 중복 제거 → 셔플(회전) → 14개로 추림
      const seen = new Set(); const pool = []
      for (const d of [...refDishes, ...s2dishes, ...domainDishes]) {
        if (!d.name || seen.has(d.name)) continue
        seen.add(d.name); pool.push(d)
      }
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
      cands = dishesToCandidates(pool.slice(0, 14), ings)
      sparse = cands.length > 0
    }

    // 후보 요약 (3단 모델 grounding용) — 부족 재료를 '주재료'와 '양념'으로 분리해 매칭 품질을 높인다.
    const candText = cands.map(c => {
      const mm = (c.missingMain && c.missingMain.length) ? c.missingMain.join('·') : '없음'
      const ms = (c.missingSeasoning && c.missingSeasoning.length) ? c.missingSeasoning.join('·') : '없음'
      return `${c.name}[${c.cuisine}] 부족주재료:${mm} / 부족양념:${ms}`
    }).join('\n')

    // 셰프 페르소나 블록
    let chefBlock = ''
    if (chef && chef.name) {
      chefBlock = '\n[셰프] ' + chef.name + ' — ' + (chef.hint || chef.style || '')
      if (chef.menu && chef.menu.length) chefBlock += '\n그의 레스토랑 "' + (chef.restaurant || '') + '" 대표 메뉴: ' + chef.menu.join(', ') + '.'
      const refs = (chef.id && CHEF_RECIPES[chef.id]) || []
      if (refs.length) chefBlock += '\n이 셰프의 실제 요리 예: ' + refs.slice(0, 3).map(r => r.name).join(', ') + '.'
      const s2 = (chef.id && season2Signatures(chef.id, 6)) || []
      if (s2.length) chefBlock += '\n이 셰프가 시즌2에서 실제 선보인 요리 경향: ' + s2.join(', ') + '.'
    }
    const styleLine = (style && String(style).trim())
      ? '\n[사용자 요구] "' + String(style).trim() + '" — 이 요구를 반영해 변형해.'
      : ''
    const fastLine = fast ? '\n[제약] 반드시 15분 이내 조리 가능한 것만 고르고 단계를 단순화.' : ''
    const sigLine = sparse ? '\n[안내] 냉장고에 마땅한 재료가 없어 이 셰프의 레퍼토리에서 후보를 제시한다. 사야 할 재료(missing)가 많아도 괜찮으니, 후보 중 서로 다른 결의 요리를 다양하게 추천하라.' : ''
    // 사진 재료 ↔ 요리 매칭 규칙: 주재료는 냉장고(사진)에서, 양념은 사서 추가.
    const matchRule = '\n[매칭 규칙] 주재료(고기·해산물·채소·면·밥 등)는 가능한 한 냉장고(사진)에 있는 재료를 주인공으로 삼아라.' +
      ' 후보의 "부족주재료"가 없거나 적은 요리를 우선 고른다. "missing"(살 재료)에는 주로 양념·조미료를 넣고,' +
      ' 주재료는 사진에 정말 없고 그 요리에 꼭 필요할 때만 최소한으로 추가해라. 냉장고에 이미 있는 재료는 missing에 넣지 마.'

    // 3단 — 후보 중 셰프 스타일에 맞게 골라 정밀 변형
    const personaInstr = (chef && chef.name)
      ? '아래 "후보 요리"는 사용자의 냉장고 재료로 만들 수 있는 요리들이다. ' + chef.name +
        ' 셰프라면 이 재료로 무엇을 만들지 상상해, 후보의 재료를 살려 그 셰프의 기법·재료감각·플레이팅으로 재해석해 제시해. ' +
        '후보가 그 셰프의 분야(양식/중식/일식 등)와 달라도 괜찮다 — 냉장고를 부탁해처럼, 재료를 그 셰프 스타일의 새 요리로 변형하면 된다(요리명도 그에 맞게 바꿔라). ' +
        '핵심 재료는 냉장고에 있는 것을 쓰고, 절대 빈손으로 두지 말고 후보를 근거로 최소 3개(가능하면 5개)를 반드시 제시해. 다만 냉장고에 단서가 전혀 없는 생뚱맞은 요리를 새로 지어내진 마.'
      : '아래 "후보 요리"는 사용자의 냉장고 재료로 만들 수 있는 요리들이다. 이 중 냉장고로 만들기 좋은 것을 골라 최소 3개 제시해. 후보에 없는 엉뚱한 요리는 지어내지 마.'

    const text = await askClaude({
      system: '너는 셰프 페르소나로 요리를 추천·변형하는 전문 요리사다. 주어진 후보 요리만을 근거로, 한국어로 JSON 배열만 출력한다. 설명·문장 금지.',
      content: [{ type: 'text', text:
        '냉장고 재료: ' + JSON.stringify(ings) + chefBlock + styleLine + fastLine + sigLine +
        '\n\n[후보 요리]\n' + (candText || '(후보 없음)') + '\n\n' + personaInstr + matchRule +
        ' 최대 5개를 [{"name":요리명,"missing":[냉장고에 없어 사야 할 재료 — 주로 양념·조미료, 꼭 필요한 주재료만],"note":"셰프 스타일이 드러나는 한 줄 설명","time":예상조리시간(분,정수),"steps":["단계1","단계2","단계3"]}] JSON 배열로만 답해. steps는 따라할 수 있게 3~5단계.' }],
      maxTokens: 1800
    })

    const recipes = parseJsonArray(text).map(x => ({
      name: x && x.name ? String(x.name) : '',
      missing: x && Array.isArray(x.missing) ? x.missing.map(String) : [],
      note: x && x.note ? String(x.note) : '',
      time: x && (typeof x.time === 'number' || typeof x.time === 'string') ? String(x.time) : '',
      steps: x && Array.isArray(x.steps) ? x.steps.map(String) : []
    })).filter(x => x.name)
    res.status(200).json({ recipes, sparse })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
