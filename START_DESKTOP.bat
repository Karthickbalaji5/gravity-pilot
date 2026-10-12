@echo off
setlocal enabledelayedexpansion

title GravityPilot AI + Nila 3D Companion Launcher
cd /d "%~dp0"

echo ========================================================
echo        GRAVITYPILOT AI + NILA 3D COMPANION
echo ========================================================
echo.

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in PATH!
    pause
    exit /b 1
)

:: 2. Check Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in PATH!
    pause
    exit /b 1
)

:: 3. Free ports 8000 and 5173 if busy
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)

:: 4. Launch Backend Server
echo [1/3] Starting FastAPI Agent Backend on port 8000...
start "GravityPilot Backend" cmd /k "title GravityPilot Backend (Port 8000) && python backend\main.py"

:: 5. Launch Vite Frontend Dev Server
echo [2/3] Starting Vite Frontend on port 5173...
start "GravityPilot Frontend" cmd /k "title GravityPilot Frontend (Port 5173) && cd frontend && npm run dev"

:: 6. Launch Desktop Electron Companion once services are online
echo [3/3] Initializing Nila 3D Desktop Companion...
python scripts\wait_for_services.py --desktop

echo.
echo ========================================================
echo   GRAVITYPILOT + NILA 3D COMPANION IS ACTIVE
echo ========================================================
echo   Desktop Window: Nila 3D Transparent Floating Avatar
echo   Web Interface:  http://localhost:5173
echo   FastAPI Docs:   http://localhost:8000/docs
echo.
echo   Press [Q] then Enter to stop all services.
echo ========================================================
echo.

:monitor_loop
set "USER_CMD="
set /p USER_CMD="[Q] Quit | [R] Reopen Web UI | [D] Reopen Desktop App: "
if /i "%USER_CMD%"=="Q" goto shutdown
if /i "%USER_CMD%"=="R" (
    start http://localhost:5173
    goto monitor_loop
)
if /i "%USER_CMD%"=="D" (
    cd frontend && start npm run desktop && cd ..
    goto monitor_loop
)
goto monitor_loop

:shutdown
echo.
echo [INFO] Stopping all GravityPilot services...
call "%~dp0STOP.bat"
echo [OK] All services stopped.
exit /b 0
