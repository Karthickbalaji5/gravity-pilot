import React from 'react';
import { X, ExternalLink, Download } from 'lucide-react';

interface ScreenshotModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  imageUrl,
  onClose,
}) => {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-purple-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">📸 Captured Desktop Screenshot</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-700/40 text-purple-300">
              Verified
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-xs flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Tab</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/40">
          <img
            src={imageUrl}
            alt="Desktop Screenshot"
            className="max-h-[75vh] w-auto object-contain rounded-xl shadow-lg border border-slate-800"
          />
        </div>
      </div>
    </div>
  );
};
