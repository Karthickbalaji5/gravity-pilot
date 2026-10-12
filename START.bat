@echo off
setlocal enabledelayedexpansion

title GravityPilot AI Launcher
cd /d "%~dp0"

echo ========================================================
echo                 GRAVITYPILOT AI STARTUP
echo ========================================================
echo.

:: 1. Check Python installation
echo [1/6] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python was not found in your system PATH!
    echo Please install Python 3.10+ from https://www.python.org/
    echo Ensure "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [OK] Found %%v

:: 2. Check Node.js and npm
echo.
echo [2/6] Checking Node.js and npm...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js was not found in your system PATH!
    echo Please install Node.js LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [OK] Found Node.js %%v

call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm was not found in your system PATH!
    echo Please install Node.js with npm included.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('call npm --version 2^>^&1') do echo [OK] Found npm v%%v

:: 3. Check / Create .env configuration
echo.
echo [3/6] Checking configuration (.env)...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [INFO] Created .env template from .env.example.
    )
)

set "HAS_GROQ=0"
if exist ".env" (
    for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
        if /i "%%A"=="GROQ_API_KEY" (
            if not "%%B"=="" (
                set "HAS_GROQ=1"
            )
        )
    )
)

if "%HAS_GROQ%"=="0" (
    echo [NOTICE] GROQ_API_KEY is not configured in .env.
    echo Cloud inference will use Local Ollama or prompts will prompt for key.
    echo To enable fast cloud reasoning, add your free key to .env:
    echo   https://console.groq.com
) else (
    echo [OK] Cloud API key detected in .env.
)

:: 4. Clean existing stale processes on ports 8000 and 5173
echo.
echo [4/6] Checking port availability...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo [INFO] Freeing port 8000 - PID %%a
    taskkill /F /T /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo [INFO] Freeing port 5173 - PID %%a
    taskkill /F /T /PID %%a >nul 2>&1
)
echo [OK] Ports 8000 and 5173 are ready.

:: 5. Ensure dependencies are present
echo.
echo [5/6] Verifying dependencies...
python -c "import fastapi, langgraph, docx, openpyxl, pptx, aiosqlite" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing missing Python backend dependencies...
    python -m pip install -r backend\requirements.txt
) else (
    echo [OK] Python dependencies verified.
)

if not exist "frontend\node_modules\" (
    echo [INFO] Installing frontend packages - first run...
    cd frontend && call npm install && cd ..
) else (
    echo [OK] Frontend packages verified.
)

:: 6. Launch Services
echo.
echo [6/6] Launching GravityPilot Services...
echo [INFO] Starting FastAPI Backend on port 8000...
start "GravityPilot Backend" cmd /k "title GravityPilot Backend (Port 8000) && python backend\main.py"

echo [INFO] Starting Vite Frontend on port 5173...
start "GravityPilot Frontend" cmd /k "title GravityPilot Frontend (Port 5173) && cd frontend && npm run dev"

echo.
:: Run Python health monitor which waits for both services and opens browser
python scripts\wait_for_services.py

echo.
echo ========================================================
echo   GRAVITYPILOT AI + NILA 3D COMPANION IS RUNNING
echo ========================================================
echo.
echo   Web UI:        http://localhost:5173
echo   Desktop App:   START_DESKTOP.bat (or press [D] below)
echo   API Docs:      http://localhost:8000/docs
echo   API Health:    http://localhost:8000/health
echo.
echo   Backend and Frontend are running in dedicated windows.
echo   To stop all services cleanly, run STOP.bat or press [Q].
echo ========================================================
echo.

:monitor_loop
set "USER_CMD="
set /p USER_CMD="[Q] Quit | [R] Reopen Web UI | [D] Launch Desktop Companion: "
if /i "%USER_CMD%"=="Q" goto shutdown
if /i "%USER_CMD%"=="R" (
    start http://localhost:5173
    goto monitor_loop
)
if /i "%USER_CMD%"=="D" (
    echo [INFO] Launching Nila 3D Desktop Companion...
    start "" cmd /c "cd frontend && npm run desktop"
    goto monitor_loop
)
goto monitor_loop

:shutdown
echo.
echo [INFO] Stopping all GravityPilot services...
call "%~dp0STOP.bat"
echo [OK] All services stopped.
ping 127.0.0.1 -n 3 >nul
exit /b 0
