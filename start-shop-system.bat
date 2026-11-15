@echo off
cd /d "%~dp0"
call npm run setup
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
echo Start npm run agent in a separate terminal after selecting a printer.
call npm start
