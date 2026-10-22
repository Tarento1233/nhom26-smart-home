@echo off
setlocal
set "VSCODE_CLI="
for /f "delims=" %%I in ('where code.cmd 2^>nul') do if not defined VSCODE_CLI set "VSCODE_CLI=%%I"
if not defined VSCODE_CLI if exist "D:\VSCODE\Microsoft VS Code\bin\code.cmd" set "VSCODE_CLI=D:\VSCODE\Microsoft VS Code\bin\code.cmd"
if not defined VSCODE_CLI (
  echo Khong tim thay VS Code. Mo VS Code roi File - Open Workspace from File.
  echo Chon "%~dp0Nhom26-SmartHome.code-workspace".
  pause
  exit /b 1
)
call "%VSCODE_CLI%" --new-window "%~dp0Nhom26-SmartHome.code-workspace"
exit /b %errorlevel%
