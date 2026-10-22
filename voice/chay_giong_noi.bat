@echo off
call "%~dp0..\khoi_dong_node_red.bat" -NoBrowser
if errorlevel 1 exit /b 1
start "" "http://localhost:1880/voice/voice.html"
