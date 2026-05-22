// 프론트엔드는 API 키를 모른다. 우리 서버리스 함수(/api/*)만 호출한다. 키는 서버(Vercel) 환경변수에만.
async function postJson(path, body) {
  let r
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch (e) {
    throw new Error('서버에 연결 못 했어요 (로컬 vite에는 백엔드가 없어요. 배포본 또는 vercel dev 에서 동작).')
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

export async function recommendRecipes(ingredients, chef) {
  const d = await postJson('/api/recommend', { ingredients, chef: chef || null })
  return (d && d.recipes) || []
}

export async function dishIngredients(dish) {
  const d = await postJson('/api/dish', { dish })
  return (d && d.ingredients) || []
}
