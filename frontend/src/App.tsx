import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Send,
  AlertCircle,
  Settings,
  Layout,
  Volume2,
  VolumeX,
  Sparkles,
  Maximize2,
  Minimize2,
  FolderOpen,
} from "lucide-react";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { TracePanel } from "./components/TracePanel";
import { NilaAvatarViewport } from "./components/NilaAvatarViewport";
import { NilaSettingsModal } from "./components/NilaSettingsModal";
import { ScreenshotModal } from "./components/ScreenshotModal";
import { useChatStream, ChatMessage } from "./hooks/use-chat-stream";
import { VRMManager } from "./avatar/VRMManager";
import { PetBrain } from "./avatar/PetBrain";
import { ttsService } from "./services/tts";
import { C } from "./theme";
import type { CompanionTaskState, CompanionWindowMode, EmotionType, ActionTag, VoiceSettings } from "./types/nila";
import { SessionItem, OllamaInfo, VoiceState } from "./types";
import {
  fetchHealth,
  fetchOllamaHealth,
  fetchSessions,
  createSession,
  deleteSessionApi,
  fetchSessionHistory,
} from "./services/api";

export default function App() {
  const [mode, setMode] = useState<string>("groq");
  const [ollamaInfo, setOllamaInfo] = useState<OllamaInfo | null>(null);
  const [groqAvailable, setGroqAvailable] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceState>("idle");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);

  // Nila Companion State
  const vrmManagerRef = useRef<VRMManager | null>(null);
  const [windowMode, setWindowMode] = useState<CompanionWindowMode>("split");
  const [companionName, setCompanionName] = useState<string>("Nila");
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>("relaxed");
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState<boolean>(true);
  const [splitAvatarWidth, setSplitAvatarWidth] = useState<number>(560);
  const [isResizingSplit, setIsResizingSplit] = useState<boolean>(false);

  // Pet mode state
  const petBrainRef = useRef<PetBrain | null>(null);
  const [petSpeechBubble, setPetSpeechBubble] = useState<string | null>(null);
  const [showPetInput, setShowPetInput] = useState(false);
  const petSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isResizingSplit) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(380, Math.min(880, e.clientX - 220));
      setSplitAvatarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizingSplit(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSplit]);

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    language: "en",
    rate: 1.0,
    pitch: 1.0,
    muted: false,
    preferredVoice: "en-US-AnaNeural",
  });

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const ttsStreamActiveRef = useRef(false);

  const emotionCallbacks = useMemo(() => ({
    onEmotion: (e: EmotionType) => {
      setCurrentEmotion(e);
    },
    onGesture: (g: any) => {
      vrmManagerRef.current?.playGesture(g);
    },
    onAction: (a: ActionTag) => {
      vrmManagerRef.current?.playAction(a);
    },
  }), []);

  const {
    agents,
    streamingMessages,
    isStreaming,
    taskState,
    setTaskState,
    send,
    retryActive,
    abortCurrentStream,
  } = useChatStream(mode, emotionCallbacks);

  const [isClickThrough, setIsClickThrough] = useState<boolean>(false);
  const [quietMode, setQuietMode] = useState<boolean>(false);
  const lastInteractionRef = useRef<number>(Date.now());
  const lastProactiveRef = useRef<number>(0);
  const proactiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Synchronize layout mode and click-through with Electron IPC
  useEffect(() => {
    if ((window as any).electronAPI?.onLayoutChange) {
      (window as any).electronAPI.onLayoutChange((newMode: CompanionWindowMode) => {
        setWindowMode(newMode);
      });
    }
    if ((window as any).electronAPI?.onClickThroughChange) {
      (window as any).electronAPI.onClickThroughChange((active: boolean) => {
        setIsClickThrough(active);
      });
    }
    if ((window as any).electronAPI?.getClickThrough) {
      (window as any).electronAPI.getClickThrough().then((active: boolean) => {
        setIsClickThrough(active);
      });
    }
    if ((window as any).electronAPI?.onQuietModeChange) {
      (window as any).electronAPI.onQuietModeChange((enabled: boolean) => {
        setQuietMode(enabled);
      });
    }
    if ((window as any).electronAPI?.getQuietMode) {
      (window as any).electronAPI.getQuietMode().then((q: boolean) => setQuietMode(q));
    }
    // Push-to-talk: Ctrl+Shift+Space via Electron IPC
    if ((window as any).electronAPI?.onPushToTalk) {
      (window as any).electronAPI.onPushToTalk((pressed: boolean) => {
        if (pressed) {
          toggleVoiceInput();
        } else {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }
      });
    }
  }, []);

  // Track user interaction for proactive idle check-in
  useEffect(() => {
    const mark = () => { lastInteractionRef.current = Date.now(); };
    window.addEventListener("keydown", mark);
    window.addEventListener("mousedown", mark);
    window.addEventListener("touchstart", mark);
    return () => {
      window.removeEventListener("keydown", mark);
      window.removeEventListener("mousedown", mark);
      window.removeEventListener("touchstart", mark);
    };
  }, []);

  // Proactive greeting on start + idle check-in
  useEffect(() => {
    if (quietMode) return;

    // Time-of-day greeting on first mount
    const hour = new Date().getHours();
    let greeting: string;
    if (hour < 12) greeting = "[proactive: good morning greeting]";
    else if (hour < 17) greeting = "[proactive: good afternoon greeting]";
    else greeting = "[proactive: good evening greeting]";

    const greetTimeout = setTimeout(() => {
      if (!quietMode && sessionId) {
        send(greeting, sessionId, () => { loadHistory(sessionId!); });
        lastProactiveRef.current = Date.now();
      }
    }, 2000);

    // Idle check-in every 5 min, trigger after 30 min idle, cap 1/hour
    proactiveTimerRef.current = setInterval(() => {
      if (quietMode || isStreaming) return;
      const now = Date.now();
      const idle = now - lastInteractionRef.current;
      const sinceLastProactive = now - lastProactiveRef.current;
      if (idle >= 30 * 60 * 1000 && sinceLastProactive >= 60 * 60 * 1000 && sessionId) {
        send("[proactive: user idle 30 min]", sessionId, () => { loadHistory(sessionId!); });
        lastProactiveRef.current = now;
      }
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(greetTimeout);
      if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quietMode, sessionId]);

  // Smart click-through in companion mode: raycast on mousemove
  useEffect(() => {
    if (windowMode !== "companion" || !(window as any).electronAPI?.setIgnoreMouseEvents) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      const mgr = vrmManagerRef.current;
      if (!mgr) return;
      const hit = mgr.hitTest(e.clientX, e.clientY);
      (window as any).electronAPI.setIgnoreMouseEvents(!hit, { forward: true });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [windowMode]);

  // Avatar drag-to-move in companion mode
  const handleAvatarMouseDown = useCallback((e: React.MouseEvent) => {
    if (windowMode !== "companion" || !(window as any).electronAPI?.dragMove) return;
    const mgr = vrmManagerRef.current;
    if (!mgr || !mgr.hitTest(e.clientX, e.clientY)) return;

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    (window as any).electronAPI.startDrag();

    const onMove = (ev: MouseEvent) => {
      const dx = ev.screenX - dragStartRef.current.x;
      const dy = ev.screenY - dragStartRef.current.y;
      dragStartRef.current = { x: ev.screenX, y: ev.screenY };
      (window as any).electronAPI.dragMove(dx, dy);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [windowMode]);

  const handleWindowModeChange = (newMode: CompanionWindowMode) => {
    setWindowMode(newMode);
    if ((window as any).electronAPI?.setWindowMode) {
      (window as any).electronAPI.setWindowMode(newMode);
    }
  };

  // Update body class for transparent companion mode (pet mode handled separately)
  useEffect(() => {
    if (windowMode === "companion") {
      document.body.classList.add("electron-transparent");
      document.documentElement.classList.add("electron-transparent");
    } else if (windowMode !== "pet") {
      document.body.classList.remove("electron-transparent");
      document.documentElement.classList.remove("electron-transparent");
    }
  }, [windowMode]);

  // Pet mode initialization
  useEffect(() => {
    if (windowMode !== "pet") {
      if (petBrainRef.current) { petBrainRef.current.stop(); petBrainRef.current = null; }
      vrmManagerRef.current?.setPetMode(false);
      return;
    }

    document.body.classList.add("electron-transparent");
    document.documentElement.classList.add("electron-transparent");
    vrmManagerRef.current?.setPetMode(true);

    const brain = new PetBrain();
    petBrainRef.current = brain;

    brain.onAction = (action) => {
      vrmManagerRef.current?.playAction(action as ActionTag);
    };
    brain.onSpeak = (text) => {
      if (petSpeechTimerRef.current) clearTimeout(petSpeechTimerRef.current);
      setPetSpeechBubble(text);
      petSpeechTimerRef.current = setTimeout(() => setPetSpeechBubble(null), 6000);
    };
    brain.onMoveBy = (dx, dy) => {
      (window as any).electronAPI?.petMoveBy?.(dx, dy);
    };

    brain.start();

    return () => {
      brain.stop();
      document.body.classList.remove("electron-transparent");
      document.documentElement.classList.remove("electron-transparent");
    };
  }, [windowMode]);

  // Pet mode keyboard shortcut: Ctrl+Shift+Space to toggle mini chat
  useEffect(() => {
    if (windowMode !== "pet") return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        setShowPetInput(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [windowMode]);

  // Health check
  const checkHealth = useCallback(async () => {
    const health = await fetchHealth();
    setIsBackendOnline(health.backendOnline);
    setGroqAvailable(health.groqAvailable);

    const oinfo = await fetchOllamaHealth();
    setOllamaInfo(oinfo);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    const list = await fetchSessions();
    setSessions(list);
    if (!sessionId && list.length > 0) {
      setSessionId(list[0].id);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load history messages when active session changes
  const loadHistory = useCallback(async (sid: string) => {
    const msgs = await fetchSessionHistory(sid);
    setHistoryMessages(msgs);
    setOptimisticMessages([]);
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadHistory(sessionId);
    } else {
      setHistoryMessages([]);
      setOptimisticMessages([]);
    }
  }, [sessionId, loadHistory]);

  const combinedMessages = useMemo(() => {
    return [...historyMessages, ...optimisticMessages, ...streamingMessages];
  }, [historyMessages, optimisticMessages, streamingMessages]);

  // Sentence-streaming TTS: start a TTS stream when streaming begins,
  // push tokens as the live message grows, flush when streaming ends.
  useEffect(() => {
    if (voiceSettings.muted) return;

    if (isStreaming && !ttsStreamActiveRef.current) {
      ttsStreamActiveRef.current = true;
      ttsService.startStream(vrmManagerRef.current, {
        voice: voiceSettings.preferredVoice,
        rate: voiceSettings.rate,
        pitch: voiceSettings.pitch,
        onEmotionChange: (e) => setCurrentEmotion(e),
        onEnd: () => {
          setIsSpeaking(false);
          ttsStreamActiveRef.current = false;
        },
      });
      setIsSpeaking(true);
    }

    if (isStreaming && ttsStreamActiveRef.current && streamingMessages.length > 0) {
      const liveMsg = streamingMessages.find((m) => m.id.startsWith("live_"));
      if (liveMsg && liveMsg.text && liveMsg.id !== lastSpokenMessageIdRef.current) {
        const prevLen = parseInt(lastSpokenMessageIdRef.current || "0", 10) || 0;
        const newText = liveMsg.text.slice(prevLen);
        if (newText) {
          ttsService.pushTokens(newText, currentEmotion);
          lastSpokenMessageIdRef.current = String(liveMsg.text.length);
        }
      }
    }

    if (!isStreaming && ttsStreamActiveRef.current) {
      ttsService.flush();
      ttsStreamActiveRef.current = false;
      lastSpokenMessageIdRef.current = null;
    }
  }, [streamingMessages, isStreaming, voiceSettings, currentEmotion]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Stop speaking if currently speaking
    ttsService.cancel(vrmManagerRef.current);
    setIsSpeaking(false);
    if (vrmManagerRef.current) {
      vrmManagerRef.current.setSpeaking(false);
    }

    // Play greeting wave gesture if user greets Nila
    const isGreeting = /\b(hi|hello|hey|namaste|vanakkam|good morning|good afternoon|good evening|sup|howdy)\b/i.test(text.trim());
    if (isGreeting && vrmManagerRef.current) {
      vrmManagerRef.current.playGesture('GREETING');
    }

    if (mode === "ollama" && ollamaInfo && !ollamaInfo.available) {
      alert(`Local Ollama is unavailable: ${ollamaInfo.error || "Please start Ollama on http://127.0.0.1:11434"}`);
      return;
    }

    let targetSid = sessionId;
    if (!targetSid) {
      targetSid = Date.now().toString() + Math.random().toString(36).substring(2, 8);
      setSessionId(targetSid);
      setSessions((prev) => [
        { id: targetSid!, title: text.slice(0, 35), updated_at: new Date().toISOString() },
        ...prev,
      ]);
    }

    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        sessionId: targetSid!,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    ]);

    setInput("");

    await send(text, targetSid, () => {
      loadHistory(targetSid!);
      loadSessions();
    });
  };

  const handleNewChat = async () => {
    ttsService.cancel(vrmManagerRef.current);
    abortCurrentStream();
    setHistoryMessages([]);
    setOptimisticMessages([]);
    setInput("");
    setVoiceStatus("idle");
    setVoiceMessage(null);
    setTaskState("IDLE");

    const newId = await createSession("New Chat");
    const activeId = newId || Date.now().toString() + Math.random().toString(36).substring(2, 8);
    setSessionId(activeId);
    setSessions((prev) => [
      { id: activeId, title: "New Chat", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ...prev,
    ]);
  };

  const handleSelectSession = (id: string) => {
    if (id === sessionId) return;
    ttsService.cancel(vrmManagerRef.current);
    abortCurrentStream();
    setSessionId(id);
    setTaskState("IDLE");
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSessionApi(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (sessionId === id) {
      handleNewChat();
    }
  };

  // MediaRecorder-based voice input with backend STT (works in Electron)
  const toggleVoiceInput = () => {
    if (voiceStatus === "listening") {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setVoiceStatus("idle");
      setVoiceMessage(null);
      setTaskState("IDLE");
      return;
    }

    ttsService.cancel(vrmManagerRef.current);
    setIsSpeaking(false);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      setVoiceStatus("listening");
      setTaskState("LISTENING");
      setVoiceMessage("Listening... Speak your task naturally.");

      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      // Voice Activity Detection: stop after ~1.2s of silence
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArr = new Float32Array(analyser.fftSize);
      let silenceStart = 0;
      let vadActive = true;
      const SILENCE_THRESHOLD = 0.01;
      const SILENCE_DURATION = 1200;

      const checkVad = () => {
        if (!vadActive) return;
        analyser.getFloatTimeDomainData(dataArr);
        let rms = 0;
        for (let i = 0; i < dataArr.length; i++) rms += dataArr[i] * dataArr[i];
        rms = Math.sqrt(rms / dataArr.length);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          if (Date.now() - silenceStart > SILENCE_DURATION) {
            vadActive = false;
            if (mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
            return;
          }
        } else {
          silenceStart = 0;
        }
        requestAnimationFrame(checkVad);
      };
      // Start VAD after a brief delay to let user begin speaking
      setTimeout(() => requestAnimationFrame(checkVad), 500);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        vadActive = false;
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        setVoiceStatus("idle");
        setVoiceMessage(null);

        if (chunks.length === 0) {
          setTaskState("IDLE");
          return;
        }

        const blob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        try {
          setVoiceMessage("Transcribing...");
          const resp = await fetch("/api/stt", { method: "POST", body: formData });
          if (resp.ok) {
            const result = await resp.json();
            const transcript = result.text?.trim();
            if (transcript) {
              setInput(transcript);
              handleSend(transcript);
            } else {
              setTaskState("IDLE");
            }
          } else {
            setVoiceMessage("Transcription failed.");
            setTimeout(() => { setVoiceMessage(null); }, 3000);
            setTaskState("IDLE");
          }
        } catch {
          setVoiceMessage("STT service unreachable.");
          setTimeout(() => { setVoiceMessage(null); }, 3000);
          setTaskState("IDLE");
        }
      };

      mediaRecorder.start();
    }).catch(() => {
      setVoiceStatus("denied");
      setVoiceMessage("Microphone permission denied. Please allow microphone access.");
      setTaskState("IDLE");
      setTimeout(() => { setVoiceStatus("idle"); setVoiceMessage(null); }, 4000);
    });
  };

  const handleTestVoice = () => {
    setIsSpeaking(true);
    const greeting = `Hello! I am ${companionName}. I'm connected to Gravity-Pilot's agents and ready to create PowerPoint presentations, Word documents, Excel workbooks, or automate your desktop!`;
    ttsService
      .speak(greeting, vrmManagerRef.current, {
        voice: voiceSettings.preferredVoice,
        rate: voiceSettings.rate,
        pitch: voiceSettings.pitch,
        onEnd: () => setIsSpeaking(false),
      })
      .catch(() => setIsSpeaking(false));
  };

  const handleOpenFolder = async () => {
    if ((window as any).electronAPI?.openOutputFolder) {
      await (window as any).electronAPI.openOutputFolder();
      return;
    }
    try {
      await fetch("/api/open-folder", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  // PET MODE (220x320 desktop pet)
  if (windowMode === "pet") {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {/* Speech bubble - grows upward */}
        {petSpeechBubble && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% - 40px)",
              left: 10,
              right: 10,
              zIndex: 40,
              pointerEvents: "auto",
              background: "rgba(15, 23, 42, 0.92)",
              border: "1px solid rgba(168, 85, 247, 0.5)",
              borderRadius: 12,
              padding: "8px 12px",
              fontSize: 12,
              color: "white",
              lineHeight: 1.4,
              maxHeight: 60,
              overflow: "hidden",
              backdropFilter: "blur(12px)",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {petSpeechBubble}
          </div>
        )}

        {/* Avatar viewport */}
        <div
          onDoubleClick={() => setShowPetInput(true)}
          onClick={(e) => {
            const mgr = vrmManagerRef.current;
            if (!mgr) return;
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - rect.top) / rect.height;
            if (y < 0.3) {
              petBrainRef.current?.handleClick("head");
            } else {
              petBrainRef.current?.handleClick("body");
            }
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: showPetInput ? 40 : 0,
            pointerEvents: "auto",
          }}
        >
          <NilaAvatarViewport
            vrmManagerRef={vrmManagerRef}
            taskState={taskState}
            currentEmotion={currentEmotion}
            isSpeaking={isSpeaking}
            onEmotionChange={setCurrentEmotion}
            transparentMode={true}
          />
        </div>

        {/* Mini chat input */}
        {showPetInput && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 30,
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 4,
              background: "rgba(15, 23, 42, 0.95)",
              borderTop: "1px solid rgba(168, 85, 247, 0.4)",
            }}
          >
            <input
              type="text"
              autoFocus
              placeholder="Ask Nila..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                  setShowPetInput(false);
                } else if (e.key === "Escape") {
                  setShowPetInput(false);
                }
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 8,
                background: "rgba(30, 41, 59, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: 11,
                color: "white",
                outline: "none",
              }}
            />
            <button
              onClick={() => { handleSend(input); setShowPetInput(false); }}
              disabled={!input.trim()}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: "#9333ea",
                color: "white",
                border: "none",
                cursor: !input.trim() ? "not-allowed" : "pointer",
                opacity: !input.trim() ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Send size={12} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // COMPANION MODE (Compact Floating Avatar Overlay)
  if (windowMode === "companion") {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {/* Floating Top Control Bar */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 30,
            pointerEvents: "auto",
          }}
        >
          <div
            className="draggable-region"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(15, 23, 42, 0.88)",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              borderRadius: 9999,
              padding: "4px 12px",
              boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>🌙 {companionName}</span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(168, 85, 247, 0.25)",
                color: "#e9d5ff",
              }}
            >
              Desktop Companion
            </span>
          </div>

          {/* Click-Through Indicator Banner */}
          {isClickThrough && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 9999,
                background: "rgba(120, 53, 15, 0.9)",
                border: "1px solid rgba(245, 158, 11, 0.5)",
                fontSize: 10,
                fontWeight: 600,
                color: "#fcd34d",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span>⚡ Click-Through Active</span>
              <span style={{ fontSize: 9, color: "rgba(253, 224, 71, 0.8)" }}>(Ctrl+Shift+C)</span>
            </div>
          )}

          <div
            className="no-drag"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(15, 23, 42, 0.88)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 9999,
              padding: "3px 6px",
              boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
            }}
          >
            <button
              onClick={() =>
                setVoiceSettings((prev) => ({ ...prev, muted: !prev.muted }))
              }
              title={voiceSettings.muted ? "Unmute Voice" : "Mute Voice"}
              style={{
                padding: 6,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: voiceSettings.muted ? "#f87171" : "#cbd5e1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {voiceSettings.muted ? <VolumeX size={14} color="#f87171" /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={() => handleWindowModeChange("split")}
              title="Expand to Split View"
              style={{
                padding: 6,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#cbd5e1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => handleWindowModeChange("dashboard")}
              title="Expand to Full Dashboard"
              style={{
                padding: 6,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#cbd5e1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layout size={14} />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              style={{
                padding: 6,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#cbd5e1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings size={14} />
            </button>
            {(window as any).electronAPI?.minimize && (
              <button
                onClick={() => (window as any).electronAPI.minimize()}
                title="Minimize Window"
                style={{
                  padding: 6,
                  borderRadius: "50%",
                  background: "transparent",
                  border: "none",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Minimize2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 3D Avatar Viewport */}
        <div
          onMouseDown={handleAvatarMouseDown}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 74,
            pointerEvents: "auto",
          }}
        >
          <NilaAvatarViewport
            vrmManagerRef={vrmManagerRef}
            taskState={taskState}
            currentEmotion={currentEmotion}
            isSpeaking={isSpeaking}
            onEmotionChange={setCurrentEmotion}
            transparentMode={true}
          />
        </div>

        {/* Floating Bottom Quick Speech & Input Pill */}
        <div
          className="no-drag"
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            zIndex: 30,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(168, 85, 247, 0.4)",
            borderRadius: 16,
            padding: 6,
            boxShadow: "0 12px 24px rgba(0,0,0,0.5)",
            backdropFilter: "blur(16px)",
          }}
        >
          <button
            onClick={toggleVoiceInput}
            disabled={isStreaming}
            title={voiceStatus === "listening" ? "Stop listening" : "Speak to Nila"}
            style={{
              padding: 8,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: isStreaming ? "not-allowed" : "pointer",
              background: voiceStatus === "listening" ? "#e11d48" : "rgba(168, 85, 247, 0.25)",
              color: "white",
            }}
          >
            {voiceStatus === "listening" ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <input
            type="text"
            placeholder={
              isStreaming
                ? "Working on task..."
                : voiceStatus === "listening"
                ? "Listening..."
                : `Ask ${companionName} anything...`
            }
            value={input}
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              fontSize: 12,
              color: "white",
              outline: "none",
            }}
          />

          <button
            onClick={() => handleSend(input)}
            disabled={isStreaming || !input.trim()}
            style={{
              padding: 8,
              borderRadius: 10,
              background: "#9333ea",
              color: "white",
              border: "none",
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              opacity: isStreaming || !input.trim() ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={14} />
          </button>
        </div>

        <NilaSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          windowMode={windowMode}
          onWindowModeChange={handleWindowModeChange}
          voiceSettings={voiceSettings}
          onVoiceSettingsChange={setVoiceSettings}
          companionName={companionName}
          onCompanionNameChange={setCompanionName}
          onTestVoice={handleTestVoice}
        />
      </div>
    );
  }

  const isDashboard = windowMode === "dashboard";

  // STANDARD SPLIT & DASHBOARD MODES
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "var(--dp-bg)",
        overflow: "hidden",
      }}
    >
      {/* Top Application Bar */}
      <StatusBar
        mode={mode}
        setMode={setMode}
        isBackendOnline={isBackendOnline}
        ollamaInfo={ollamaInfo}
        groqAvailable={groqAvailable}
        windowMode={windowMode}
        onWindowModeChange={handleWindowModeChange}
      />

      {/* Main Workspace */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
        {/* Left Session Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
        />

        {/* 3D Nila Avatar Viewport Column */}
        {isDashboard ? (
          /* DASHBOARD MODE: Dedicated Framed Card Viewport strictly isolated */
          <div
            style={{
              width: "360px",
              minWidth: "320px",
              maxWidth: "400px",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              padding: "12px",
              backgroundColor: "#0A0D18",
              borderRight: `1px solid ${C.panelBorder}`,
              boxSizing: "border-box",
              overflow: "hidden",
              flexShrink: 0,
              minHeight: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "#121426",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                position: "relative",
                minHeight: 0,
              }}
            >
              {/* Avatar Panel Header */}
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(18,20,38,0.85)",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🌙</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                      {companionName}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      3D AI Companion • VRM 1.0
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Voice Mute Toggle */}
                  <button
                    onClick={() =>
                      setVoiceSettings((prev) => ({ ...prev, muted: !prev.muted }))
                    }
                    title={voiceSettings.muted ? "Unmute Voice" : "Mute Voice"}
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: voiceSettings.muted ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                      color: voiceSettings.muted ? "#f87171" : "#cbd5e1",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {voiceSettings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>

                  {/* Mode Toggle Button */}
                  <button
                    onClick={() => handleWindowModeChange("companion")}
                    title="Switch to Floating Desktop Companion"
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.08)",
                      color: "#cbd5e1",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Minimize2 size={14} />
                  </button>

                  {/* Settings Button */}
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    title="Nila Settings"
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: "rgba(168,85,247,0.2)",
                      color: "#d8b4fe",
                      border: "1px solid rgba(168,85,247,0.4)",
                      cursor: "pointer",
                    }}
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              {/* 3D WebGL Canvas */}
              <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
                <NilaAvatarViewport
                  vrmManagerRef={vrmManagerRef}
                  taskState={taskState}
                  currentEmotion={currentEmotion}
                  isSpeaking={isSpeaking}
                  onEmotionChange={setCurrentEmotion}
                />
              </div>

              {/* Quick Open Output Folder Link */}
              <div
                style={{
                  padding: "6px 12px",
                  background: "rgba(10,12,25,0.85)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#94a3b8",
                  flexShrink: 0,
                }}
              >
                <span>Deliverables storage:</span>
                <button
                  onClick={handleOpenFolder}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "transparent",
                    border: "none",
                    color: "#c084fc",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <FolderOpen size={12} />
                  <span>backend/output</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* SPLIT VIEW MODE: Generous resizable width pane */
          <>
            <div
              style={{
                width: `${splitAvatarWidth}px`,
                minWidth: "380px",
                maxWidth: "880px",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                backgroundColor: "#0d0f1d",
                flexShrink: 0,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {/* Avatar Panel Header */}
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(18,20,38,0.75)",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🌙</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                      {companionName}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      3D AI Companion • VRM 1.0 (Full Body)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Quick Deliverables Folder Button */}
                  <button
                    onClick={handleOpenFolder}
                    title="Open Deliverables Folder (backend/output)"
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: "rgba(168,85,247,0.15)",
                      color: "#c084fc",
                      border: "1px solid rgba(168,85,247,0.3)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <FolderOpen size={13} />
                    <span style={{ fontSize: 10 }}>Output</span>
                  </button>

                  {/* Voice Mute Toggle */}
                  <button
                    onClick={() =>
                      setVoiceSettings((prev) => ({ ...prev, muted: !prev.muted }))
                    }
                    title={voiceSettings.muted ? "Unmute Voice" : "Mute Voice"}
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: voiceSettings.muted ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                      color: voiceSettings.muted ? "#f87171" : "#cbd5e1",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {voiceSettings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>

                  {/* Mode Toggle Button */}
                  <button
                    onClick={() => handleWindowModeChange("companion")}
                    title="Switch to Floating Desktop Companion"
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.08)",
                      color: "#cbd5e1",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Minimize2 size={14} />
                  </button>

                  {/* Settings Button */}
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    title="Nila Settings"
                    style={{
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: "rgba(168,85,247,0.2)",
                      color: "#d8b4fe",
                      border: "1px solid rgba(168,85,247,0.4)",
                      cursor: "pointer",
                    }}
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              {/* 3D WebGL Canvas - Occupies 100% full vertical height beneath header */}
              <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
                <NilaAvatarViewport
                  vrmManagerRef={vrmManagerRef}
                  taskState={taskState}
                  currentEmotion={currentEmotion}
                  isSpeaking={isSpeaking}
                  onEmotionChange={setCurrentEmotion}
                />
              </div>
            </div>

            {/* Draggable Vertical Resize Divider */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingSplit(true);
              }}
              style={{
                width: 6,
                cursor: "col-resize",
                backgroundColor: isResizingSplit ? "#a855f7" : "transparent",
                borderLeft: `1px solid ${C.panelBorder}`,
                transition: "background-color 0.15s ease",
                flexShrink: 0,
                zIndex: 20,
              }}
              className="hover:bg-purple-600/40"
              title="Drag horizontally to resize 3D avatar viewport"
            />
          </>
        )}

        {/* Center Chat & Action Panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {/* Split Mode Trace Drawer Toggle Header */}
          {!isDashboard && (
            <div
              style={{
                padding: "6px 16px",
                background: "white",
                borderBottom: `1px solid ${C.panelBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>
                💬 Conversation & Agent Workflow
              </span>
              <button
                onClick={() => setShowTrace(!showTrace)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  background: showTrace ? `${C.navy}15` : "#F1F5F9",
                  color: showTrace ? C.navy : C.textSec,
                  border: `1px solid ${showTrace ? C.navy : C.panelBorder}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>{showTrace ? "Hide Trace Panel" : "Show Trace Panel"}</span>
              </button>
            </div>
          )}

          <ChatPanel
            msgs={combinedMessages}
            mode={mode}
            onSuggestion={(suggestion) => handleSend(suggestion)}
          />

          {/* Voice Feedback Banner */}
          {voiceMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 20px",
                background: voiceStatus === "listening" ? "#ECFDF5" : "#FFF1F0",
                color: voiceStatus === "listening" ? "#065F46" : "#CF1322",
                borderTop: `1px solid ${voiceStatus === "listening" ? "#A7F3D0" : "#FFCCC7"}`,
                fontSize: 12,
                fontFamily: "var(--dp-font-ui)",
              }}
            >
              <AlertCircle size={14} />
              <span>{voiceMessage}</span>
            </div>
          )}

          {/* Input Area */}
          <div
            style={{
              padding: "14px 20px 18px",
              background: "white",
              borderTop: `1px solid ${C.panelBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* Microphone Button */}
            <button
              onClick={toggleVoiceInput}
              disabled={isStreaming}
              title={
                voiceStatus === "listening"
                  ? "Stop listening"
                  : voiceStatus === "denied"
                  ? "Microphone permission denied"
                  : "Click to speak naturally to Nila"
              }
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 42,
                borderRadius: 8,
                background:
                  voiceStatus === "listening"
                    ? "#DC2626"
                    : voiceStatus === "denied"
                    ? "#FEE2E2"
                    : "#F1F5F9",
                color:
                  voiceStatus === "listening"
                    ? "white"
                    : voiceStatus === "denied"
                    ? "#DC2626"
                    : C.textPrim,
                border: `1px solid ${
                  voiceStatus === "listening"
                    ? "#DC2626"
                    : voiceStatus === "denied"
                    ? "#FCA5A5"
                    : C.panelBorder
                }`,
                cursor: isStreaming ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                animation: voiceStatus === "listening" ? "dp-pulse 1.2s infinite" : "none",
                flexShrink: 0,
              }}
            >
              {voiceStatus === "listening" ? <Mic size={18} /> : voiceStatus === "denied" ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <input
              type="text"
              placeholder={
                isStreaming
                  ? `${companionName} and Gravity-Pilot agents are working...`
                  : voiceStatus === "listening"
                  ? "Listening to your voice... Speak your request"
                  : `Ask ${companionName}... (e.g. "Create a 5-slide PowerPoint on AI", "Create an Excel attendance sheet", "Take a screenshot")`
              }
              value={input}
              disabled={isStreaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              style={{
                flex: 1,
                padding: "11px 16px",
                border: `1px solid ${voiceStatus === "listening" ? "#DC2626" : C.panelBorder}`,
                borderRadius: 8,
                fontSize: 13.5,
                fontFamily: "var(--dp-font-ui)",
                color: C.textPrim,
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = C.navy;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = C.panelBorder;
              }}
            />

            <button
              onClick={() => handleSend(input)}
              disabled={isStreaming || !input.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "11px 18px",
                borderRadius: 8,
                background: isStreaming || !input.trim() ? `${C.navy}66` : C.navy,
                color: "white",
                border: "none",
                fontWeight: 600,
                fontSize: 13,
                cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                boxShadow: "0 1px 3px rgba(31,58,95,0.2)",
                flexShrink: 0,
              }}
            >
              <Send size={15} /> Send
            </button>
          </div>
        </div>

        {/* Right Trace Panel: Always present in Dashboard, toggleable in Split */}
        {(isDashboard || showTrace) && (
          <div
            style={{
              width: isDashboard ? "340px" : "320px",
              minWidth: "280px",
              height: "100%",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <TracePanel agents={agents} retryActive={retryActive} mode={mode} />
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <NilaSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        windowMode={windowMode}
        onWindowModeChange={handleWindowModeChange}
        voiceSettings={voiceSettings}
        onVoiceSettingsChange={setVoiceSettings}
        companionName={companionName}
        onCompanionNameChange={setCompanionName}
        onTestVoice={handleTestVoice}
      />

      {/* Screenshot Preview Modal */}
      <ScreenshotModal
        imageUrl={previewScreenshotUrl}
        onClose={() => setPreviewScreenshotUrl(null)}
      />
    </div>
  );
}
