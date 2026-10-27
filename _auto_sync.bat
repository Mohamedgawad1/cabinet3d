@echo off
REM ============================================================
REM  Automatic SmartCloud -> GitHub Pages sync (Task Scheduler,
REM  every 30 minutes). Live pull when the SmartCloud browser
REM  with debug port 9222 is up, otherwise newest local pull.
REM ============================================================
cd /d "%~dp0"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
set "LOG=%~dp0sync_log.txt"

echo.>>"%LOG%"
echo ===== %DATE% %TIME% =====>>"%LOG%"

REM --- make sure the SmartCloud browser with debug port is running ---
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9222/json/version' -TimeoutSec 2).StatusCode|Out-Null;exit 0}catch{exit 1}"
if errorlevel 1 (
  echo SmartCloud browser closed - starting it>>"%LOG%"
  call "%~dp0start_sc_silent.bat">>"%LOG%" 2>&1
)

"%PY%" sync_subsystem.py>>"%LOG%" 2>&1
exit /b %ERRORLEVEL%
