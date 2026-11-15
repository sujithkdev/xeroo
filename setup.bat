@echo off
title Krishna Print Hub — Setup
color 0A
echo.
echo  ============================================
echo   Krishna Print Hub — First Time Setup
echo  ============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo  Download from: https://nodejs.org  ^(version 22 or higher^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found
echo.

:: Create .env.local if it doesn't exist
if not exist ".env.local" (
    echo  [SETUP] Creating .env.local from template...
    copy ".env.example" ".env.local" >nul
    echo  [OK] .env.local created
    echo.
    echo  ============================================
    echo   IMPORTANT — Open .env.local and set:
    echo     AGENT_TOKEN=^(run: node -e "require('crypto').randomBytes(32).then?? || console.log(require('crypto').randomBytes(32).toString('hex'))"^)
    echo  ============================================
    echo.
) else (
    echo  [OK] .env.local already exists
)

:: Create data directory
if not exist "data" (
    mkdir data
    echo  [OK] Created data/ directory
)

:: Install dependencies
echo  [SETUP] Installing dependencies ^(this takes 2-3 minutes first time^)...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo  [OK] Dependencies installed

:: Run setup script
echo.
echo  [SETUP] Running database and config setup...
call node scripts/setup.cjs
if errorlevel 1 (
    echo  [WARNING] Setup script had issues - continuing anyway
)
echo  [OK] Setup complete

:: Build Next.js
echo.
echo  [SETUP] Building the web app ^(this takes 2-3 minutes^)...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. See errors above.
    pause
    exit /b 1
)
echo.
echo  [OK] Build complete

echo.
echo  ============================================
echo   Setup complete! Run START.bat to launch.
echo  ============================================
echo.
pause
