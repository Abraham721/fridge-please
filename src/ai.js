// 프론트엔드는 API 키를 모른다. 우리 서버리스 함수(/api/*)만 호출한다.
async function postJson(path, body) {
  let r
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch (e) {
    throw new Error('서버에 연결 못 했어요 (배포본 또는 vercel dev에서 동작).')
  }
  if (!r.ok) {
    let msg = ''
    try { msg = (await r.json()).error || '' } catch (e) {}
    throw new Error('서버 ' + r.status + (msg ? (': ' + msg) : ''))
  }
  return r.json()
}
export async function detectIngredients(dataUrl) {
  const d = await postJson('/api/detect', { image: dataUrl })
  return (d && d.ingredients) || []
}
export async function detectReceipt(dataUrl) {
  const d = await postJson('/api/receipt', { image: dataUrl })
  return (d && d.ingredients) || []
}
export async function recommendRecipes(ingredients, chef, opts) {
  const o = opts || {}
  const d = await postJson('/api/recommend', { ingredients, chef: chef || null, style: o.style || '', fast: !!o.fast })
  return { recipes: (d && d.recipes) || [], sparse: !!(d && d.sparse) }
}
export async function dishIngredients(dish) {
  const d = await postJson('/api/dish', { dish })
  return (d && d.ingredients) || []
}
export async function recipeDetail(name, ingredients, chef, opts) {
  const o = opts || {}
  return await postJson('/api/recipe', { name, ingredients, chef: chef || null, style: o.style || '', fast: !!o.fast })
}
export async function planMeals(ingredients, chef, opts) {
  const o = opts || {}
  return await postJson('/api/mealplan', {
    ingredients,
    chef: chef || null,
    days: o.days || 3,
    mealsPerDay: o.mealsPerDay || 3,
    people: o.people || 2,
    style: o.style || '',
    avoid: o.avoid || []
  })
}
