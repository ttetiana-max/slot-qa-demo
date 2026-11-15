@echo off
rem Double-click to open the Cypress window and watch the tests run.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
)
rem Cypress's own installer fails on Node 26, so install the app manually if it is missing.
call npx cypress verify >nul 2>&1 || powershell -ExecutionPolicy Bypass -File scripts\install-cypress.ps1
call npm run test:open
pause
