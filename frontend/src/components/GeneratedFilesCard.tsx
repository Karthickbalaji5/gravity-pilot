import React, { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image as ImageIcon,
  ExternalLink,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react';

export interface GeneratedFileItem {
  name?: string;
  file_name?: string;
  path?: string;
  file_path?: string;
  file_type?: string;
  extension?: string;
  size?: number;
  created_at?: string;
}

interface GeneratedFilesCardProps {
  files: GeneratedFileItem[];
  onOpenFile?: (path: string) => void;
  onPreviewScreenshot?: (url: string) => void;
}

export const GeneratedFilesCard: React.FC<GeneratedFilesCardProps> = ({
  files,
  onOpenFile,
  onPreviewScreenshot,
}) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  if (!files || files.length === 0) return null;

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleLaunch = async (path: string) => {
    if ((window as any).electronAPI?.openFile) {
      await (window as any).electronAPI.openFile(path);
      return;
    }

    try {
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      });
    } catch (e) {
      console.error('Error opening file natively:', e);
    }
  };

  const handleOpenFolder = async () => {
    if ((window as any).electronAPI?.openOutputFolder) {
      await (window as any).electronAPI.openOutputFolder();
      return;
    }

    try {
      await fetch('/api/open-folder', { method: 'POST' });
    } catch (e) {
      console.error('Error opening folder:', e);
    }
  };

  return (
    <div className="mt-3 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
          <span>📁</span> Generated Deliverables ({files.length})
        </span>
        <button
          onClick={handleOpenFolder}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 transition"
        >
          <FolderOpen className="w-3 h-3" />
          <span>Open Folder</span>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {files.map((file, idx) => {
          const rawPath = file.file_path || file.path || '';
          const name = file.file_name || file.name || (rawPath.split(/[\\/]/).pop() ?? 'file');
          const ext = (file.extension || file.file_type || name.split('.').pop() || '').toLowerCase();

          let icon = <FileText className="w-4 h-4 text-blue-400" />;
          let tagColor = 'bg-blue-950/60 border-blue-700/40 text-blue-300';
          let tagLabel = 'DOC';

          if (ext.includes('ppt') || ext === 'powerpoint') {
            icon = <Presentation className="w-4 h-4 text-orange-400" />;
            tagColor = 'bg-orange-950/60 border-orange-700/40 text-orange-300';
            tagLabel = 'PPTX';
          } else if (ext.includes('xls') || ext === 'excel') {
            icon = <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
            tagColor = 'bg-emerald-950/60 border-emerald-700/40 text-emerald-300';
            tagLabel = 'XLSX';
          } else if (ext.includes('doc') || ext === 'word') {
            icon = <FileText className="w-4 h-4 text-sky-400" />;
            tagColor = 'bg-sky-950/60 border-sky-700/40 text-sky-300';
            tagLabel = 'DOCX';
          } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            icon = <ImageIcon className="w-4 h-4 text-purple-400" />;
            tagColor = 'bg-purple-950/60 border-purple-700/40 text-purple-300';
            tagLabel = 'IMG';
          } else if (['py', 'js', 'ts', 'sh'].includes(ext)) {
            icon = <FileCode className="w-4 h-4 text-amber-400" />;
            tagColor = 'bg-amber-950/60 border-amber-700/40 text-amber-300';
            tagLabel = 'CODE';
          }

          const isScreenshot = ['png', 'jpg', 'jpeg'].includes(ext);

          return (
            <div
              key={idx}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-purple-500/40 transition group"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex-shrink-0">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100 truncate block">
                      {name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${tagColor}`}>
                      {tagLabel}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate block font-mono">
                    {rawPath}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {isScreenshot && onPreviewScreenshot && (
                  <button
                    onClick={() => onPreviewScreenshot(`/api/outputs-static/${name}`)}
                    className="p-1 rounded text-purple-400 hover:bg-purple-950/50 hover:text-purple-200 transition text-[11px]"
                    title="Preview Image"
                  >
                    View
                  </button>
                )}

                <button
                  onClick={() => handleCopy(rawPath)}
                  title="Copy Full File Path"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  {copiedPath === rawPath ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  onClick={() => handleLaunch(rawPath)}
                  title="Open in native desktop application"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-medium transition"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
