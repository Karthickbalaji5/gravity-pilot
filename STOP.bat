@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Stopping GravityPilot Services...
echo ========================================================

set KILLED=0

:: Terminate process on Port 8000 (FastAPI Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo [INFO] Stopping Backend process on port 8000 - PID %%a
    taskkill /F /T /PID %%a >nul 2>&1
    set KILLED=1
)

:: Terminate process on Port 5173 (Vite Frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo [INFO] Stopping Frontend process on port 5173 - PID %%a
    taskkill /F /T /PID %%a >nul 2>&1
    set KILLED=1
)

:: Close any residual cmd windows with GravityPilot titles
taskkill /F /FI "WINDOWTITLE eq GravityPilot Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq GravityPilot Frontend*" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

if "%KILLED%"=="1" (
    echo [SUCCESS] GravityPilot services stopped cleanly.
) else (
    echo [INFO] No active GravityPilot services were found on ports 8000 or 5173.
)

echo ========================================================
exit /b 0
