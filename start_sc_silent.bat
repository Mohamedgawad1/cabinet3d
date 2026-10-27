@echo off
REM ============================================================
REM  Starts Chrome with the saved SmartCloud profile and the
REM  debug port 9222, silently (window kept off-screen), then
REM  waits until the port answers. Used by _auto_sync.bat.
REM ============================================================
setlocal
set "PROFILE=%LOCALAPPDATA%\sc_itr_profile"
set "URL=https://wly04-sc.intergraphsmartcloud.com/ISC/Tools/vDashboardsUsers/Switchboard.htm"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome not found
  exit /b 1
)

start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE%" --window-position=-32000,-32000 --window-size=1400,900 --no-first-run --no-default-browser-check --disable-features=MemorySaver,TabDiscarding --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-background-networking --disable-hang-monitor --disable-breakpad --disable-session-crashed-bubble "%URL%"

for /l %%i in (1,1,40) do (
  powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9222/json/version' -TimeoutSec 2).StatusCode|Out-Null;exit 0}catch{exit 1}"
  if not errorlevel 1 (
    echo SmartCloud browser ready on 9222
    exit /b 0
  )
  ping -n 3 127.0.0.1 >nul
)
echo SmartCloud browser did not answer on 9222
exit /b 1
