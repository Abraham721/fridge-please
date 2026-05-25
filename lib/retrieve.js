// 1단 검색 — 냉장고 재료와 요리를 "요리×재료 가중 행렬"로 보고 점수화한다. AI 없이 코드로(무료·grounded·<1ms).
// 점수 = 코사인 유사도 변형: 매칭된 재료의 (주재료/양념 가중 × TF-IDF 희소도)를 요리 norm으로 정규화.
//  - TF-IDF: 흔한 재료(마늘·대파)는 변별력↓, 드문 재료(갈치·관자)는 요리를 강하게 특정 → 조합의 의미를 반영.
//  - 주재료=1.0 / 양념=0.3 가중: 주재료가 맞아야 진짜 그 요리.
import { RECIPE_DB } from './recipeDB.js'

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').trim()

// 양념·조미료·기름·가루·향신채 — 사진에 안 보여도 '사서 추가'가 자연스러운 재료.
const SEASONINGS = new Set([
  '간장', '진간장', '국간장', '소금', '설탕', '후추', '식초', '맛술', '미림', '고추장', '된장', '쌈장', '춘장',
  '고춧가루', '고추기름', '두반장', '굴소스', '액젓', '피시소스', '새우젓', '참기름', '들기름', '식용유', '올리브유',
  '버터', '마요네즈', '케첩', '꿀', '조청', '물엿', '와사비', '겨자', '마늘', '생강', '대파', '쪽파', '파',
  '전분', '녹말', '밀가루', '부침가루', '튀김가루', '빵가루', '다시마', '가츠오부시', '육수', '다시', '사골육수',
  '페퍼론치노', '페페론치노', '바질', '파슬리', '허브', '로즈마리', '타임', '오레가노', '화이트와인', '레드와인',
  '발사믹', '레몬', '라임', '참깨', '깨', '들깨', '우스터소스', '파마산', '페코리노', '노추', '우나기소스', '단무지',
  '청주', '핫소스', '카레가루', '해산물육수'
])
function isSeasoning(name) {
  const n = norm(name)
  if (!n) return false
  if (SEASONINGS.has(n)) return true
  return n.length >= 2 && /(소스|가루|기름|젓|장)$/.test(n)
}

// 재료명 매칭 — 완전일치 또는 (2글자 이상) 부분포함. '파'가 '파프리카'에 오매칭되는 것 방지.
function match(a, b) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const short = x.length <= y.length ? x : y
  const long = x.length <= y.length ? y : x
  return short.length >= 2 && long.includes(short)
}

// ── 사전계산(모듈 로드 1회): 재료별 문서빈도(df) → IDF, 요리별 가중 norm ────────────
const N = RECIPE_DB.length
const DF = new Map()
for (const r of RECIPE_DB) {
  const uniq = new Set(r.ingredients.map(norm))
  for (const k of uniq) DF.set(k, (DF.get(k) || 0) + 1)
}
function idf(ing) {
  const df = DF.get(norm(ing)) || 0
  return Math.log((N + 1) / (df + 1)) + 1 // 평활화, 항상 > 0
}
function weight(ing) {
  return (isSeasoning(ing) ? 0.3 : 1.0) * idf(ing)
}
// 요리별 가중 벡터 norm(||dish||) 사전계산 — 코사인 정규화용
const DISH_NORM = new Map()
for (const r of RECIPE_DB) {
  let sq = 0
  for (const ing of r.ingredients) { const w = weight(ing); sq += w * w }
  DISH_NORM.set(r.name, Math.sqrt(sq) || 1)
}
// 요리의 대표 주재료(가장 희소한 주재료) — 다양성(같은 주재료 과다 노출 방지)용
function dominantMain(r) {
  let best = null, bw = -1
  for (const ing of r.ingredients) {
    if (isSeasoning(ing)) continue
    const w = idf(ing)
    if (w > bw) { bw = w; best = norm(ing) }
  }
  return best
}

// userIngredients: 냉장고 재료 / domains: 셰프 분류 태그 배열 / opts:{maxMissing,limit}
//   maxMissing = 부족 '주재료' 허용치(사진↔요리 어긋남 방지). 양념 부족은 자유 허용.
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
    const haveMain = haveList.filter(ing => !isSeasoning(ing))
    if (haveMain.length === 0) continue                          // 양념만 겹치는 후보 제외
    const missList = r.ingredients.filter(ing => !have.some(h => match(h, ing)))
    const missMain = missList.filter(ing => !isSeasoning(ing))
    const missSeason = missList.filter(ing => isSeasoning(ing))
    if (missMain.length > maxMissing) continue
    // 코사인 변형 점수: 매칭재료 가중합 / ||dish|| (냉장고 norm은 쿼리 내 상수라 랭킹에서 생략)
    let dot = 0
    for (const ing of haveList) dot += weight(ing)
    const score = dot / DISH_NORM.get(r.name)
    scored.push({
      name: r.name, cuisine: r.cuisine, ingredients: r.ingredients,
      have: haveList, missing: missList, missingMain: missMain, missingSeasoning: missSeason,
      _score: score, _missMain: missMain.length, _dom: dominantMain(r)
    })
  }
  // 점수 높은 순 → 부족 주재료 적은 순 → 총부족 적은 순
  scored.sort((a, b) =>
    b._score - a._score ||
    a._missMain - b._missMain ||
    a.missing.length - b.missing.length)
  // 경량 다양성: 같은 대표 주재료 요리는 최대 3개까지만(나머지는 뒤로 미룸)
  const picked = [], deferred = [], seen = new Map()
  for (const c of scored) {
    const k = c._dom || '_'
    const n = seen.get(k) || 0
    if (n < 3) { picked.push(c); seen.set(k, n + 1) } else deferred.push(c)
    if (picked.length >= limit) break
  }
  const out = picked.concat(deferred).slice(0, limit)
  return out.map(({ _score, _missMain, _dom, ...rest }) => rest)
}

// 임의의 요리 목록([{name,cuisine,ingredients}])을 후보 형태로 변환(필터 없음).
// 후보가 0개일 때 셰프 시그니처/레퍼토리를 폴백 후보로 쓰기 위함.
export function dishesToCandidates(dishes, userIngredients) {
  const have = (userIngredients || []).map(String).filter(Boolean)
  return (dishes || []).filter(r => r && r.name && Array.isArray(r.ingredients)).map(r => {
    const haveList = r.ingredients.filter(ing => have.some(h => match(h, ing)))
    const missList = r.ingredients.filter(ing => !have.some(h => match(h, ing)))
    return {
      name: r.name, cuisine: r.cuisine || '', ingredients: r.ingredients,
      have: haveList, haveMain: haveList.filter(ing => !isSeasoning(ing)), missing: missList,
      missingMain: missList.filter(ing => !isSeasoning(ing)),
      missingSeasoning: missList.filter(ing => isSeasoning(ing))
    }
  })
}
