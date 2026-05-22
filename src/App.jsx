import React, { useEffect, useMemo, useState } from 'react'
import { RECIPES, matchRecipes, findRecipe, looseEq } from './recipes.js'
import { detectIngredients, recommendRecipes, dishIngredients } from './ai.js'

const LS_ING = 'fp_ingredients'
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f } catch (e) { return f } }
const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
})

export default function App() {
  const [tab, setTab] = useState('fridge')
  const [ingredients, setIngredients] = useState(() => load(LS_ING, ['계란', '김치', '대파', '두부', '양파', '밥']))
  const [input, setInput] = useState('')
  const [detected, setDetected] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [aiRecipes, setAiRecipes] = useState(null)
  const [target, setTarget] = useState('')
  const [cook, setCook] = useState(null)

  useEffect(() => { localStorage.setItem(LS_ING, JSON.stringify(ingredients)) }, [ingredients])

  const local = useMemo(() => matchRecipes(ingredients, RECIPES), [ingredients])

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
    try {
      const dataUrl = await fileToDataUrl(file)
      setDetected(await detectIngredients(dataUrl))
    } catch (err) { setError('사진 인식 실패: ' + err.message) }
    finally { setBusy('') }
  }

  async function onAiRecommend() {
    setError(''); setBusy('AI가 요리 추천 중…'); setAiRecipes(null)
    try { setAiRecipes(await recommendRecipes(ingredients)) }
    catch (err) { setError('추천 실패: ' + err.message) }
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

  return (
    <div className="app">
      <header className="top">
        <h1>냉장고를 부탁해 <span className="emoji">🧊</span></h1>
        <p className="sub">사진/재료 → 만들 요리 추천 · 만들 요리 → 살 재료</p>
      </header>

      <nav className="tabs">
        <button className={tab === 'fridge' ? 'on' : ''} onClick={() => setTab('fridge')}>🧺 냉장고</button>
        <button className={tab === 'cook' ? 'on' : ''} onClick={() => setTab('cook')}>🍳 만들고 싶어</button>
        <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>ℹ️ 정보</button>
      </nav>

      {busy && <div className="banner busy">{busy}</div>}
      {error && <div className="banner err" onClick={() => setError('')}>{error} <span className="x">✕</span></div>}

      {tab === 'fridge' && (
        <main>
          <section className="card">
            <h2>내 냉장고 재료</h2>
            <div className="addrow">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addIngredient(input); setInput('') } }}
                placeholder="재료 입력 후 Enter (예: 두부)" />
              <button onClick={() => { addIngredient(input); setInput('') }}>추가</button>
            </div>
            <div className="chips">
              {ingredients.length === 0 && <span className="muted">재료를 추가하거나 사진을 올려보세요.</span>}
              {ingredients.map(it => (
                <span className="chip" key={it}>{it}<button onClick={() => removeIngredient(it)}>×</button></span>
              ))}
            </div>
            <label className="photo">
              📷 냉장고 사진으로 재료 인식
              <input type="file" accept="image/*" onChange={onPhoto} hidden />
            </label>
            <p className="muted small">※ 사진 인식·AI 추천은 배포본(또는 vercel dev)에서 동작해요. 로컬 미리보기에선 재료를 직접 추가하면 추천은 됩니다.</p>
            {detected.length > 0 && (
              <div className="detected">
                <b>인식된 재료 (눌러서 추가):</b>
                <div className="chips">
                  {detected.map(d => (
                    <button className="chip add" key={d} onClick={() => { addIngredient(d); setDetected(detected.filter(x => x !== d)) }}>+ {d}</button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h2>지금 만들 수 있는 요리</h2>
            {local.makeable.length === 0 && local.almost.length === 0 && <p className="muted">매칭되는 요리가 없어요. 재료를 더 추가해 보세요.</p>}
            {local.makeable.map(r => (
              <div className="rec" key={r.name}><span>{r.emoji} {r.name}</span><span className="ok">재료 OK</span></div>
            ))}
            {local.almost.map(r => (
              <div className="rec" key={r.name}><span>{r.emoji} {r.name}</span><span className="miss">+{r.missing.join(', ')}</span></div>
            ))}
            <button className="ai" onClick={onAiRecommend}>✨ AI 추천 더 보기 (Claude)</button>
            {aiRecipes && aiRecipes.map((r, i) => (
              <div className="rec airec" key={i}>
                <span>🍲 {r.name}{r.note ? <em> — {r.note}</em> : null}</span>
                {r.missing.length > 0 ? <span className="miss">+{r.missing.join(', ')}</span> : <span className="ok">재료 OK</span>}
              </div>
            ))}
          </section>
        </main>
      )}

      {tab === 'cook' && (
        <main>
          <section className="card">
            <h2>만들고 싶은 요리 → 살 재료</h2>
            <div className="addrow">
              <input value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onCook() }}
                placeholder="요리 이름 (예: 김치찌개)" />
              <button onClick={() => onCook()}>계산</button>
            </div>
            <div className="chips">
              {RECIPES.slice(0, 10).map(r => (
                <button className="chip add" key={r.name} onClick={() => { setTarget(r.name); onCook(r.name) }}>{r.emoji} {r.name}</button>
              ))}
            </div>
            {cook && (
              <div className="cookresult">
                <h3>{cook.dish}</h3>
                <div className="cols">
                  <div>
                    <b className="have">✓ 이미 있는 것</b>
                    <ul>{cook.have.length ? cook.have.map(i => <li key={i}>{i}</li>) : <li className="muted">없음</li>}</ul>
                  </div>
                  <div>
                    <b className="need">🛒 사야 할 것</b>
                    <ul>{cook.need.length ? cook.need.map(i => <li key={i}>{i}</li>) : <li className="muted">다 있어요! 바로 만들 수 있어요 🎉</li>}</ul>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {tab === 'info' && (
        <main>
          <section className="card">
            <h2>정보</h2>
            <p>사진 인식과 AI 추천은 <b>우리 서버(Vercel 함수)에서 Claude</b>로 동작해요. API 키는 <b>서버 환경변수에만</b> 있고, 이 앱(브라우저)이나 코드에는 들어가지 않아요.</p>
            <p className="muted small">로컬에서 <code>npm run dev</code>(vite)만 켜면 백엔드가 없어 AI 기능은 안 돼요. 배포본 또는 <code>vercel dev</code>에서 동작합니다. 냉장고 재료는 이 브라우저에만 저장돼요.</p>
            <button className="danger" onClick={() => { if (window.confirm('재료를 모두 지울까요?')) { localStorage.removeItem(LS_ING); window.location.reload() } }}>재료 초기화</button>
          </section>
        </main>
      )}

      <footer className="foot">냉장고를 부탁해 · DailyAppLab · React + Vercel 함수 + Claude</footer>
    </div>
  )
}
