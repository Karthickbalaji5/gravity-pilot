import React from "react";
import { C } from "../theme";
import type { CompanionWindowMode } from "../types/nila";

export interface OllamaInfo {
  available: boolean;
  base_url?: string;
  models?: string[];
  active_model?: string;
  error?: string;
}

interface StatusBarProps {
  mode: string;
  setMode: (m: string) => void;
  isBackendOnline: boolean;
  ollamaInfo?: OllamaInfo | null;
  groqAvailable?: boolean;
  windowMode?: CompanionWindowMode;
  onWindowModeChange?: (m: CompanionWindowMode) => void;
}

export function StatusBar({
  mode,
  setMode,
  isBackendOnline,
  ollamaInfo,
  groqAvailable = true,
  windowMode = "split",
  onWindowModeChange,
}: StatusBarProps) {
  const isOllamaConnected = !!ollamaInfo?.available;
  const ollamaModelName = ollamaInfo?.active_model || "llama3:latest";

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        background: C.navy,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: `${C.slateBlue}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          🤖
        </div>
        <span
          style={{
            fontFamily: "var(--dp-font-ui)",
            fontSize: 15,
            fontWeight: 700,
            color: "white",
            letterSpacing: 0.3,
          }}
        >
          GravityPilot AI
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Backend Online/Offline indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--dp-font-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: isBackendOnline ? "#5AC994" : "#F06060",
            background: "rgba(255, 255, 255, 0.07)",
            padding: "4px 10px",
            borderRadius: 20,
            border: `1px solid ${isBackendOnline ? "#5AC99433" : "#F0606033"}`,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: isBackendOnline ? "#5AC994" : "#F06060",
              boxShadow: isBackendOnline ? "0 0 6px #5AC99488" : "0 0 6px #F0606088",
            }}
          />
          {isBackendOnline ? "Backend Online" : "Backend Offline"}
        </div>

        {/* Active Model & Engine Badge */}
        {mode === "ollama" ? (
          <div
            title={ollamaInfo?.error || `Connected to Ollama at ${ollamaInfo?.base_url || "127.0.0.1:11434"}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--dp-font-mono)",
              fontSize: 11,
              fontWeight: 500,
              color: isOllamaConnected ? "#5AC994" : "#F06060",
              background: isOllamaConnected ? "rgba(90, 201, 148, 0.08)" : "rgba(240, 96, 96, 0.08)",
              padding: "4px 10px",
              borderRadius: 20,
              border: `1px solid ${isOllamaConnected ? "rgba(90, 201, 148, 0.25)" : "rgba(240, 96, 96, 0.25)"}`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isOllamaConnected ? "#5AC994" : "#F06060",
                boxShadow: isOllamaConnected ? "0 0 6px #5AC99488" : "none",
              }}
            />
            {isOllamaConnected ? `Local • Ollama • ${ollamaModelName}` : "Local • ○ Ollama unavailable"}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--dp-font-mono)",
              fontSize: 11,
              fontWeight: 500,
              color: groqAvailable ? "#7EB2FF" : "#F06060",
              background: "rgba(126, 178, 255, 0.08)",
              padding: "4px 10px",
              borderRadius: 20,
              border: "1px solid rgba(126, 178, 255, 0.25)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: groqAvailable ? "#7EB2FF" : "#F06060",
                boxShadow: groqAvailable ? "0 0 6px #7EB2FF88" : "none",
              }}
            />
            Cloud • Groq • gpt-oss-120b
          </div>
        )}

        {/* Mode switcher */}
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            fontSize: 12,
          }}
        >
          {(["groq", "ollama"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "5px 12px",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--dp-font-ui)",
                fontSize: 11,
                fontWeight: 500,
                background: mode === m ? C.slateBlue : `${C.navy}88`,
                color: "white",
                transition: "all 0.15s ease",
              }}
            >
              {m === "groq" ? "☁ Cloud (Groq)" : "⊙ Local (Ollama)"}
            </button>
          ))}
        </div>

        {/* Layout Mode Switcher */}
        {onWindowModeChange && (
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
              fontSize: 12,
            }}
          >
            {[
              { id: "dashboard" as const, label: "📊 Dashboard" },
              { id: "split" as const, label: "🌓 Split" },
              { id: "companion" as const, label: "🧚 Companion" },
            ].map((lm) => (
              <button
                key={lm.id}
                onClick={() => onWindowModeChange(lm.id)}
                title={`Switch to ${lm.label} mode`}
                style={{
                  padding: "5px 10px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--dp-font-ui)",
                  fontSize: 11,
                  fontWeight: windowMode === lm.id ? 600 : 400,
                  background: windowMode === lm.id ? "#6366F1" : `${C.navy}88`,
                  color: "white",
                  transition: "all 0.15s ease",
                }}
              >
                {lm.label}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
