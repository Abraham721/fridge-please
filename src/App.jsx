import React, { useEffect, useState } from 'react'
import { RECIPES, findRecipe, looseEq } from './recipes.js'
import { CHEFS, findChef } from './chefs.js'
import { detectIngredients, recommendRecipes, dishIngredients } from './ai.js'

const LS_ING = 'fp_ingredients'
const LS_CHEF = 'fp_chef'
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f } catch (e) { return f } }
const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
})

const DECOS = [
  { e: '🎀', top: '2%', left: '3%' }, { e: '💎', top: '10%', right: '4%' },
  { e: '⭐', top: '34%', left: '2%' }, { e: '🍒', top: '52%', right: '3%' },
  { e: '💕', top: '70%', left: '3%' }, { e: '⭐', top: '88%', right: '6%' },
  { e: '🌈', top: '46%', left: '5%' }, { e: '🎀', top: '92%', left: '8%' }
]

export default function App() {
  const [tab, setTab] = useState('fridge')
  const [ingredients, setIngredients] = useState(() => load(LS_ING, ['계란', '김치', '두부', '대파', '양파']))
  const [chefId, setChefId] = useState(() => load(LS_CHEF, ''))
  const [input, setInput] = useState('')
  const [style, setStyle] = useState('')
  const [fast, setFast] = useState(false)
  const [detected, setDetected] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [aiRecipes, setAiRecipes] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [target, setTarget] = useState('')
  const [cook, setCook] = useState(null)

  useEffect(() => { localStorage.setItem(LS_ING, JSON.stringify(ingredients)) }, [ingredients])
  useEffect(() => { localStorage.setItem(LS_CHEF, JSON.stringify(chefId)) }, [chefId])

  const chef = findChef(chefId)

  const addIngredient = (name) => {
    const n = (name || '').trim()
    if (!n) return
    setIngredients(prev => (prev.some(x => looseEq(x, n)) ? prev : [...prev, n]))
  }
  const removeIngredient = (name) => setIngredients(prev => prev.filter(x => x !== name))

  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(''); setBusy('사진에서 재료 인식 중…'); setDetected([])
    try { setDetected(await detectIngredients(await fileToDataUrl(file))) }
    catch (err) { setError('사진 인식 실패: ' + err.message) }
    finally { setBusy('') }
  }

  async function onAiRecommend() {
    setError(''); setShowResults(true); setAiRecipes(null)
    setBusy((chef ? (chef.name + ' 추천 중') : 'AI 추천 중') + (fast ? ' (15분 이내)' : '') + '…')
    try { setAiRecipes(await recommendRecipes(ingredients, chef, { style, fast })) }
    catch (err) { setError('추천 실패: ' + err.message); setShowResults(false) }
    finally { setBusy('') }
  }

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
          <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}><span className="em">❓</span>정보</button>
        </nav>

        {busy && !showResults && <div className="banner busy">{busy}</div>}
        {error && <div className="banner err" onClick={() => setError('')}>{error} ✕</div>}

        {tab === 'fridge' && (
          <>
            <section className="card">
              <div className="h">🧺 내 냉장고 재료</div>
              <div className="addrow">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { addIngredient(input); setInput('') } }}
                  placeholder="재료 입력 후 Enter" />
                <button onClick={() => { addIngredient(input); setInput('') }}>추가</button>
              </div>
              <div className="styrow">
                <input className="styin" value={style} onChange={e => setStyle(e.target.value)} placeholder="원하는 스타일 (매콤·다이어트·비건…)" />
                <button className={'tgl' + (fast ? ' on' : '')} onClick={() => setFast(f => !f)}>⏱ 15분</button>
              </div>
              <div className="chips">
                {ingredients.map(it => (
                  <span className="chip" key={it}><span className="em">{emo(it)}</span>{it}<button onClick={() => removeIngredient(it)}>✕</button></span>
                ))}
              </div>
              <label className="photo">📷 사진으로 재료 인식<input type="file" accept="image/*" onChange={onPhoto} hidden /></label>
              {detected.length > 0 && (
                <div className="detected"><b>인식된 재료 (눌러서 추가)</b>
                  <div className="chips">{detected.map(d => (
                    <button className="chip add" key={d} onClick={() => { addIngredient(d); setDetected(detected.filter(x => x !== d)) }}>＋ {d}</button>
                  ))}</div>
                </div>
              )}
            </section>

            <section className="card">
              <div className="h">👨‍🍳 셰프 스타일 골라줘</div>
              <div className="chips">
                <button className={'chip add' + (chefId === '' ? ' sel' : '')} onClick={() => setChefId('')}>무관</button>
                {CHEFS.map(c => (
                  <button className={'chip add' + (chefId === c.id ? ' sel' : '')} key={c.id} onClick={() => setChefId(c.id)}>👨‍🍳 {c.name}</button>
                ))}
              </div>
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
              {RECIPES.slice(0, 8).map(r => (
                <button className="chip add" key={r.name} onClick={() => { setTarget(r.name); onCook(r.name) }}>{r.emoji} {r.name}</button>
              ))}
            </div>
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

        {tab === 'info' && (
          <section className="card">
            <div className="h">ℹ️ 정보</div>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>사진 인식·AI 추천은 서버(Vercel 함수)에서 <b>Claude</b>로 동작해요. 재료·원하는 스타일·15분 제한·선택 셰프 페르소나를 반영해 추천합니다.</p>
            <button className="danger" onClick={() => { if (window.confirm('재료/설정을 모두 지울까요?')) { localStorage.removeItem(LS_ING); localStorage.removeItem(LS_CHEF); window.location.reload() } }}>초기화</button>
          </section>
        )}

        <div className="foot">DailyAppLab · 셰프 8인 × Claude 🍳</div>
      </div>

      {showResults && (
        <div className="modal" onClick={() => setShowResults(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="bar"><h2>✦ {chef ? chef.name + ' 추천' : 'AI 추천'}{fast ? ' · 15분' : ''}</h2><button className="close" onClick={() => setShowResults(false)}>✕</button></div>
            {busy && <div className="banner busy">{busy} 🍳</div>}
            {aiRecipes && aiRecipes.length === 0 && <p className="hint">추천이 없어요. 재료를 더 넣거나 조건을 바꿔보세요.</p>}
            {aiRecipes && aiRecipes.map((r, i) => (
              <div className="rec" key={i}>
                <div className="topline">
                  <span className="nm">🍲 {r.name}{r.note ? <em> — {r.note}</em> : null}</span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {r.time ? <span className="time">⏱{r.time}분</span> : null}
                    {r.missing.length > 0 ? <span className="miss">+{r.missing.join(', ')}</span> : <span className="ok">재료 OK</span>}
                  </span>
                </div>
                {r.steps && r.steps.length > 0 && <ol className="steps">{r.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
