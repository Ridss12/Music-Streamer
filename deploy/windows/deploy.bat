@echo off
setlocal EnableExtensions

set "DISTRO=Ubuntu-24.04"
set "ACTION=%~1"
if not defined ACTION set "ACTION=deploy"

if /i not "%ACTION%"=="deploy" if /i not "%ACTION%"=="start" if /i not "%ACTION%"=="stop" if /i not "%ACTION%"=="status" (
  echo Usage: deploy.bat [deploy^|start^|stop^|status]
  exit /b 2
)

where wsl.exe >nul 2>&1 || (
  echo WSL is not installed. In Administrator PowerShell, run:
  echo   wsl --install -d Ubuntu-24.04
  echo Restart Windows, finish Ubuntu first-run setup, then run this file again.
  exit /b 1
)

wsl.exe -d "%DISTRO%" --exec true >nul 2>&1
if errorlevel 1 (
  echo Ubuntu-24.04 is not ready in WSL. In Administrator PowerShell, run:
  echo   wsl --install -d Ubuntu-24.04
  echo Finish the Ubuntu first-run username/password setup, then run this file again.
  exit /b 1
)

if /i "%ACTION%"=="deploy" goto deploy
if /i "%ACTION%"=="stop" goto stop
goto existing_action

:deploy
for /f "usebackq delims=" %%I in (`wsl.exe -d "%DISTRO%" -- wslpath -a "%~dp0"`) do set "WSL_DEPLOY_DIR=%%I"
if not defined WSL_DEPLOY_DIR (
  echo Could not translate the Windows project path into WSL.
  exit /b 1
)
wsl.exe -d "%DISTRO%" -- bash "%WSL_DEPLOY_DIR%/bootstrap.sh"
if errorlevel 1 exit /b 1
call :start_funnel
exit /b %errorlevel%

:existing_action
wsl.exe -d "%DISTRO%" -- bash -lc "bash ~/music-streamer/deploy/windows/app.sh %ACTION%"
if errorlevel 1 exit /b 1
if /i "%ACTION%"=="start" call :start_funnel
if /i "%ACTION%"=="status" (
  where tailscale.exe >nul 2>&1 && tailscale.exe funnel status
)
exit /b %errorlevel%

:stop
where tailscale.exe >nul 2>&1 && tailscale.exe funnel --https=443 off >nul 2>&1
where tailscale.exe >nul 2>&1 && taskkill /FI "WINDOWTITLE eq Music Streamer Funnel" /T /F >nul 2>&1
wsl.exe -d "%DISTRO%" -- bash -lc "bash ~/music-streamer/deploy/windows/app.sh stop"
exit /b %errorlevel%

:start_funnel
where tailscale.exe >nul 2>&1 || (
  echo App is running locally, but Tailscale for Windows is not installed.
  echo Install and sign in to Tailscale, then run: deploy.bat start
  exit /b 0
)
tailscale.exe status >nul 2>&1 || (
  echo App is running locally, but Tailscale is not signed in.
  echo Sign in to Tailscale, then run: deploy.bat start
  exit /b 0
)
echo Starting Tailscale Funnel in a separate window. Leave that window open while deployed.
start "Music Streamer Funnel" cmd.exe /k "tailscale.exe funnel --https=443 http://127.0.0.1:8000"
exit /b 0
