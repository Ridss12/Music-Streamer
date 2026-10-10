@echo off
setlocal
echo ========================================
echo Music Streaming Server - Live on Network
echo ========================================
echo.

cd /d "%~dp0"

REM --- 0. Check if port 8000 is already in use ---
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 goto port_free
echo ERROR: Port 8000 is already in use!
echo.
echo If the server is already running, use that window.
echo If something else is using port 8000, close it first.
echo.
pause
exit /b 1

:port_free
REM --- 1. Build the web app if it hasn't been built yet ---
if exist "%~dp0frontend-react\dist\index.html" goto already_built
echo [1/2] Building web app - first run only...
cd /d "%~dp0frontend-react"
call npm run build
if errorlevel 1 goto build_failed
echo Web app built successfully.
goto start_server

:build_failed
echo.
echo ERROR: Frontend build failed. Run setup.bat first.
echo.
pause
exit /b 1

:already_built
echo [1/2] Web app already built.

:start_server
REM --- 2. Start the server ---
echo [2/2] Starting server...
echo.
echo IMPORTANT: The IP below is what you type on your PHONE.
echo Make sure your phone is on the SAME WiFi network.
echo.
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

echo.
echo ========================================
echo Server stopped.
echo ========================================
pause
