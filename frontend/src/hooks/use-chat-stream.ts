import { useState, useCallback, useRef } from "react";
import { C } from "../theme";
import type { CompanionTaskState } from "../types/nila";

export type AgentId =
  | "model_router"
  | "supervisor"
  | "requirement_analyzer"
  | "memory_agent"
  | "planning_agent"
  | "task_coordinator"
  | "document_agent"
  | "desktop_agent"
  | "browser_agent"
  | "validation_agent";

export type AgentStatus = "idle" | "active" | "done" | "failed" | "unavailable" | "retrying";

export interface Agent {
  id: AgentId;
  name: string;
  color: string;
  status: AgentStatus;
  detail?: string;
}

export interface GeneratedFile {
  taskId?: string;
  sessionId?: string;
  filePath: string;
  fileName: string;
  fileType: string;
  status?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  taskId?: string;
  role: "user" | "assistant" | "agent";
  agentName?: string;
  agentColor?: string;
  kind?: "normal" | "clarification" | "error";
  text: string;
  items?: string[];
  generatedFiles?: GeneratedFile[];
  createdAt?: string;
}

export function buildAgents(mode: string): Agent[] {
  return [
    { id: "model_router",          name: "Model Router",          color: C.navy,      status: "idle" },
    { id: "supervisor",            name: "Supervisor",            color: C.navy,      status: "idle" },
    { id: "requirement_analyzer",  name: "Requirement Analyzer",  color: C.teal,      status: "idle" },
    { id: "memory_agent",          name: "Memory Agent",          color: C.slateBlue, status: "idle" },
    { id: "planning_agent",        name: "Planning Agent",        color: C.amber,     status: "idle" },
    { id: "task_coordinator",      name: "Task Coordinator",      color: C.slateBlue, status: "idle" },
    { id: "document_agent",        name: "Document Agent",        color: C.slateBlue, status: "idle" },
    { id: "desktop_agent",         name: "Desktop Agent",         color: C.slateBlue, status: "idle" },
    { id: "browser_agent",         name: "Browser Agent",         color: C.slateBlue, status: mode === "ollama" ? "unavailable" : "idle" },
    { id: "validation_agent",      name: "Validation Agent",      color: C.teal,      status: "idle" },
  ];
}

export function useChatStream(mode: string) {
  const [agents, setAgents] = useState<Agent[]>(() => buildAgents(mode));
  const [streamingMessages, setStreamingMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [retryActive, setRetryActive] = useState(false);
  const [taskState, setTaskState] = useState<CompanionTaskState>("IDLE");
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);

  const abortCurrentStream = useCallback(() => {
    activeTaskIdRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingMessages([]);
    setAgents(buildAgents(mode));
    setRetryActive(false);
    setTaskState("CANCELLED");
  }, [mode]);

  const send = useCallback(
    async (text: string, targetSessionId: string, onDone: () => void, targetTaskId?: string) => {
      if (!targetSessionId) return;

      // Abort any existing active stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const assignedTaskId = targetTaskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      activeTaskIdRef.current = assignedTaskId;

      setIsStreaming(true);
      setStreamingMessages([]);
      setAgents(buildAgents(mode));
      setRetryActive(false);
      // Immediately set THINKING when planning begins
      setTaskState("THINKING");

      try {
        const response = await fetch(`/api/chat/sessions/${targetSessionId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, task_id: assignedTaskId, model_backend: mode }),
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error("No response body received from stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Drop events if this task has been superseded or cancelled
          if (activeTaskIdRef.current !== assignedTaskId) {
            reader.cancel();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (part.startsWith("data: ")) {
              const dataStr = part.slice(6).trim();
              if (!dataStr) continue;

              try {
                const data = JSON.parse(dataStr);

                // Stream isolation: Verify event belongs to this session and current active task
                if (data.session_id && data.session_id !== targetSessionId) continue;
                if (data.task_id && data.task_id !== assignedTaskId) continue;
                if (activeTaskIdRef.current !== assignedTaskId) continue;

                if (data.type === "token") {
                  // Live token streaming from Nila agent
                  setStreamingMessages((prev) => {
                    const liveId = `live_${assignedTaskId}`;
                    const existing = prev.find((m) => m.id === liveId);
                    if (existing) {
                      return prev.map((m) =>
                        m.id === liveId
                          ? { ...m, text: m.text + (data.text || "") }
                          : m
                      );
                    }
                    return [
                      ...prev,
                      {
                        id: liveId,
                        sessionId: targetSessionId,
                        taskId: assignedTaskId,
                        role: "agent",
                        agentName: "Nila",
                        agentColor: C.teal,
                        kind: "normal",
                        text: data.text || "",
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                  setTaskState("EXECUTING");
                } else if (data.type === "tool_start") {
                  setTaskState("EXECUTING");
                } else if (data.type === "tool_end") {
                  // tool finished, stay in EXECUTING
                } else if (data.type === "task_start") {
                  setTaskState("THINKING");
                } else if (data.type === "task_state") {
                  if (data.status === "waiting_for_user") {
                    setTaskState("NEEDS_INPUT");
                  } else if (data.status === "completed") {
                    setTaskState("COMPLETED");
                  } else if (data.status === "failed") {
                    setTaskState("FAILED");
                  }
                } else if (data.type === "agent_update") {
                  setAgents((prev) =>
                    prev.map((a) =>
                      a.id === data.agent
                        ? { ...a, status: data.status, detail: data.detail }
                        : a
                    )
                  );

                  if (["document_agent", "desktop_agent", "browser_agent"].includes(data.agent)) {
                    setTaskState("EXECUTING");
                  } else if (data.agent === "validation_agent") {
                    setTaskState("VALIDATING");
                  } else if (["requirement_analyzer", "planning_agent", "model_router", "task_coordinator"].includes(data.agent)) {
                    setTaskState("THINKING");
                  }

                  if (data.agent === "planning_agent" && data.status === "retrying") {
                    setRetryActive(true);
                    setTaskState("THINKING");
                  } else if (
                    data.agent === "planning_agent" &&
                    (data.status === "active" || data.status === "idle")
                  ) {
                    setRetryActive(false);
                  }
                } else if (data.type === "message") {
                  if (data.kind === "clarification") {
                    setTaskState("NEEDS_INPUT");
                  } else if (data.kind === "error") {
                    setTaskState("FAILED");
                  }

                  const generatedFiles: GeneratedFile[] = (data.generated_files || []).map((f: any) => ({
                    taskId: f.task_id,
                    sessionId: f.session_id,
                    filePath: f.file_path,
                    fileName: f.file_name || f.file_path.split(/[\\/]/).pop(),
                    fileType: f.file_type,
                    status: f.status,
                  }));

                  const liveId = `live_${assignedTaskId}`;
                  setStreamingMessages((prev) => {
                    const withoutLive = prev.filter((m) => m.id !== liveId);
                    return [
                      ...withoutLive,
                      {
                        id: Date.now().toString() + Math.random().toString(),
                        sessionId: targetSessionId,
                        taskId: assignedTaskId,
                        role: "agent",
                        agentName: data.agentName,
                        agentColor: data.agentColor,
                        kind: data.kind || "normal",
                        text: data.text,
                        items: data.items,
                        generatedFiles,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  });
                } else if (data.type === "done") {
                  // Stream completed for this turn
                }
              } catch (e) {
                console.error("Failed to parse SSE payload:", e, dataStr);
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError" || activeTaskIdRef.current !== assignedTaskId) {
          // Stream deliberately cancelled by user (e.g. New Chat / Reset)
          setTaskState("CANCELLED");
          return;
        }
        console.error("Stream connection error:", err);
        setTaskState("FAILED");
        setStreamingMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            sessionId: targetSessionId,
            taskId: assignedTaskId,
            role: "agent",
            agentName: "System",
            agentColor: C.redMuted,
            kind: "error",
            text: `Connection error: ${err.message || "Failed to reach backend."}. Ensure backend is running on port 8000.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
        onDone();
      }
    },
    [mode]
  );

  return {
    agents,
    setAgents,
    streamingMessages,
    setStreamingMessages,
    isStreaming,
    taskState,
    setTaskState,
    send,
    retryActive,
    abortCurrentStream,
  };
}
