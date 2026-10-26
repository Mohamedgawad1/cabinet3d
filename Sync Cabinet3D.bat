@echo off
title Cabinet 3D - sync SUBSYSTEM from SmartCloud
color 0B
cd /d "%~dp0"

echo ============================================================
echo   CABINET 3D  -  SUBSYSTEM sync from SmartCloud
echo ------------------------------------------------------------
echo   Reads the PS5 pre-commissioning grid from the SmartCloud
echo   window you already have open (CDP port 9222), rewrites
echo   data\cables.js and pushes to GitHub Pages.
echo.
echo   If SmartCloud is closed it uses the newest local pull.
echo ============================================================
echo.

set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" sync_subsystem.py %*
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (echo DONE - live: https://mohamedgawad1.github.io/cabinet3d/) else (echo finished with code %RC%)
echo.
pause
