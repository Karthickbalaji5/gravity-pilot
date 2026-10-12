# Gravity-Pilot AI — Unified Multi-Agent Platform with Nila 3D Companion

**Gravity-Pilot AI** is a production Windows desktop automation application featuring **Nila**, an animated 3D VRM 1.0 anime companion with real-time neural speech, audio-synchronized lip-sync, procedural breathing and blinking, and emotional morphs. The real work is performed by **Gravity-Pilot's LangGraph multi-agent architecture** combined with specialized **Agentic AI** tools.

## Quick Launch Entry Points
- **START_DESKTOP.bat**: Launches the unified Windows desktop application with floating 3D Nila companion.
- **START.bat**: Interactive launcher for Desktop Companion or Web Browser UI (http://localhost:5173).
- **STOP.bat**: Cleanly terminates all backend, frontend, and Electron processes. It supports dual-engine execution: fast cloud inference via **Groq** and completely private offline local execution via **Ollama (Llama 3)**.

---

## 1. System Architecture

```
User (Browser / Web Speech Voice)
              │
              ▼
   React + Vite Frontend (Port 5173)
              │  HTTP POST / Server-Sent Events (SSE)
              ▼
    FastAPI Backend Server (Port 8000)
              │
              ▼
   LangGraph Multi-Agent Workflow
              ├──► Model Router         (Selects Groq vs Ollama, enforces strict routing)
              ├──► Supervisor           (Classifies intent into task domain)
              ├──► Requirement Analyzer (Validates completeness / asks 1 clarifying question)
              ├──► Memory Agent         (Reads/writes session history to SQLite)
              ├──► Planning Agent       (Generates ordered execution steps)
              ├──► Task Coordinator     (Dispatches steps to specialized execution agents)
              │         │
              │         ├──► Document Agent  ──► tools.documents (Word, Excel, PowerPoint, Code)
              │         ├──► Desktop Agent   ──► tools.files, tools.screenshot, tools.notebook
              │         └──► Browser Agent   ──► tools.web_search (Multi-tier Bing/DDG/Wiki)
              │
              └──► Validation Agent     (Inspects output integrity & triggers replan if needed)
```

---

## 2. Directory Structure

```
Gravity-Pilot/
├── README.md               # Quick-start guide and system documentation
├── ARCHITECTURE.md         # Detailed developer architecture & lifecycle map
├── START.bat               # One-click Windows application launcher
├── STOP.bat                # Clean process terminator (frees ports 8000 & 5173)
├── .env                    # Active environment secrets and endpoint configuration
├── .env.example            # Environment template
├── requirements.txt        # Top-level Python dependency specification
│
├── backend/
│   ├── main.py             # Backend server entry point
│   ├── config.py           # Centralized configuration (Groq, Ollama, paths)
│   ├── requirements.txt    # Backend package dependencies
│   │
│   ├── api/
│   │   └── server.py       # FastAPI application, REST endpoints & SSE streaming
│   │
│   ├── agents/             # Multi-agent reasoning and orchestration nodes
│   │   ├── model_router.py         # Backend routing (Groq vs Ollama, no silent fallback)
│   │   ├── supervisor.py           # Task domain classifier
│   │   ├── requirement_analyzer.py # Clarification loop & completeness checks
│   │   ├── planning_agent.py       # PlanStep synthesis
│   │   ├── task_coordinator.py     # Execution step dispatcher
│   │   ├── document_agent.py       # Document orchestration agent
│   │   ├── desktop_agent.py        # Desktop automation agent
│   │   ├── browser_agent.py        # Web search & URL navigation agent
│   │   ├── memory_agent.py         # SQLite memory synchronization
│   │   └── validation_agent.py     # Structural verification & replan loop
│   │
│   ├── tools/              # Deterministic tool execution implementations
│   │   ├── documents.py    # Python-docx, OpenPyXL, Python-pptx, Code file generators
│   │   ├── files.py        # File & folder operations (create, copy, move, rename, delete)
│   │   ├── screenshot.py   # Desktop display capture (Pillow)
│   │   ├── notebook.py     # Jupyter Notebook launcher & existence verification
│   │   └── web_search.py   # Multi-provider web search pipeline & bot challenge rejection
│   │
│   ├── models/             # Shared Pydantic data schemas
│   │   ├── schemas.py      # Request/response API schemas
│   │   └── web_search.py   # Canonical search result data models & bot challenge detector
│   │
│   ├── graph/              # LangGraph compilation
│   │   ├── state.py        # Re-export of shared agent state
│   │   └── workflow.py     # Compiled StateGraph definition, nodes, and edges
│   │
│   ├── state/              # Shared state interfaces
│   │   ├── state.py        # AgentState, Capabilities, PlanStep definitions
│   │   └── session.py      # Session lifecycle methods
│   │
│   ├── memory/             # Persistent SQLite database storage
│   │   └── database.py     # Asynchronous database engine (aiosqlite)
│   │
│   ├── utils/              # Helper utilities
│   │   ├── json_utils.py   # Robust JSON extraction & repair from LLM outputs
│   │   └── helpers.py      # General formatting & path sanitization
│   │
│   ├── output/             # Central storage for all generated documents & outputs
│   │
│   └── tests/              # Comprehensive test suites
│       ├── test_file_tools.py          # Filesystem operations & protected path checks
│       ├── test_documents.py           # Word, Excel, PowerPoint, and Code generators
│       ├── test_screenshot.py          # Desktop screenshot capture
│       ├── test_notebook.py            # Jupyter Notebook handling
│       ├── test_web_search.py          # Web search & CAPTCHA detection
│       ├── test_groq.py                # Cloud Groq connectivity & generation
│       ├── test_ollama.py              # Local Ollama connectivity & zero-fallback
│       ├── test_sequential_tasks.py    # Multi-turn clarification & prompt isolation
│       └── run_all_tests.py            # Master test runner
│
├── frontend/               # Modern React + Vite web user interface
│   ├── src/
│   │   ├── App.tsx         # Main application container
│   │   ├── main.tsx        # React mount entry
│   │   ├── index.css       # Global styles & layout
│   │   ├── theme.ts        # Design tokens & color palette
│   │   ├── components/     # Modular UI panels
│   │   │   ├── ChatPanel.tsx   # Message stream, file downloads, voice indicators
│   │   │   ├── Sidebar.tsx     # Session list, new chat, delete chat
│   │   │   ├── StatusBar.tsx   # Dynamic backend & model status indicators
│   │   │   └── TracePanel.tsx  # Real-time multi-agent execution trace
│   │   ├── hooks/
│   │   │   └── use-chat-stream.ts # SSE stream listener & agent state tracker
│   │   ├── services/
│   │   │   └── api.ts          # Centralized API network client
│   │   └── types/
│   │       └── index.ts        # Shared TypeScript data contracts
│   └── package.json        # Frontend dependencies (React, Vite, Lucide)
│
└── archive/                # Safely archived legacy code and previous iterations
```

---

## 3. Prerequisites & Installation

### Prerequisites
- **Python 3.10+** (tested on Python 3.11)
- **Node.js 18+** and **npm**
- *(Optional for Local Mode)* **Ollama** installed with `llama3:latest`

### Installation
1. **Clone or navigate to the repository:**
   ```bash
   cd Gravity-Pilot
   ```
2. **Install Python backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Install Frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

---

## 4. Configuration (`.env`)

Create or update `.env` in the project root:

```ini
# Cloud LLM (Groq) — get your free key at https://console.groq.com
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b

# Local LLM (Ollama)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3:latest

# API Server
PORT=8000
HOST=0.0.0.0
```

---

## 5. Running the Application

### Option A: One-Click Startup (Windows)
Double-click `START.bat` or run:
```bat
START.bat
```
This automatically verifies dependencies, cleans stale ports, launches the FastAPI backend and Vite frontend, and opens `http://localhost:5173` in your browser.

To stop the services, run `STOP.bat`.

### Option B: Manual Startup

**1. (Optional) Start Ollama:**
```bash
ollama run llama3:latest
```

**2. Start Backend Server:**
```bash
python backend/main.py
```
*Backend runs on `http://localhost:8000` (API Docs: `http://localhost:8000/docs`).*

**3. Start Frontend Dev Server:**
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 6. Running Tests

Run the master test runner to verify all 9 test categories in one command:
```bash
python backend/tests/run_all_tests.py
```

Or run any individual test suite:
```bash
python backend/tests/test_file_tools.py       # Filesystem tools
python backend/tests/test_documents.py        # Word/Excel/PPTX/Code tools
python backend/tests/test_screenshot.py       # Screenshot capture
python backend/tests/test_notebook.py         # Notebook inspection
python backend/tests/test_web_search.py       # Web search & bot detection
python backend/tests/test_groq.py             # Cloud Groq
python backend/tests/test_ollama.py           # Local Ollama
python backend/tests/test_sequential_tasks.py # Multi-turn clarification & isolation
python backend/tests/test_replanning.py       # Replanning state transition & self-correction
```

---

## 7. Supported Capabilities & Example Prompts

| Capability | Example Prompt | Generated Output |
|---|---|---|
| **Word Document** | `"Create a Word document explaining artificial intelligence."` | `.docx` in `backend/output/` |
| **Excel Spreadsheet** | `"Create an Excel attendance sheet for 10 students."` | `.xlsx` in `backend/output/` |
| **PowerPoint** | `"Create a 4-slide PowerPoint about cloud computing."` | `.pptx` in `backend/output/` |
| **Python Code** | `"Write Python code to calculate Fibonacci numbers."` | `.py` in `backend/output/` |
| **Web Search** | `"Search the web for latest Python version"` | Structured results & source links |
| **Screenshot** | `"Take a screenshot of my screen"` | `.png` image |
| **File Operations** | `"Create a folder named project_docs on my Desktop"` | Desktop folder created |
| **Clarification Loop** | `"Create a leave letter"` | Agent asks for recipient and dates |
| **Local Mode** | Toggle status bar to **LOCAL** | 100% offline reasoning via Ollama |

---

## 8. Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| **"Local Ollama is unavailable"** | Ollama daemon is not running or model is missing | Run `ollama list` and start Ollama with `ollama run llama3:latest`. Check status bar indicator. |
| **"GROQ_API_KEY is missing"** | `.env` has no `GROQ_API_KEY` | Add your Groq API key from https://console.groq.com to `.env`. |
| **Port 8000 or 5173 in use** | Stale processes from previous run | Run `STOP.bat` or kill processes using `netstat -ano \| findstr :8000`. |
| **Search returns bot challenge** | Provider triggered CAPTCHA | Built-in fallback automatically routes to Bing / Wikipedia without failing. |

---

## 9. Research Benchmark & Reproducibility

DesktopPilot AI includes a full scientific benchmark suite (`Benchmark 2.0`) evaluating 50 diverse desktop automation tasks across 5 categories and 3 difficulty tiers:

```bash
# 1. Execute full 50-task benchmark
python research_experiment/benchmark_runner.py

# 2. Run physical human validation sampling
python research_experiment/run_human_validation.py

# 3. Verify 100% data consistency across trajectories and summary metrics
python research_experiment/verify_data_consistency.py

# 4. Programmatically regenerate all 10 research figures
python research_experiment/generate_charts.py
```

All raw trajectory logs are recorded in `research_experiment/trajectories/DT001.json` through `DT050.json`. Experimental results and data consistency reports are documented in `research_experiment/FINAL_EXPERIMENTAL_REPORT.md` and `research_experiment/FINAL_DATA_CONSISTENCY_REPORT.md`.
