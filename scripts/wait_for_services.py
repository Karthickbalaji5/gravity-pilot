"""
wait_for_services.py — Health monitor for START.bat launcher.
Polls FastAPI backend (port 8000) and Vite frontend (port 5173).
Once both are responsive, opens the browser.
"""
from __future__ import annotations

import sys
import time
import urllib.request
import webbrowser

BACKEND_URL = "http://localhost:8000/health"
FRONTEND_URL = "http://localhost:5173"
MAX_ATTEMPTS = 45  # 45 * 0.5s = 22.5s maximum wait

backend_ready = False
frontend_ready = False

print("[INFO] Waiting for GravityPilot services to initialize...")

for attempt in range(1, MAX_ATTEMPTS + 1):
    if not backend_ready:
        try:
            req = urllib.request.Request(BACKEND_URL, headers={"User-Agent": "GravityPilot-Launcher"})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    backend_ready = True
                    print("  [+] FastAPI Backend is online    (http://localhost:8000)")
        except Exception:
            pass

    if not frontend_ready:
        try:
            req = urllib.request.Request(FRONTEND_URL, headers={"User-Agent": "GravityPilot-Launcher"})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    frontend_ready = True
                    print("  [+] Vite Web Interface is online (http://localhost:5173)")
        except Exception:
            pass

    if backend_ready and frontend_ready:
        break

    time.sleep(0.5)

is_desktop = "--desktop" in sys.argv

if backend_ready:
    print("\n[SUCCESS] GravityPilot + Nila AI is operational!")
    if is_desktop:
        print("[INFO] Launching Nila 3D Desktop Companion (Electron)...")
        import subprocess
        subprocess.Popen("npm run desktop", cwd="frontend", shell=True)
    else:
        print("[INFO] Launching browser to http://localhost:5173 ...")
        webbrowser.open(FRONTEND_URL)
    sys.exit(0)
else:
    print("\n[WARNING] Services took longer than expected to start.")
    print("Please check the minimized console windows on your taskbar for detailed logs.")
    if is_desktop:
        import subprocess
        subprocess.Popen("npm run desktop", cwd="frontend", shell=True)
    else:
        webbrowser.open(FRONTEND_URL)
    sys.exit(1)

