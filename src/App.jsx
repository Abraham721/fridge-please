import React, { useEffect, useState, useRef } from 'react'
import { RECIPES, findRecipe, looseEq } from './recipes.js'
import { CHEFS, findChef } from './chefs.js'
import { parseVoiceIngredients } from './voice.js'
import { detectIngredients, detectReceipt, recommendRecipes, dishIngredients, recipeDetail } from './ai.js'

const LS_ING = 'fp_ingredients'
const LS_CHEF = 'fp_chef'
const LS_META = 'fp_fridge_meta'
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f } catch (e) { return f } }
const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
})
// 업로드 전 브라우저에서 축소·압축 (폰 사진이 커서 서버 413 나는 것 방지)
const fileToSmallDataUrl = (file, max = 1024, quality = 0.8) => new Promise(async (res) => {
  try {
    const raw = await fileToDataUrl(file)
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s) }
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      try { res(c.toDataURL('image/jpeg', quality)) } catch (e) { res(raw) }
    }
    img.onerror = () => res(raw)
    img.src = raw
  } catch (e) { res(await fileToDataUrl(file)) }
})

const DECOS = [
  { e: '🎀', top: '2%', left: '3%' }, { e: '💎', top: '10%', right: '4%' },
  { e: '⭐', top: '34%', left: '2%' }, { e: '🍒', top: '52%', right: '3%' },
  { e: '💕', top: '70%', left: '3%' }, { e: '⭐', top: '88%', right: '6%' },
  { e: '🌈', top: '46%', left: '5%' }, { e: '🎀', top: '92%', left: '8%' }
]

function ChefLoader({ chef, message }) {
  const emoji = (chef && chef.emoji) || '👨‍🍳'
  return (
    <div className="chefloader">
      <div className="cl-stage" aria-hidden="true">
        <span className="cl-chef">{emoji}</span>
        <span className="cl-pan">🍳</span>
        <span className="cl-steam"><span>·</span><span>·</span><span>·</span></span>
      </div>
      <div className="cl-msg">{message}<span className="cl-dots"></span></div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('fridge')
  const [ingredients, setIngredients] = useState(() => load(LS_ING, []))
  const [chefId, setChefId] = useState(() => load(LS_CHEF, ''))
  const [input, setInput] = useState('')
  const [style, setStyle] = useState('')
  const [fast, setFast] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [fridgeMeta, setFridgeMeta] = useState(() => load(LS_META, {}))
  const [aiRecipes, setAiRecipes] = useState(null)
  const [sparse, setSparse] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [target, setTarget] = useState('')
  const [cook, setCook] = useState(null)

  useEffect(() => { localStorage.setItem(LS_ING, JSON.stringify(ingredients)) }, [ingredients])
  useEffect(() => { localStorage.setItem(LS_CHEF, JSON.stringify(chefId)) }, [chefId])
  useEffect(() => { localStorage.setItem(LS_META, JSON.stringify(fridgeMeta)) }, [fridgeMeta])

  const chef = findChef(chefId)

  const addIngredient = (name) => {
    const n = (name || '').trim()
    if (!n) return
    setIngredients(prev => (prev.some(x => looseEq(x, n)) ? prev : [...prev, n]))
    setFridgeMeta(prev => prev[n] ? prev : { ...prev, [n]: { addedAt: new Date().toISOString().slice(0,10) } })
  }
  const removeIngredient = (name) => { setIngredients(prev => prev.filter(x => x !== name)); setFridgeMeta(prev => { const m={...prev}; delete m[name]; return m }) }

  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(''); setBusy('사진에서 재료 인식 중…')
    try {
      const items = await detectIngredients(await fileToSmallDataUrl(file))
      setIngredients(prev => { const m = [...prev]; for (const it of items) if (!m.some(x => looseEq(x, it))) m.push(it); return m })
    }
    catch (err) { setError('사진 인식 실패: ' + err.message) }
    finally { setBusy('') }
  }

  async function onReceipt(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(''); setBusy('영수증에서 식재료 읽는 중…')
    try {
      const items = await detectReceipt(await fileToSmallDataUrl(file))
      setIngredients(prev => { const m = [...prev]; for (const it of items) if (!m.some(x => looseEq(x, it))) m.push(it); return m })
      const today = new Date().toISOString().slice(0,10)
      setFridgeMeta(prev => { const m = { ...prev }; for (const it of items) if (!m[it]) m[it] = { addedAt: today }; return m })
    }
    catch (err) { setError('영수증 인식 실패: ' + err.message) }
    finally { setBusy('') }
  }

  async function onAiRecommend() {
    setError(''); setShowResults(true); setAiRecipes(null); setDetail(null); setSparse(false)
    setBusy((chef ? (chef.name + ' 추천 중') : 'AI 추천 중') + (fast ? ' (15분 이내)' : '') + '…')
    try { const res = await recommendRecipes(ingredients, chef, { style, fast }); setAiRecipes(res.recipes); setSparse(res.sparse) }
    catch (err) { setError('추천 실패: ' + err.message); setShowResults(false) }
    finally { setBusy('') }
  }

  async function openDetail(name) {
    setDetail({ name, ingredients: [], steps: [], tip: '', time: '' }); setDetailBusy(true)
    try { setDetail(await recipeDetail(name, ingredients, chef, { style, fast })) }
    catch (err) { setError('레시피 실패: ' + err.message); setDetail(null) }
    finally { setDetailBusy(false) }
  }

  function closeResults() { setShowResults(false); setDetail(null) }

  async function onCook(name) {
    const dish = (name || target).trim()
    if (!dish) return
    setError(''); setCook(null); setBusy('재료 계산 중…')
    try {
      const r = findRecipe(dish)
      let needAll = r ? r.ingredients : null
      if (!needAll) needAll = await dishIngredients(dish)
      const have = needAll.filter(i => ingredients.some(h => looseEq(h, i)))
      const need = needAll.filter(i => !ingredients.some(h => looseEq(h, i)))
      setCook({ dish, have, need })
    } catch (err) { setError('계산 실패: ' + err.message) }
    finally { setBusy('') }
  }

  const ING_EMOJI = { '계란': '🥚', '김치': '🌶️', '두부': '🧈', '대파': '🌿', '양파': '🧅', '밥': '🍚' }
  const emo = (n) => ING_EMOJI[n] || '🍶'

  return (
    <div className="app">
      <div className="deco">{DECOS.map((d, i) => <span key={i} style={{ top: d.top, left: d.left, right: d.right }}>{d.e}</span>)}</div>
      <div className="content">
        <div className="top"><div className="logo">냉장고를 부탁해</div></div>

        <nav className="tabs">
          <button className={tab === 'fridge' ? 'on' : ''} onClick={() => setTab('fridge')}><span className="em">🧊</span>냉장고</button>
          <button className={tab === 'cook' ? 'on' : ''} onClick={() => setTab('cook')}><span className="em">🍳</span>만들고 싶어</button>
        </nav>

        {busy && !showResults && <ChefLoader chef={chef} message={busy} />}
        {error && <div className="banner err" onClick={() => setError('')}>{error} ✕</div>}

        <div className="tabbody">
        {tab === 'fridge' && (
          <>
            <section className="card">
              <div className="h">🧊 우리집 냉장고 <span className="hint-mini">— 재료를 모아두면 추천이 더 정확해져요</span></div>
              <div className="addrow">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { addIngredient(input); setInput('') } }}
                  placeholder="재료 입력 후 Enter" />
                <button onClick={() => { addIngredient(input); setInput('') }}>추가</button>
              </div>
              <div className="chips">
                {ingredients.map(it => {
                  const meta = fridgeMeta[it] || {}
                  const exp = meta.expireAt
                  const today = new Date(); today.setHours(0,0,0,0)
                  let dleft = null, expCls = ''
                  if (exp) {
                    const d = new Date(exp); d.setHours(0,0,0,0)
                    dleft = Math.round((d - today) / 86400000)
                    expCls = dleft < 0 ? ' exp-over' : (dleft <= 2 ? ' exp-soon' : '')
                  }
                  return (
                    <span className={'chip'+expCls} key={it}>
                      <span className="em">{emo(it)}</span>{it}
                      {dleft != null && <span className="exp-d">D{dleft >= 0 ? '-' : '+'}{Math.abs(dleft)}</span>}
                      <button className="chip-edit" onClick={() => {
                        const cur = (fridgeMeta[it] && fridgeMeta[it].expireAt) || ''
                        const v = window.prompt(it + ' 유통기한 (YYYY-MM-DD) 또는 빈칸으로 삭제:', cur)
                        if (v === null) return
                        setFridgeMeta(prev => {
                          const m = { ...prev }
                          if (v.trim()) m[it] = { ...(m[it]||{}), expireAt: v.trim() }
                          else { if (m[it]) { delete m[it].expireAt; if (!Object.keys(m[it]).length) delete m[it] } }
                          return m
                        })
                      }} title="유통기한">📅</button>
                      <button onClick={() => removeIngredient(it)}>✕</button>
                    </span>
                  )
                })}
              </div>
              <div className="styrow">
                <input className="styin" value={style} onChange={e => setStyle(e.target.value)} placeholder="원하는 스타일 (매콤·다이어트·비건…)" />
                <button className={'tgl' + (fast ? ' on' : '')} onClick={() => setFast(f => !f)}>⏱ 15분</button>
              </div>
              <div className="photo-row">
                <label className="photo">📷 사진으로 재료 인식<input type="file" accept="image/*" onChange={onPhoto} hidden /></label>
                <label className="photo photo-receipt">🧾 영수증 인식<input type="file" accept="image/*" onChange={onReceipt} hidden /></label>
              </div>
            </section>

            <section className="card">
              <div className="h">👨‍🍳 셰프 스타일 골라줘</div>
              <div className="chips">
                {CHEFS.map(c => (
                  <button className={'chip add' + (chefId === c.id ? ' sel' : '')} key={c.id} onClick={() => setChefId(prev => prev === c.id ? '' : c.id)}>👨‍🍳 {c.name}</button>
                ))}
              </div>
              <p className="hint">안 고르면 '무관' · 같은 셰프 다시 누르면 해제</p>
              <button className="cta" onClick={onAiRecommend}>✦ {chef ? chef.name + ' 추천' : '추천 받기'} ✦</button>
            </section>
          </>
        )}

        {tab === 'cook' && (
          <section className="card">
            <div className="h">🍳 만들고 싶어 → 살 재료</div>
            <div className="addrow">
              <input value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onCook() }} placeholder="요리 이름 (예: 김치찌개)" />
              <button onClick={() => onCook()}>계산</button>
            </div>
            <div className="chips">
              {CHEFS.map(c => (
                <button className={'chip add' + (chefId === c.id ? ' sel' : '')} key={c.id} onClick={() => setChefId(prev => prev === c.id ? '' : c.id)}>👨‍🍳 {c.name}</button>
              ))}
            </div>
            <p className="hint">{chef ? chef.name + '의 대표 요리 — 누르면 살 재료를 알려줘요' : '셰프를 고르면 대표 요리가 나와요'}</p>
            {chef && (
              <div className="chips">
                {chef.signatures.map(d => (
                  <button className="chip add" key={d} onClick={() => { setTarget(d); onCook(d) }}>{d}</button>
                ))}
              </div>
            )}
            {cook && (
              <div className="cookresult">
                <div className="h">{cook.dish}</div>
                <div className="cols">
                  <div><b className="have">✓ 있는 것</b><ul>{cook.have.length ? cook.have.map(i => <li key={i}>{i}</li>) : <li>없음</li>}</ul></div>
                  <div><b className="need">🛒 살 것</b><ul>{cook.need.length ? cook.need.map(i => <li key={i}>{i}</li>) : <li>다 있어요! 🎉</li>}</ul></div>
                </div>
              </div>
            )}
          </section>
        )}
        </div>

        <div className="foot">DailyAppLab · 셰프 8인 × Claude 🍳 · <button className="resetlink" onClick={() => { if (window.confirm('재료/설정을 모두 지울까요?')) { localStorage.removeItem(LS_ING); localStorage.removeItem(LS_CHEF); window.location.reload() } }}>초기화</button></div>
      </div>

      {showResults && (
        <div className="modal" onClick={closeResults}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            {detail ? (
              <>
                <div className="bar"><button className="close" onClick={() => setDetail(null)}>←</button><h2>{detail.name}{detail.time ? ' · ' + detail.time + '분' : ''}</h2></div>
                {detailBusy ? <ChefLoader chef={chef} message="상세 레시피 만드는 중" /> : (
                  <>
                    <div className="leg"><span><span className="dot have"></span>집에 있는 것</span><span><span className="dot buy"></span>사야 할 것</span></div>
                    <div className="chips ings">
                      {detail.ingredients.map((x, i) => {
                        const have = ingredients.some(h => looseEq(h, x.item))
                        return <span key={i} className={'ing ' + (have ? 'have' : 'buy')}>{x.item}{x.amount ? ' ' + x.amount : ''}</span>
                      })}
                    </div>
                    {detail.nutrition && detail.nutrition.kcal > 0 && (
                      <div className="nuts">
                        <span className="nuts-k">🔥 {detail.nutrition.kcal} kcal</span>
                        <span>단백질 {detail.nutrition.protein}g</span>
                        <span>탄수 {detail.nutrition.carbs}g</span>
                        <span>지방 {detail.nutrition.fat}g</span>
                      </div>
                    )}
                    <ol className="steps big">{detail.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    {detail.tip && <p className="tip">💡 {detail.tip}</p>}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="bar"><h2>✦ {chef ? chef.name + ' 추천' : 'AI 추천'}{fast ? ' · 15분' : ''}</h2><button className="close" onClick={closeResults}>✕</button></div>
                {busy && <ChefLoader chef={chef} message={busy} />}
                {sparse && <div className="banner note">🧊 냉장고에 재료가 거의 없어 {chef ? chef.name + ' 셰프의' : ''} 대표 메뉴를 보여드려요. 재료를 더 넣으면 냉장고에 맞춰 더 정확히 추천해요!</div>}
                {aiRecipes && aiRecipes.length === 0 && <p className="hint">추천이 없어요. 재료를 더 넣거나 조건을 바꿔보세요.</p>}
                {aiRecipes && aiRecipes.map((r, i) => (
                  <div className="rec clickable" key={i} onClick={() => openDetail(r.name)}>
                    <div className="topline">
                      <span className="nm">🍲 {r.name}{r.note ? <em> — {r.note}</em> : null}</span>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {r.time ? <span className="time">⏱{r.time}분</span> : null}
                        {r.nutrition && r.nutrition.kcal > 0 ? <span className="kcal">🔥{r.nutrition.kcal}kcal</span> : null}
                        {r.missing.length > 0 ? <span className="miss">+{r.missing.join(', ')}</span> : <span className="ok">재료 OK</span>}
                      </span>
                    </div>
                    <div className="seemore">레시피 보기 ▶</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
