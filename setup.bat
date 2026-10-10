@echo off
setlocal
echo ========================================
echo Music Streaming App - Setup
echo ========================================
echo.

REM --- 1. Check Python ---
echo [1/4] Checking Python...
python --version >nul 2>&1
if not errorlevel 1 goto python_ok
echo ERROR: Python not found. Please install Python 3.10+ from python.org
pause
exit /b 1

:python_ok
echo OK: Python found

REM --- 2. Install backend dependencies ---
echo.
echo [2/4] Installing backend dependencies...
cd /d "%~dp0backend"
python -m pip install -r requirements.txt -q
if not errorlevel 1 goto deps_ok
echo ERROR: Failed to install backend dependencies
pause
exit /b 1

:deps_ok
echo OK: Backend dependencies installed

REM --- 3. Check web app ---
echo.
echo [3/4] Checking web app...
if exist "%~dp0frontend-react\dist\index.html" goto frontend_built
node --version >nul 2>&1
if not errorlevel 1 goto node_ok
echo WARNING: Node.js not found, but the web app is already included in this project.
echo         You can skip frontend steps. Continue with backend setup only.
goto frontend_skip

:node_ok
echo Installing frontend dependencies...
cd /d "%~dp0frontend-react"
call npm install --include=dev
if not errorlevel 1 goto npm_done
echo ERROR: Failed to install frontend dependencies
pause
exit /b 1

:npm_done
echo Building web app...
call npm run build
if not errorlevel 1 goto frontend_built
echo WARNING: Frontend build failed, will try again with start-server.bat
goto frontend_skip

:frontend_built
echo OK: Web app already built
cd /d "%~dp0backend"

:frontend_skip
echo.
echo [4/4] Creating sample folders...
cd /d "%~dp0backend"
if not exist "songs" mkdir songs
if not exist "songs\README.txt" echo Put your .mp3 files in the 'songs' folder. > "songs\README.txt"
if not exist "music_streamer.db" echo Database will be created automatically on first run >nul
echo OK: Sample folders created

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo NEXT STEPS:
echo 1. Add your .mp3 files to: backend\songs\
echo 2. Run: start-server.bat  - starts everything, no other steps needed!
echo 3. Open http://localhost:8000 in your browser
echo.
echo FOR YOUR PHONE:
echo After starting the server, look for the IP it prints,
echo then open http://IP:8000 on any device on the same WiFi.
echo.
pause
