@echo off
REM ── Build backend into a single folder with PyInstaller ──────────────
REM Run from repository root:  scripts\build_backend.bat
REM Output lands in backend-dist\  (referenced by electron-builder extraResources)

cd /d "%~dp0..\backend"

echo [1/3] Installing PyInstaller if needed...
pip install pyinstaller --quiet

echo [2/3] Running PyInstaller...
pyinstaller --noconfirm --clean ^
  --name gravity-pilot-backend ^
  --distpath "..\backend-dist" ^
  --workpath "..\build\pyinstaller" ^
  --specpath "..\build" ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.lifespan ^
  --hidden-import uvicorn.lifespan.on ^
  --hidden-import uvicorn.lifespan.off ^
  --hidden-import uvicorn.protocols ^
  --hidden-import uvicorn.protocols.http ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.http.httptools_impl ^
  --hidden-import uvicorn.protocols.websockets ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.protocols.websockets.wsproto_impl ^
  --hidden-import aiosqlite ^
  --hidden-import sqlalchemy.dialects.sqlite ^
  --collect-submodules langchain_core ^
  --collect-submodules langchain_groq ^
  --collect-submodules langchain_ollama ^
  --collect-submodules langchain_community ^
  main.py

if errorlevel 1 (
  echo [ERROR] PyInstaller build failed.
  exit /b 1
)

echo [3/3] Copying data directories...
if not exist "..\backend-dist\gravity-pilot-backend\data" mkdir "..\backend-dist\gravity-pilot-backend\data"
if exist "output" xcopy /E /I /Y "output" "..\backend-dist\gravity-pilot-backend\output"

echo.
echo ✅  Backend packaged into backend-dist\gravity-pilot-backend\
echo     The Electron build (npm run dist) will bundle it automatically.
