@echo off
REM Silent run for Task Scheduler - no window, output appended to sync_log.txt
cd /d "%~dp0"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=python"
echo. >> sync_log.txt
echo ===== %DATE% %TIME% ===== >> sync_log.txt
"%PY%" sync_subsystem.py >> sync_log.txt 2>&1
