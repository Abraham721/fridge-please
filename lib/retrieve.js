// 1단 검색 — 냉장고 재료와 겹치는 요리를 DB에서 점수화해 후보를 뽑는다. AI 없이 코드로(무료·grounded).
import { RECIPE_DB } from './recipeDB.js'

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').trim()

// 양념·조미료·기름·가루·향신채 — 사진에 안 보여도 '사서 추가'가 자연스러운 재료.
// 주재료(고기·해산물·채소·면·밥 등)는 가능한 한 사진(냉장고)에서 와야 하므로 이 목록과 구분한다.
const SEASONINGS = new Set([
  '간장', '진간장', '국간장', '소금', '설탕', '후추', '식초', '맛술', '미림', '고추장', '된장', '쌈장', '춘장',
  '고춧가루', '고추기름', '두반장', '굴소스', '액젓', '피시소스', '새우젓', '참기름', '들기름', '식용유', '올리브유',
  '버터', '마요네즈', '케첩', '꿀', '조청', '물엿', '와사비', '겨자', '마늘', '생강', '대파', '쪽파', '파',
  '전분', '녹말', '밀가루', '부침가루', '튀김가루', '빵가루', '다시마', '가츠오부시', '육수', '다시', '사골육수',
  '페퍼론치노', '페페론치노', '바질', '파슬리', '허브', '로즈마리', '타임', '오레가노', '화이트와인', '레드와인',
  '발사믹', '레몬', '라임', '참깨', '깨', '들깨', '우스터소스', '파마산', '페코리노', '노추', '우나기소스', '단무지'
])
function isSeasoning(name) {
  const n = norm(name)
  if (!n) return false
  if (SEASONINGS.has(n)) return true
  // 부분 매칭: ~소스 / ~가루 / ~기름 / ~젓 / ~장 으로 끝나는 조미료류
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

// userIngredients: 사용자 냉장고 재료(주로 사진 인식 결과)
// domains: 셰프가 다루는 분류 태그 배열 (없거나 빈 배열이면 전체 분류 대상)
// opts: { maxMissing=2, limit=24 }
//   maxMissing = '부족한 주재료'(비양념) 허용치. 사진 재료와 요리가 어긋나지 않도록 주재료 부족만 엄격히 제한.
//   양념류 부족은 자유롭게 허용 — 사서 추가하는 게 자연스럽기 때문.
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
    const haveMain = haveList.filter(ing => !isSeasoning(ing))   // 사진에서 온 '주재료' 매칭
    if (haveMain.length === 0) continue                          // 양념만 겹치는 후보는 제외
    const missList = r.ingredients.filter(ing => !have.some(h => match(h, ing)))
    const missMain = missList.filter(ing => !isSeasoning(ing))   // 부족한 '주재료'
    const missSeason = missList.filter(ing => isSeasoning(ing))  // 부족한 '양념'(사서 추가)
    if (missMain.length > maxMissing) continue                   // 주재료가 너무 모자라면 탈락
    scored.push({
      name: r.name, cuisine: r.cuisine, ingredients: r.ingredients,
      have: haveList, missing: missList, missingMain: missMain, missingSeasoning: missSeason,
      _missMain: missMain.length, _haveMain: haveMain.length,
      _miss: missList.length, _ratio: haveList.length / r.ingredients.length
    })
  }
  // 부족 주재료 적은 순 → 주재료 매칭 많은 순 → 보유비율 높은 순 → 총부족 적은 순
  scored.sort((a, b) =>
    a._missMain - b._missMain ||
    b._haveMain - a._haveMain ||
    b._ratio - a._ratio ||
    a._miss - b._miss)
  return scored.slice(0, limit).map(({ _missMain, _haveMain, _miss, _ratio, ...rest }) => rest)
}
