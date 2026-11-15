@echo off
rem Double-click to start the Lucky Reels game. Close this window to stop it.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
)
rem Open the browser a few seconds later, when the server is up.
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
