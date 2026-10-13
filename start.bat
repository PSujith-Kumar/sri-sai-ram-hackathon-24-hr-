@echo off
setlocal
title CareBridge Development Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [CareBridge] Node.js is not installed or is not available in PATH.
  echo Install Node.js from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [CareBridge] npm is not available in PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [CareBridge] Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [CareBridge] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [CareBridge] Starting the React application...
echo [CareBridge] The browser will open automatically.
call npm run dev -- --open

if errorlevel 1 (
  echo [CareBridge] The development server stopped with an error.
  pause
  exit /b 1
)

endlocal
