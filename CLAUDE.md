# Gravity-Pilot rules
- NEVER read or search: node_modules/, archive/, backups/, .local/, nila_source/, research_experiment/, docs/, attached_assets/, backend/output/, frontend/public/*.vrm, any *.zip, *.pdf, *.lock, package-lock.json, __pycache__/
- Backend: Python FastAPI + LangGraph in backend/. Frontend: React + Vite + Electron in frontend/. Avatar: three-vrm in frontend/src/avatar/.
- LLM: Groq (openai/gpt-oss-120b) or Ollama, chosen in backend/agents/model_router.py via get_llm(backend).
- Keep existing tools in backend/tools/ unchanged unless told; wrap them, don't rewrite them.
- Be token-efficient: read only the files named in the task, use grep before reading whole files, no long explanations.
- After changes, run: python -m py_compile on edited .py files and `npx tsc --noEmit` in frontend/.