@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting sandbox server on http://localhost:3000/
echo The browser will open in a moment.
echo Close this window to stop the server.
echo.

REM Open the default browser after Vite has a few seconds to start
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000/'"

call npm run dev

pause
