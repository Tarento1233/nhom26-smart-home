@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Khoi dong demo Nha thong minh - nhom26 ===
echo.
set "VBOX=C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
echo [1/3] Home Assistant (phan mo rong)...
if not exist "%VBOX%" goto nodered
"%VBOX%" showvminfo "HomeAssistant-IoT" >nul 2>&1
if errorlevel 1 goto nodered
"%VBOX%" startvm "HomeAssistant-IoT" --type headless >nul 2>&1
echo    Home Assistant: http://localhost:8123
:nodered
echo [2/3] Node-RED + Dashboard...
call "%~dp0khoi_dong_node_red.bat" -NoBrowser
if errorlevel 1 exit /b 1
start "" "http://localhost:1880/dashboard/room"
echo [3/3] Wokwi trong VS Code...
call "%~dp0mo_wokwi_vscode.bat"
echo.
echo Firmware da co san. Trong VS Code: F1 - Wokwi: Start Simulator.
echo Chi can Ctrl+Shift+B khi da cai Arduino CLI va muon build lai firmware.
echo Xep Wokwi va dashboard canh nhau de mo phong khong bi tam dung.
echo Node-RED dang chay nen. Dung tat_node_red.bat de tat.
