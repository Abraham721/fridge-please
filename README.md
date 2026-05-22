# 냉장고를 부탁해 (Fridge, Please!)

냉장고 사진/재료 → **만들 수 있는 요리** 추천, 만들고 싶은 요리 → **사야 할 재료** 안내.
(DailyAppLab · 바이브 코딩으로 만든 "나만의 앱")

## 구조
- **프론트엔드**: React + Vite (이 폴더)
- **백엔드**: Vercel 서버리스 함수 `api/` — 사진 인식·추천을 **Claude**로 처리
- **API 키**: 서버 환경변수 `ANTHROPIC_API_KEY`에만 보관. 브라우저·코드·깃에는 절대 안 들어감.
- 냉장고 재료는 사용자의 브라우저(localStorage)에만 저장.

## 가장 빠른 길 = Vercel 배포
1. 이 `code` 폴더를 GitHub 새 저장소에 올린다. (GitHub Desktop으로 폴더 열고 Publish, 또는 `git init && git add . && git commit -m init`)
2. https://vercel.com 로그인(GitHub로) → **Add New → Project** → 그 저장소 선택 → **Deploy**
   - Vite 프로젝트로 자동 인식돼요. 별도 설정 불필요.
3. 배포 후 **Settings → Environment Variables** 에 추가:
   - `ANTHROPIC_API_KEY` = 본인 Anthropic 키
   - (선택) `ANTHROPIC_MODEL` = `claude-sonnet-4-6` (기본은 haiku)
   - 저장 후 **Redeploy** 한 번.
4. 받은 `https://....vercel.app` 주소를 폰에서 열고 "홈 화면에 추가" → 끝.

## 로컬에서 보기 (선택)
```bash
npm install
npm run dev      # http://localhost:5173 — 단, 백엔드(AI)는 없음 → 재료 직접 입력으로 추천만
```
백엔드까지 로컬에서 돌리려면 Vercel CLI: `npm i -g vercel` 후 `vercel dev`. (환경변수는 `.env`에 `ANTHROPIC_API_KEY` — `.env.example` 참고)

## 보안
- `.env`, `config.py` 는 `.gitignore`로 제외돼요. 키를 코드/깃에 넣지 마세요.
- 키는 Vercel 환경변수에만. 공개 저장소로 배포해도 키는 노출되지 않아요.

## 커스터마이즈
- `src/recipes.js` 의 `RECIPES` 에 내가 자주 하는 요리·재료를 추가하면 "내 입맛"에 맞아져요.
- `api/*.js` 의 프롬프트를 바꿔 비건/자취/유아식 등 내 상황에 맞춰도 좋아요.

## 파일
- `src/App.jsx` — 화면(모드 A/B/정보)
- `src/recipes.js` — 내장 레시피 + 매칭
- `src/ai.js` — 백엔드 `/api` 호출 (키 없음)
- `api/detect.js` `api/recommend.js` `api/dish.js` — Claude 호출 서버리스 함수
- `lib/anthropic.js` — Claude 호출 헬퍼
