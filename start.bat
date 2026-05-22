@echo off
chcp 65001 >nul
cd /d %~dp0
echo === 냉장고를 부탁해 ===
echo [1/2] 처음이면 패키지 설치 (시간이 좀 걸려요)
call npm install
if errorlevel 1 ( echo. & echo npm install 실패 - 위 메시지를 확인하세요 & pause & exit /b 1 )
echo.
echo [2/2] 개발 서버 시작 - 이 창을 닫지 마세요!
echo 브라우저에서 아래 표시되는 http://localhost:5173 주소를 여세요.
echo.
call npm run dev
pause
