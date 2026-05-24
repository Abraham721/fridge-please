// 1단 검색 — 냉장고 재료와 겹치는 요리를 DB에서 점수화해 후보를 뽑는다. AI 없이 코드로(무료·grounded).
import { RECIPE_DB } from './recipeDB.js'

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').trim()

// 재료명 매칭 — 완전일치 또는 (2글자 이상) 부분포함. '파'가 '파프리카'에 오매칭되는 것 방지.
function match(a, b) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const short = x.length <= y.length ? x : y
  const long = x.length <= y.length ? y : x
  return short.length >= 2 && long.includes(short)
}

// userIngredients: 사용자 냉장고 재료 배열
// domains: 셰프가 다루는 분류 태그 배열 (없거나 빈 배열이면 전체 분류 대상)
// opts: { maxMissing=2, limit=24 }
export function retrieveCandidates(userIngredients, domains, opts = {}) {
  const maxMissing = opts.maxMissing == null ? 2 : opts.maxMissing
  const limit = opts.limit == null ? 24 : opts.limit
  const have = (userIngredients || []).map(String).filter(Boolean)
  const useDomains = Array.isArray(domains) && domains.length > 0
  const scored = []
  for (const r of RECIPE_DB) {
    if (useDomains && !domains.includes(r.cuisine)) continue
    const haveList = r.ingredients.filter(ing => have.some(h => match(h, ing)))
    if (haveList.length === 0) continue
    const missList = r.ingredients.filter(ing => !have.some(h => match(h, ing)))
    if (missList.length > maxMissing) continue
    scored.push({
      name: r.name, cuisine: r.cuisine, ingredients: r.ingredients,
      have: haveList, missing: missList,
      _miss: missList.length, _have: haveList.length, _ratio: haveList.length / r.ingredients.length
    })
  }
  // 부족재료 적은 순 → 보유비율 높은 순 → 매칭개수 많은 순
  scored.sort((a, b) => a._miss - b._miss || b._ratio - a._ratio || b._have - a._have)
  return scored.slice(0, limit).map(({ _miss, _have, _ratio, ...rest }) => rest)
}
