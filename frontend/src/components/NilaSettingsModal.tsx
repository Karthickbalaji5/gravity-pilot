import React from 'react';
import { X, Volume2, Globe, Sliders, Sparkles, Layout } from 'lucide-react';
import type { CompanionWindowMode, VoiceSettings } from '../types/nila';

interface NilaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  windowMode: CompanionWindowMode;
  onWindowModeChange: (mode: CompanionWindowMode) => void;
  voiceSettings: VoiceSettings;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
  companionName: string;
  onCompanionNameChange: (name: string) => void;
  onTestVoice: () => void;
}

export const NilaSettingsModal: React.FC<NilaSettingsModalProps> = ({
  isOpen,
  onClose,
  windowMode,
  onWindowModeChange,
  voiceSettings,
  onVoiceSettingsChange,
  companionName,
  onCompanionNameChange,
  onTestVoice,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative max-w-lg w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">🌙 Nila Companion Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs overflow-y-auto max-h-[70vh] pr-1">
          {/* Companion Name */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Companion Name</label>
            <input
              type="text"
              value={companionName}
              onChange={(e) => onCompanionNameChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Window Mode */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Layout className="w-3.5 h-3.5 text-purple-400" />
              <span>Display Layout</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onWindowModeChange('companion')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  windowMode === 'companion'
                    ? 'bg-purple-600/30 border-purple-500 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">🧚</span>
                <span className="text-[11px]">Companion</span>
              </button>
              <button
                type="button"
                onClick={() => onWindowModeChange('split')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  windowMode === 'split'
                    ? 'bg-purple-600/30 border-purple-500 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">🌓</span>
                <span className="text-[11px]">Split View</span>
              </button>
              <button
                type="button"
                onClick={() => onWindowModeChange('dashboard')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  windowMode === 'dashboard'
                    ? 'bg-purple-600/30 border-purple-500 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-base">📊</span>
                <span className="text-[11px]">Dashboard</span>
              </button>
            </div>
          </div>

          {/* Language Selection */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Language Preference</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'en', label: 'English' },
                { id: 'te', label: 'తెలుగు' },
                { id: 'ta', label: 'தமிழ்' },
                { id: 'auto', label: 'Auto' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() =>
                    onVoiceSettingsChange({
                      ...voiceSettings,
                      language: lang.id as any,
                    })
                  }
                  className={`py-1.5 rounded-xl border text-center transition text-xs ${
                    voiceSettings.language === lang.id
                      ? 'bg-sky-600/30 border-sky-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Neural Preset */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-pink-400" />
              <span>Neural Voice (Edge TTS / Web Speech)</span>
            </label>
            <select
              value={voiceSettings.preferredVoice || 'en-US-AnaNeural'}
              onChange={(e) =>
                onVoiceSettingsChange({
                  ...voiceSettings,
                  preferredVoice: e.target.value,
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="en-US-AnaNeural">en-US — Ana Neural (Soft & Friendly)</option>
              <option value="en-US-JennyNeural">en-US — Jenny Neural (Clear & Natural)</option>
              <option value="en-IN-NeerjaNeural">en-IN — Neerja Neural (Indian Accent)</option>
              <option value="te-IN-ShrutiNeural">te-IN — Shruti Neural (Telugu)</option>
              <option value="ta-IN-PallaviNeural">ta-IN — Pallavi Neural (Tamil)</option>
            </select>
          </div>

          {/* Sliders: Rate & Pitch */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Speed ({voiceSettings.rate}x)</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.5"
                step="0.05"
                value={voiceSettings.rate}
                onChange={(e) =>
                  onVoiceSettingsChange({
                    ...voiceSettings,
                    rate: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Pitch ({voiceSettings.pitch}x)</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                value={voiceSettings.pitch}
                onChange={(e) =>
                  onVoiceSettingsChange({
                    ...voiceSettings,
                    pitch: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Mute toggle & Test voice */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={voiceSettings.muted}
                onChange={(e) =>
                  onVoiceSettingsChange({
                    ...voiceSettings,
                    muted: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-purple-500 rounded"
              />
              <span>Mute Voice Output</span>
            </label>

            <button
              type="button"
              onClick={onTestVoice}
              className="px-3 py-1.5 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 border border-purple-500/50 text-white font-medium transition flex items-center gap-1.5"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test Voice & Lip-Sync</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
