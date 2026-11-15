@echo off
title Krishna Print Hub
color 0A
echo.
echo  ============================================
echo   Krishna Print Hub — Starting...
echo  ============================================
echo.

:: Check .env.local exists
if not exist ".env.local" (
    echo  [ERROR] .env.local not found. Run setup.bat first.
    pause
    exit /b 1
)

:: Check build exists
if not exist ".build\BUILD_ID" (
    echo  [ERROR] App not built. Run setup.bat first.
    pause
    exit /b 1
)

:: Load env vars from .env.local
for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
)

echo  [OK] Starting web server on http://localhost:3000
echo  [OK] Starting print agent
echo.
echo  Staff dashboard : http://localhost:3000/shop
echo  Customer site   : http://localhost:3000
echo.
echo  Press Ctrl+C to stop.
echo.

:: Start print agent in a separate window
start "Krishna Print Agent" /min cmd /c "node --env-file-if-exists=.env.local print-agent.js"

:: Start Next.js server (foreground)
node --env-file-if-exists=.env.local node_modules\next\dist\bin\next start --hostname 127.0.0.1

pause
