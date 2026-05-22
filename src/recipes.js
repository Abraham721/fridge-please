export function normalize(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').trim()
}

// 두 재료 이름이 사실상 같은지(공백 무시 + 부분 포함) 느슨하게 비교
export function looseEq(a, b) {
  const x = normalize(a), y = normalize(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export const RECIPES = [
  { name: '김치볶음밥', emoji: '🍳', ingredients: ['밥', '김치', '대파', '계란', '식용유'] },
  { name: '계란말이', emoji: '🥚', ingredients: ['계란', '대파', '소금', '식용유'] },
  { name: '두부김치', emoji: '🥘', ingredients: ['두부', '김치', '돼지고기', '대파', '참기름'] },
  { name: '김치찌개', emoji: '🍲', ingredients: ['김치', '돼지고기', '두부', '대파', '고춧가루'] },
  { name: '된장찌개', emoji: '🍲', ingredients: ['된장', '두부', '애호박', '양파', '대파', '감자'] },
  { name: '라면', emoji: '🍜', ingredients: ['라면', '계란', '대파'] },
  { name: '계란후라이', emoji: '🍳', ingredients: ['계란', '식용유', '소금'] },
  { name: '볶음우동', emoji: '🍝', ingredients: ['우동면', '양파', '양배추', '간장', '식용유'] },
  { name: '토마토파스타', emoji: '🍝', ingredients: ['파스타', '토마토소스', '마늘', '양파', '올리브유'] },
  { name: '오므라이스', emoji: '🍳', ingredients: ['밥', '계란', '양파', '케첩', '햄'] },
  { name: '잡채', emoji: '🍜', ingredients: ['당면', '시금치', '당근', '양파', '간장', '소고기'] },
  { name: '감자조림', emoji: '🥔', ingredients: ['감자', '간장', '설탕', '마늘'] },
  { name: '미역국', emoji: '🥣', ingredients: ['미역', '소고기', '마늘', '간장', '참기름'] },
  { name: '야채볶음', emoji: '🥦', ingredients: ['양배추', '당근', '양파', '간장', '식용유'] },
  { name: '참치마요덮밥', emoji: '🍚', ingredients: ['밥', '참치캔', '마요네즈', '계란', '김'] },
  { name: '떡볶이', emoji: '🌶️', ingredients: ['떡', '고추장', '어묵', '대파', '설탕'] },
  { name: '부대찌개', emoji: '🍲', ingredients: ['햄', '소시지', '김치', '두부', '라면', '대파'] },
  { name: '김밥', emoji: '🍙', ingredients: ['밥', '김', '단무지', '계란', '당근', '햄'] }
]

export function findRecipe(name) {
  return RECIPES.find(r => looseEq(r.name, name)) || null
}

// 가진 재료(have)로 만들 수 있는/거의 되는 요리 계산
export function matchRecipes(have, recipes = RECIPES) {
  const scored = recipes.map(r => {
    const missing = r.ingredients.filter(i => !have.some(h => looseEq(h, i)))
    return { ...r, missing }
  })
  const makeable = scored.filter(r => r.missing.length === 0)
  const almost = scored
    .filter(r => r.missing.length > 0 && r.missing.length <= 2)
    .sort((a, b) => a.missing.length - b.missing.length)
  return { makeable, almost }
}
