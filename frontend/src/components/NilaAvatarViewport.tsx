import React, { useEffect, useRef, useState } from 'react';
import { VRMManager } from '../avatar/VRMManager';
import type { CompanionTaskState, EmotionType, VRMDiagnostics, AnimationState } from '../types/nila';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Info,
  Loader2,
  Volume2,
  Activity,
  Maximize2,
  User,
  Hand,
  Smile,
} from 'lucide-react';

interface NilaAvatarViewportProps {
  vrmManagerRef: React.MutableRefObject<VRMManager | null>;
  taskState: CompanionTaskState;
  currentEmotion?: EmotionType;
  isSpeaking?: boolean;
  onEmotionChange?: (emo: EmotionType) => void;
  onDiagnosticsUpdate?: (diag: VRMDiagnostics) => void;
  className?: string;
  transparentMode?: boolean;
}

export const NilaAvatarViewport: React.FC<NilaAvatarViewportProps> = ({
  vrmManagerRef,
  taskState,
  currentEmotion = 'relaxed',
  isSpeaking = false,
  onEmotionChange,
  onDiagnosticsUpdate,
  className = '',
  transparentMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VRMDiagnostics | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [controlTab, setControlTab] = useState<'gestures' | 'emotions'>('gestures');
  const [activeGesture, setActiveGesture] = useState<AnimationState>('IDLE');
  const [isToolbarOpen, setIsToolbarOpen] = useState<boolean>(!transparentMode);
  const [framingMode, setFramingMode] = useState<'full' | 'bust' | 'closeup'>('full');

  const handleToggleDiagnostics = () => {
    if (vrmManagerRef.current) {
      setDebugInfo(vrmManagerRef.current.getSceneDebugInfo());
      setDiagnostics({ ...vrmManagerRef.current.diagnostics });
    }
    setShowDiagnostics((prev) => !prev);
  };

  const getModelUrl = (filename: string = 'model.vrm'): string => {
    // Under file:// protocol (Electron production loaded from file), use relative path
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      return `./${filename}`;
    }
    return `/${filename}`;
  };

  const loadAvatarModel = () => {
    if (!vrmManagerRef.current) return;
    const manager = vrmManagerRef.current;
    setLoading(true);
    setErrorMessage(null);
    setLoadProgress(0);

    const primaryUrl = getModelUrl('model.vrm');
    const fallbackUrl = getModelUrl('AvatarSample_A.vrm');

    manager
      .loadVRM(primaryUrl, (pct) => {
        setLoadProgress(pct);
      })
      .then(() => {
        setLoading(false);
        setDiagnostics({ ...manager.diagnostics });
        onDiagnosticsUpdate?.({ ...manager.diagnostics });
      })
      .catch((err) => {
        console.warn('[AvatarViewport] Primary model.vrm failed, trying fallback:', err);
        manager
          .loadVRM(fallbackUrl, (pct) => {
            setLoadProgress(pct);
          })
          .then(() => {
            setLoading(false);
            setDiagnostics({ ...manager.diagnostics });
            onDiagnosticsUpdate?.({ ...manager.diagnostics });
          })
          .catch((finalErr) => {
            console.error('[AvatarViewport] Both VRM load attempts failed:', finalErr);
            setLoading(false);
            setErrorMessage(`Failed to load VRM model: ${finalErr.message || String(finalErr)}`);
          });
      });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new VRMManager(containerRef.current);
    vrmManagerRef.current = manager;
    (window as any).__vrmManager = manager;

    loadAvatarModel();

    return () => {
      manager.destroy();
      vrmManagerRef.current = null;
    };
  }, []);

  // Synchronize Task State to Avatar Controller
  useEffect(() => {
    if (vrmManagerRef.current) {
      vrmManagerRef.current.setTaskState(taskState);
    }
  }, [taskState, vrmManagerRef]);

  // Handle emotion changes
  useEffect(() => {
    if (vrmManagerRef.current && currentEmotion) {
      vrmManagerRef.current.setEmotion(currentEmotion);
    }
  }, [currentEmotion, vrmManagerRef]);

  // Synchronize speaking state to VRM Manager
  useEffect(() => {
    if (vrmManagerRef.current) {
      vrmManagerRef.current.setSpeaking(isSpeaking);
    }
  }, [isSpeaking, vrmManagerRef]);

  const taskStateBadges: Record<
    CompanionTaskState,
    { label: string; bg: string; border: string; text: string; dot: string }
  > = {
    IDLE: { label: 'Idle & Ready', bg: 'rgba(6, 78, 59, 0.8)', border: 'rgba(16, 185, 129, 0.4)', text: '#6ee7b7', dot: '#34d399' },
    LISTENING: { label: 'Listening...', bg: 'rgba(12, 74, 110, 0.8)', border: 'rgba(14, 165, 233, 0.4)', text: '#7dd3fc', dot: '#38bdf8' },
    THINKING: { label: 'Thinking & Planning...', bg: 'rgba(49, 46, 129, 0.8)', border: 'rgba(99, 102, 241, 0.4)', text: '#a5b4fc', dot: '#818cf8' },
    EXECUTING: { label: 'Executing Task...', bg: 'rgba(120, 53, 15, 0.8)', border: 'rgba(245, 158, 11, 0.4)', text: '#fcd34d', dot: '#fbbf24' },
    VALIDATING: { label: 'Validating Output...', bg: 'rgba(19, 78, 74, 0.8)', border: 'rgba(20, 184, 166, 0.4)', text: '#5eead4', dot: '#2dd4bf' },
    NEEDS_INPUT: { label: 'Clarification Needed', bg: 'rgba(88, 28, 135, 0.8)', border: 'rgba(168, 85, 247, 0.4)', text: '#d8b4fe', dot: '#c084fc' },
    COMPLETED: { label: 'Task Completed!', bg: 'rgba(20, 83, 45, 0.8)', border: 'rgba(34, 197, 94, 0.4)', text: '#86efac', dot: '#4ade80' },
    FAILED: { label: 'Task Failed', bg: 'rgba(136, 19, 55, 0.8)', border: 'rgba(244, 63, 94, 0.4)', text: '#fda4af', dot: '#fb7185' },
    CANCELLED: { label: 'Cancelled', bg: 'rgba(30, 41, 59, 0.8)', border: 'rgba(100, 116, 139, 0.4)', text: '#cbd5e1', dot: '#94a3b8' },
  };

  const currentBadge = taskStateBadges[taskState] || taskStateBadges.IDLE;

  const testEmotions: { id: EmotionType; label: string; icon: string }[] = [
    { id: 'happy', label: 'Happy', icon: '✨' },
    { id: 'relaxed', label: 'Relaxed', icon: '🌿' },
    { id: 'surprised', label: 'Surprised', icon: '💫' },
    { id: 'sad', label: 'Sad', icon: '💧' },
    { id: 'angry', label: 'Concerned', icon: '⚡' },
    { id: 'neutral', label: 'Neutral', icon: '🌸' },
  ];

  const testGestures: { id: AnimationState; label: string; icon: string; duration?: number }[] = [
    { id: 'GREETING', label: 'Wave', icon: '👋', duration: 3.6 },
    { id: 'EXPLAINING', label: 'Explain', icon: '💡', duration: 4.2 },
    { id: 'PRESENTING', label: 'Point', icon: '👉', duration: 3.8 },
    { id: 'THINKING', label: 'Think', icon: '🤔', duration: 4.2 },
    { id: 'WORKING', label: 'Work', icon: '⚡' },
    { id: 'COMPLETED', label: 'Celebrate', icon: '🎉', duration: 3.8 },
    { id: 'NEEDS_INPUT', label: 'Question', icon: '❓', duration: 4.0 },
    { id: 'IDLE', label: 'Idle', icon: '🌿' },
  ];

  const handleTriggerGesture = (g: { id: AnimationState; duration?: number }) => {
    setActiveGesture(g.id);
    if (vrmManagerRef.current) {
      if (g.id === 'IDLE') {
        vrmManagerRef.current.setAnimationState('IDLE');
      } else if (g.duration) {
        vrmManagerRef.current.playGesture(g.id, g.duration);
      } else {
        vrmManagerRef.current.setAnimationState(g.id);
      }
      setDiagnostics({ ...vrmManagerRef.current.diagnostics });
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        userSelect: 'none',
        background: transparentMode ? 'transparent' : 'radial-gradient(circle at 50% 25%, #24264e 0%, #12132a 55%, #0a0b18 100%)',
      }}
      className={className}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="vrm-canvas-container cursor-grab active:cursor-grabbing"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }}
      />

      {/* Top Floating Header with Task State & Controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        {/* Dynamic Task State Badge */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 9999,
            background: currentBadge.bg,
            border: `1px solid ${currentBadge.border}`,
            color: currentBadge.text,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: currentBadge.dot,
              display: 'inline-block',
            }}
          />
          <span>{currentBadge.label}</span>
          {isSpeaking && (
            <span style={{ color: '#f472b6', display: 'flex', alignItems: 'center', marginLeft: 2 }}>
              <Volume2 size={14} />
            </span>
          )}
        </div>

        {/* Viewport Action Buttons */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px',
            borderRadius: 9999,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Full-Body View (Default) */}
          <button
            onClick={() => {
              vrmManagerRef.current?.setCameraFraming('full');
              setFramingMode('full');
            }}
            title="Full-Body View (Default)"
            style={{
              padding: '5px 8px',
              borderRadius: 9999,
              background: framingMode === 'full' ? 'rgba(168, 85, 247, 0.4)' : 'transparent',
              border: framingMode === 'full' ? '1px solid rgba(168, 85, 247, 0.6)' : 'none',
              color: framingMode === 'full' ? '#ffffff' : '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Maximize2 size={13} />
            <span style={{ fontSize: 10 }}>Full</span>
          </button>

          {/* Upper-Body View */}
          <button
            onClick={() => {
              vrmManagerRef.current?.setCameraFraming('bust');
              setFramingMode('bust');
            }}
            title="Upper-Body / Bust View"
            style={{
              padding: '5px 8px',
              borderRadius: 9999,
              background: framingMode === 'bust' ? 'rgba(168, 85, 247, 0.4)' : 'transparent',
              border: framingMode === 'bust' ? '1px solid rgba(168, 85, 247, 0.6)' : 'none',
              color: framingMode === 'bust' ? '#ffffff' : '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <User size={13} />
            <span style={{ fontSize: 10 }}>Bust</span>
          </button>

          {/* Zoom In */}
          <button
            onClick={() => vrmManagerRef.current?.zoomIn()}
            title="Zoom In"
            style={{
              padding: 5,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ZoomIn size={13} />
          </button>

          {/* Zoom Out */}
          <button
            onClick={() => vrmManagerRef.current?.zoomOut()}
            title="Zoom Out"
            style={{
              padding: 5,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ZoomOut size={13} />
          </button>

          {/* Reset Camera to Full Body */}
          <button
            onClick={() => {
              vrmManagerRef.current?.resetCamera();
              setFramingMode('full');
            }}
            title="Reset Camera to Full-Body"
            style={{
              padding: 5,
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCcw size={13} />
          </button>

          {/* VRM Diagnostics */}
          <button
            onClick={handleToggleDiagnostics}
            title="VRM Model Diagnostics"
            style={{
              padding: 5,
              borderRadius: '50%',
              background: 'rgba(168, 85, 247, 0.25)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              color: '#d8b4fe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Info size={13} />
          </button>
        </div>
      </div>

      {/* Bottom Quick Trigger Pills (Gestures & Emotions) */}
      {isToolbarOpen ? (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          <div
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 6px',
              borderRadius: 9999,
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              maxWidth: '100%',
              overflowX: 'auto',
            }}
          >
            {/* Collapse Button */}
            <button
              onClick={() => setIsToolbarOpen(false)}
              title="Hide gesture test toolbar"
              style={{
                padding: '3px 6px',
                borderRadius: 9999,
                border: 'none',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>▾ Hide</span>
            </button>

            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.12)', margin: '0 1px' }} />

            {/* Mode Switcher */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: 9999,
                padding: 2,
                marginRight: 2,
              }}
            >
              <button
                onClick={() => setControlTab('gestures')}
                style={{
                  padding: '2px 7px',
                  borderRadius: 9999,
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: controlTab === 'gestures' ? '#8b5cf6' : 'transparent',
                  color: controlTab === 'gestures' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
                title="Show Gestures test buttons"
              >
                💃 Gestures
              </button>
              <button
                onClick={() => setControlTab('emotions')}
                style={{
                  padding: '2px 7px',
                  borderRadius: 9999,
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: controlTab === 'emotions' ? '#ec4899' : 'transparent',
                  color: controlTab === 'emotions' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
                title="Show Emotions test buttons"
              >
                ✨ Emotes
              </button>
            </div>

            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.12)', margin: '0 1px' }} />

            {/* Test Buttons (horizontally scrollable) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {controlTab === 'gestures'
                ? testGestures.map((g) => {
                    const isActive = activeGesture === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => handleTriggerGesture(g)}
                        title={`Trigger ${g.label} animation`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          border: 'none',
                          background: isActive
                            ? 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)'
                            : 'transparent',
                          color: isActive ? '#ffffff' : '#cbd5e1',
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>{g.icon}</span>
                        <span>{g.label}</span>
                      </button>
                    );
                  })
                : testEmotions.map((emo) => {
                    const isActive = currentEmotion === emo.id;
                    return (
                      <button
                        key={emo.id}
                        onClick={() => {
                          onEmotionChange?.(emo.id);
                          vrmManagerRef.current?.setEmotion(emo.id);
                        }}
                        title={`Set ${emo.label} facial expression`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          border: 'none',
                          background: isActive
                            ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
                            : 'transparent',
                          color: isActive ? '#ffffff' : '#cbd5e1',
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>{emo.icon}</span>
                        <span>{emo.label}</span>
                      </button>
                    );
                  })}
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed Floating Toggle Button */
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 12,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={() => setIsToolbarOpen(true)}
            title="Open gesture testing toolbar"
            style={{
              pointerEvents: 'auto',
              padding: '4px 10px',
              borderRadius: 9999,
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              color: '#d8b4fe',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            <span>💃 Test Gestures ▴</span>
          </button>
        </div>
      )}

      {/* VRM Model Diagnostics Panel */}
      {showDiagnostics && diagnostics && (
        <div
          style={{
            position: 'absolute',
            inset: '54px 16px auto 16px',
            zIndex: 30,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(10, 15, 30, 0.95)',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            fontSize: 12,
            color: '#e2e8f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 8,
              marginBottom: 10,
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'white' }}>
              <Sparkles size={16} color="#c084fc" />
              <span>VRM 1.0 Diagnostics</span>
            </div>
            <button
              onClick={() => setShowDiagnostics(false)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Model:</span> <span style={{ fontWeight: 600, color: '#d8b4fe' }}>{diagnostics.modelName}</span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Spec:</span> <span style={{ fontWeight: 600, color: '#6ee7b7' }}>{diagnostics.vrmVersion}</span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Bones:</span> <span style={{ fontWeight: 600 }}>{diagnostics.boneCount}</span>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Spring Bones:</span> <span style={{ fontWeight: 600 }}>{diagnostics.springBoneSprings}</span>
            </div>
            {diagnostics.renderCalls !== undefined && (
              <div>
                <span style={{ color: '#94a3b8' }}>Draw Calls:</span> <span style={{ fontWeight: 600, color: '#38bdf8' }}>{diagnostics.renderCalls}</span>
              </div>
            )}
            {diagnostics.triangles !== undefined && (
              <div>
                <span style={{ color: '#94a3b8' }}>Triangles:</span> <span style={{ fontWeight: 600, color: '#4ade80' }}>{diagnostics.triangles.toLocaleString()}</span>
              </div>
            )}
            {diagnostics.headHeight !== undefined && (
              <div>
                <span style={{ color: '#94a3b8' }}>Head Height:</span> <span style={{ fontWeight: 600, color: '#f472b6' }}>{diagnostics.headHeight.toFixed(2)}m</span>
              </div>
            )}
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#94a3b8' }}>Author:</span> <span style={{ fontWeight: 600 }}>{diagnostics.author}</span>
            </div>

            {/* Animation Controller & Gesture Testing Panel */}
            <div style={{ gridColumn: 'span 2', marginTop: 4, padding: '8px 10px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 11 }}>Active Animation State:</span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: 'rgba(56, 189, 248, 0.25)',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    color: '#38bdf8',
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                >
                  {diagnostics.animationState || activeGesture || 'IDLE'}
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: 10 }}>Trigger Gesture Animation:</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 6 }}>
                {testGestures.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleTriggerGesture(g)}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 6,
                      background: activeGesture === g.id ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                      border: activeGesture === g.id ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{g.icon}</span>
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {diagnostics.availableBones && (
              <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                <span style={{ color: '#94a3b8' }}>Bound Humanoid Bones ({diagnostics.availableBones.length}):</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, maxHeight: 60, overflowY: 'auto' }}>
                  {diagnostics.availableBones.map((bone) => (
                    <span
                      key={bone}
                      style={{
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: '#93c5fd',
                        fontSize: 9,
                      }}
                    >
                      {bone}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#94a3b8' }}>Supported Expressions:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {diagnostics.expressions.map((exp) => (
                  <span
                    key={exp}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(168, 85, 247, 0.2)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      color: '#e9d5ff',
                      fontSize: 10,
                    }}
                  >
                    {exp}
                  </span>
                ))}
              </div>
            </div>
            {debugInfo && (
              <div style={{ gridColumn: 'span 2', marginTop: 6 }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Live WebGL & Scene State:</span>
                <pre
                  style={{
                    fontSize: 10,
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    padding: 8,
                    marginTop: 4,
                    maxHeight: 140,
                    overflow: 'auto',
                    color: '#4ade80',
                    fontFamily: 'monospace',
                  }}
                >
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(8, 10, 24, 0.88)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              width: 270,
              padding: 24,
              borderRadius: 20,
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Loader2 className="animate-spin" size={40} color="#c084fc" />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {loadProgress}%
              </div>
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: '0 0 4px' }}>
              🌙 Loading Nila Avatar
            </h3>
            <p style={{ fontSize: 11, color: '#c084fc', margin: '0 0 12px' }}>
              VRM 1.0 3D Companion Model
            </p>
            <div
              style={{
                width: '100%',
                height: 6,
                borderRadius: 9999,
                background: '#1e293b',
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                  width: `${loadProgress}%`,
                  transition: 'width 0.2s ease',
                  borderRadius: 9999,
                }}
              />
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
              Waking up expressions & physics...
            </p>
          </div>
        </div>
      )}

      {/* Error Message with Retry */}
      {errorMessage && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 16,
            right: 16,
            zIndex: 40,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(88, 28, 135, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.6)',
            boxShadow: '0 12px 24px rgba(0,0,0,0.5)',
            fontSize: 12,
            color: '#fecdd3',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: '#ffe4e6' }}>Avatar Loading Issue</span>
            <button
              onClick={loadAvatarModel}
              style={{
                padding: '4px 10px',
                background: '#e11d48',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Loading
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#fda4af', margin: 0, wordBreak: 'break-word' }}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
};
