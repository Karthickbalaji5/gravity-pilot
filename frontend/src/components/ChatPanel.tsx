import React, { useEffect, useRef, useState } from "react";
import { Copy, Check, FileText, Table, Presentation, Image, Code2, Folder } from "lucide-react";
import { ChatMessage, GeneratedFile } from "../hooks/use-chat-stream";
import { C } from "../theme";

interface ChatPanelProps {
  msgs: ChatMessage[];
  mode: string;
  onSuggestion: (text: string) => void;
}

function FileCard({ file }: { file: GeneratedFile }) {
  const [copied, setCopied] = useState(false);

  const ext = (file.fileType || file.fileName.split(".").pop() || "").toLowerCase();
  
  let Icon = FileText;
  let iconColor = C.navy;
  if (["xlsx", "xls", "csv"].includes(ext)) {
    Icon = Table;
    iconColor = "#2E7D6B";
  } else if (["pptx", "ppt"].includes(ext)) {
    Icon = Presentation;
    iconColor = "#C9891A";
  } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    Icon = Image;
    iconColor = "#3E6B8A";
  } else if (["py", "js", "ts", "json", "html", "css"].includes(ext)) {
    Icon = Code2;
    iconColor = "#6366F1";
  } else {
    Icon = Folder;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(file.filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "#F8FAFC",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        marginTop: 6,
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Icon size={18} color={iconColor} style={{ flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: C.textPrim,
              fontFamily: "var(--dp-font-ui)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.fileName}
          </span>
          <span
            style={{
              fontSize: 10.5,
              color: C.textSec,
              fontFamily: "var(--dp-font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={file.filePath}
          >
            {file.filePath}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button
          onClick={handleCopy}
          title="Copy path to clipboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "white",
            border: `1px solid ${C.panelBorder}`,
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: "var(--dp-font-ui)",
            color: copied ? "#2E7D6B" : C.textSec,
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s ease",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy Path"}
        </button>

        <button
          onClick={async () => {
            if ((window as any).electronAPI?.openFile) {
              await (window as any).electronAPI.openFile(file.filePath);
              return;
            }
            try {
              await fetch("/api/open-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file_path: file.filePath }),
              });
            } catch (err) {
              console.error("Open file error:", err);
            }
          }}
          title="Open in native desktop application"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "#6366F1",
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--dp-font-ui)",
            color: "white",
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s ease",
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}

export function ChatPanel({ msgs, mode, onSuggestion }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const suggestions = [
    "Create an Excel attendance sheet for 10 students",
    "Create a leave letter",
    "Take a screenshot of my screen",
    "Search the web for the latest Python version",
    "Create a 5-slide PowerPoint about cloud computing",
  ];

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: C.bg,
      }}
    >
      {msgs.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            paddingBottom: 20,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: C.navy,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              boxShadow: "0 4px 12px rgba(31, 58, 95, 0.2)",
            }}
          >
            🤖
          </div>

          <div
            style={{
              textAlign: "left",
              maxWidth: 480,
              width: "100%",
              background: "white",
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 12,
              padding: "18px 22px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              fontFamily: "var(--dp-font-ui)",
            }}
          >
            <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: C.textPrim }}>
              Hi! I'm DesktopPilot AI, your intelligent desktop assistant.
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.textSec }}>
              I can help you with:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12.5, color: C.textPrim }}>
              <div>
                <strong>• File &amp; Folder Management:</strong> Create, rename, move, and delete files and folders.
              </div>
              <div>
                <strong>• Document Creation:</strong> Create Word documents, Excel spreadsheets, and PowerPoint presentations.
              </div>
              <div>
                <strong>• Code Generation:</strong> Generate code and development files from natural-language instructions.
              </div>
              <div>
                <strong>• Text &amp; Data Tasks:</strong> Summarize, transform, organize, and process text and data.
              </div>
              <div>
                <strong>• Web Search:</strong> Search the web and open relevant websites.
              </div>
              <div>
                <strong>• Desktop Tools:</strong> Take screenshots and open existing Jupyter notebooks (.ipynb).
              </div>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12, color: C.textSec, fontStyle: "italic" }}>
              You can type your request or use the microphone button.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 4,
              maxWidth: 480,
              width: "100%",
            }}
          >
            <span
              style={{
                fontFamily: "var(--dp-font-mono)",
                fontSize: 11,
                fontWeight: 600,
                color: C.textSec,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                textAlign: "center",
              }}
            >
              Suggested Prompts
            </span>
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                onClick={() => onSuggestion(s)}
                style={{
                  padding: "9px 14px",
                  background: "white",
                  border: `1px solid ${C.panelBorder}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  color: C.textPrim,
                  fontFamily: "var(--dp-font-ui)",
                  transition: "all 0.15s ease",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.slateBlue;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.panelBorder;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                👉 {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {msgs.map((m, i) => (
        <div
          key={m.id || i}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
            gap: 4,
            animation: "dp-node-in 0.2s ease-out",
          }}
        >
          {m.role !== "user" && m.agentName && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: m.agentColor || C.slateBlue,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--dp-font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: m.agentColor || C.slateBlue,
                  letterSpacing: 0.3,
                }}
              >
                {m.agentName}
              </span>
            </div>
          )}

          <div
            style={{
              maxWidth: "80%",
              padding: "12px 16px",
              borderRadius:
                m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background:
                m.role === "user"
                  ? C.navy
                  : m.kind === "error"
                  ? `${C.redMuted}10`
                  : m.kind === "clarification"
                  ? `${C.amber}10`
                  : "white",
              border:
                m.role === "user"
                  ? "none"
                  : m.kind === "error"
                  ? `1px solid ${C.redMuted}33`
                  : m.kind === "clarification"
                  ? `1px solid ${C.amber}44`
                  : `1px solid ${C.panelBorder}`,
              boxShadow: m.role === "user" ? "0 2px 6px rgba(31,58,95,0.2)" : "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            {m.kind === "clarification" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    background: `${C.amber}22`,
                    color: C.amber,
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontFamily: "var(--dp-font-mono)",
                    fontWeight: 600,
                    border: `1px solid ${C.amber}44`,
                  }}
                >
                  Clarification Needed
                </span>
              </div>
            )}

            <p
              style={{
                margin: 0,
                fontFamily: "var(--dp-font-ui)",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: m.role === "user" ? "white" : C.textPrim,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.text}
            </p>

            {m.items && m.items.length > 0 && (
              <ul
                style={{
                  margin: "8px 0 0",
                  padding: "0 0 0 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {m.items.map((it, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontFamily: "var(--dp-font-mono)",
                      fontSize: 11.5,
                      color: C.textSec,
                      lineHeight: 1.45,
                    }}
                  >
                    {it}
                  </li>
                ))}
              </ul>
            )}

            {/* Generated Output File Badges */}
            {m.generatedFiles && m.generatedFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.textSec,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    fontFamily: "var(--dp-font-mono)",
                    marginBottom: 4,
                  }}
                >
                  ✓ Generated Files
                </div>
                {m.generatedFiles.map((file, fIdx) => (
                  <FileCard key={fIdx} file={file} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
