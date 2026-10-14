@echo off
rem Starts Trip Finder at http://localhost:5173 using the Node.js copy in your user Programs folder (or one on PATH).
set "NODE_HOME=%LOCALAPPDATA%\Programs\node-v24.21.0-win-x64"
if exist "%NODE_HOME%\node.exe" set "PATH=%NODE_HOME%;%PATH%"
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dev -- --port 5173 --strictPort
