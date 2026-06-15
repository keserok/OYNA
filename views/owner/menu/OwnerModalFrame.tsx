import React from 'react';
import { Save, X } from 'lucide-react';
import { ownerModalOverlay } from '../design/ownerTheme';

interface OwnerFullscreenModalProps {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  children: React.ReactNode;
}

export const OwnerFullscreenModal: React.FC<OwnerFullscreenModalProps> = ({
  title,
  onClose,
  onSave,
  saveLabel = 'KAYDET',
  isSaving = false,
  children,
}) => (
  <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
    <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white"
      >
        <X size={20} />
      </button>
      <h2 className="text-white font-bold text-lg">{title}</h2>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="p-2 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-2 hover:bg-blue-500 disabled:opacity-50"
        >
          {isSaving ? '...' : (
            <>
              <Save size={16} /> {saveLabel}
            </>
          )}
        </button>
      ) : (
        <div className="w-16" />
      )}
    </div>
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</div>
  </div>
);

interface OwnerCenteredModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export const OwnerCenteredModal: React.FC<OwnerCenteredModalProps> = ({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}) => (
  <div className={`${ownerModalOverlay} animate-in fade-in duration-200`}>
    <div
      className={`bg-[#161B22] w-full ${maxWidth} rounded-[32px] border border-white/10 p-8 flex flex-col max-h-[90vh] animate-in zoom-in duration-300`}
    >
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">{children}</div>
    </div>
  </div>
);
