@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0node_red\install.ps1"
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%
