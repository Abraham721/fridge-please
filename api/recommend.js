import { askClaude, parseJsonArray } from '../lib/anthropic.js'
import { CHEF_RECIPES } from '../lib/chefRecipes.js'
import { retrieveCandidates, dishesToCandidates, mainIngredients } from '../lib/retrieve.js'
import { RECIPE_DB } from '../lib/recipeDB.js'
import { season2Signatures, SEASON2_CHEFS } from '../lib/season2.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { ingredients, chef, style, fast } = req.body || {}
    const ings = Array.isArray(ingredients) ? ingredients.map(String).filter(Boolean) : []
    const mains = mainIngredients(ings)   // 주재료(양념 제외) — 추천 앵커
    const domains = (chef && Array.isArray(chef.domains) && chef.domains.length) ? chef.domains : null

    // ── 3-티어 후보 빌드 ──
    // 매칭은 두 행렬의 곱처럼 본다: (재료×요리) ⊗ (셰프×요리 친밀도).
    // 티어 A = 셰프 본인 레퍼토리(시즌2+가정식) ∩ 재료, 친밀도 최대.
    // 티어 B = 일반 풀 ∩ 셰프 cuisine 도메인 ∩ 재료, 같은 결의 영감.
    // 티어 C = 일반 풀(도메인 무관) ∩ 재료, A+B가 빈약할 때 영감 보강.
    let tierA = []
    if (chef && chef.id) {
      const cui = chef.cuisine || ''
      const rep = [
        ...(CHEF_RECIPES[chef.id] || []).map(r => ({ name: r.name, cuisine: cui, ingredients: r.ingredients })),
        ...((SEASON2_CHEFS[chef.id] && SEASON2_CHEFS[chef.id].dishes) || [])
          .map(d => ({ name: d.dish.split(' — ')[0].replace(/\([^)]*\)/g, '').trim(), cuisine: cui, ingredients: d.ingredients }))
      ]
      tierA = dishesToCandidates(rep, ings).filter(c => c.haveMain && c.haveMain.length > 0)
      tierA.forEach(c => { c._tier = 'A' })
    }
    let tierB = []
    if (domains) {
      tierB = retrieveCandidates(ings, domains, { maxMissing: 2, limit: 16 })
      if (tierB.length < 3) tierB = retrieveCandidates(ings, domains, { maxMissing: 3, limit: 16 })
      tierB.forEach(c => { c._tier = 'B' })
    }
    let tierC = []
    if ((tierA.length + tierB.length) < 8) {
      tierC = retrieveCandidates(ings, null, { maxMissing: 2, limit: 12 })
      if (tierC.length === 0) tierC = retrieveCandidates(ings, null, { maxMissing: 3, limit: 12 })
      tierC.forEach(c => { c._tier = 'C' })
    }
    // 머지(이름 중복 제거, 우선순위 A > B > C)
    const seenName = new Set()
    let cands = []
    for (const lst of [tierA, tierB, tierC]) {
      for (const c of lst) if (c.name && !seenName.has(c.name)) { cands.push(c); seenName.add(c.name) }
    }
    cands = cands.slice(0, 24)

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

    // 후보 요약 — 티어별로 묶어 모델에게 우선순위를 명시.
    const fmt = c => {
      const mm = (c.missingMain && c.missingMain.length) ? c.missingMain.join('·') : '없음'
      const ms = (c.missingSeasoning && c.missingSeasoning.length) ? c.missingSeasoning.join('·') : '없음'
      return `${c.name}[${c.cuisine}] 부족주재료:${mm} / 부족양념:${ms}`
    }
    const groupA = cands.filter(c => c._tier === 'A').map(fmt)
    const groupB = cands.filter(c => c._tier === 'B').map(fmt)
    const groupC = cands.filter(c => c._tier === 'C').map(fmt)
    const candTextParts = []
    if (groupA.length) candTextParts.push('[A · 이 셰프의 실제 요리 (최우선)]\n' + groupA.join('\n'))
    if (groupB.length) candTextParts.push('[B · 일반 풀 · 같은 분야]\n' + groupB.join('\n'))
    if (groupC.length) candTextParts.push('[C · 일반 풀 · 영감용]\n' + groupC.join('\n'))
    const candText = candTextParts.join('\n\n')

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
    // 3단 — 후보 중 셰프 스타일에 맞게 골라 정밀 변형
    const personaInstr = (chef && chef.name)
      ? '우선순위 규칙: ' +
        '먼저 [A · 이 셰프의 실제 요리]에서 사용자 주재료를 쓰는 것을 골라 그대로(또는 살짝 변주) 추천하라. ' +
        '[A]에 마땅찮으면 [B · 같은 분야]에서 골라 ' + chef.name + ' 스타일로 변주하라. ' +
        '[B]도 부족하면 [C · 영감용]에서 골라 ' + chef.name + ' 스타일로 적극 재해석하라. ' +
        '항상 사용자가 가진 주재료(특히 고기·해산물·생선)를 메인으로 쓰고, 주재료를 하나도 안 쓰는 요리는 절대 추천하지 마라. ' +
        '주재료를 살릴 마땅한 후보가 없으면 그 주재료를 주인공으로 하되 부족한 핵심 재료 1~2개를 missing에 넣어 "이걸 추가하면 이 요리" 식으로 제안하라. ' +
        '여러 주재료를 함께 살릴 수 있으면 한 접시 요리로 묶어라(예: 조개·가리비·전복 → 해물 한 접시). ' +
        '최소 3개(가능하면 5개)를 ' + chef.name + ' 스타일로 제시하고, 변형에 맞게 요리명을 바꿔도 좋다.'
      : '사용자 냉장고의 주재료를 주인공으로 하는 요리를 추천하라. 주재료를 메인으로 쓰는 요리만 고르고, 마땅찮으면 핵심 재료 1~2개를 missing에 넣어 "이걸 추가하면 이 요리" 식으로 제안하라. 최소 3개 제시. 근거 없는 요리는 지어내지 마라.'

    const text = await askClaude({
      system: '너는 셰프 페르소나로 요리를 추천·변형하는 전문 요리사다. 사용자가 실제로 가진 재료(특히 주재료)를 주인공으로 삼아, 한국어로 JSON 배열만 출력한다. 사용자가 없는 재료를 주재료로 지어내지 말 것. 설명·문장 금지.',
      content: [{ type: 'text', text:
        '[냉장고 전체] ' + JSON.stringify(ings) +
        '\n[주재료(주인공 후보)] ' + (mains.length ? mains.join(', ') : '(없음)') + ' — 이 중 가장 메인으로 적합한 재료를 주인공으로 삼아라(고기·해산물·생선을 채소보다 우선, 여러 개면 함께 살려라).' +
        chefBlock + styleLine + fastLine + sigLine +
        '\n\n[참고 후보(영감용)]\n' + (candText || '(없음)') + '\n\n' + personaInstr +
        ' 최대 5개를 [{"name":요리명,"missing":[냉장고에 없어 사야 할 재료 — 양념과 꼭 필요한 핵심 재료],"note":"셰프 스타일이 드러나는 한 줄 설명","time":예상조리시간(분,정수),"steps":["단계1","단계2","단계3"]}] JSON 배열로만 답해. steps는 따라할 수 있게 3~5단계.' }],
      maxTokens: 1800
    })

    let recipes = parseJsonArray(text).map(x => ({
      name: x && x.name ? String(x.name) : '',
      missing: x && Array.isArray(x.missing) ? x.missing.map(String) : [],
      note: x && x.note ? String(x.note) : '',
      time: x && (typeof x.time === 'number' || typeof x.time === 'string') ? String(x.time) : '',
      steps: x && Array.isArray(x.steps) ? x.steps.map(String) : []
    })).filter(x => x.name)
    // 안전장치: 모델이 빈손(거부·파싱실패)이면 후보 상위를 노출. 후보는 retrieve가 TF-IDF로
    // 정렬해 사용자의 주재료를 가장 잘 쓰는 요리가 앞에 오므로(예: 전복 → 전복죽) 관련성 유지.
    // (API 호출 자체 실패는 catch에서 500 → 에러 배너로 별도 표시)
    if (recipes.length === 0 && cands.length > 0) {
      recipes = cands.slice(0, 5).map(c => ({
        name: c.name,
        missing: Array.isArray(c.missing) ? c.missing : [],
        note: (chef && chef.name) ? (chef.name + ' 스타일로 — 누르면 상세 레시피') : '냉장고 재료 기반 추천',
        time: '', steps: []
      }))
    }
    // 응답 직전 내부 메타(_tier) 제거 — 외부에 노출하지 않음
    cands.forEach(c => { delete c._tier })
    res.status(200).json({ recipes, sparse })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
