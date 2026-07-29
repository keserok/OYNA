import React from 'react';
import { Save, X } from 'lucide-react';
import { ownerModalOverlay } from '../design/ownerTheme';
import { useBackDismiss } from '../../../hooks/useBackDismiss';

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
}) => {
  // Android geri tuşu + Esc bu modalı kapatır; panel açık kalır (BULGU-132).
  useBackDismiss(true, onClose, 'owner-fullscreen-modal');
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
      <div className="bg-[#161B22] p-4 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/5 safe-area-top">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white"
        >
          <X size={20} />
        </button>
        <h2 className="text-white font-bold text-lg text-center truncate min-w-0">{title}</h2>
        {onSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="min-h-[44px] px-4 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-2 hover:bg-blue-500 disabled:opacity-50"
          >
            {isSaving ? '...' : (
              <>
                <Save size={16} /> {saveLabel}
              </>
            )}
          </button>
        ) : (
          <div className="w-11" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</div>
    </div>
  );
};

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
}) => {
  useBackDismiss(true, onClose, 'owner-centered-modal');
  return (
    // Karartmaya dokunmak kapatır; panele dokunuş yukarı sızmaz.
    <div className={`${ownerModalOverlay} animate-in fade-in duration-200`} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#161B22] w-full ${maxWidth} rounded-[32px] border border-white/10 p-8 flex flex-col max-h-[90dvh] animate-in zoom-in duration-300`}
      >
        {/* Kapatma butonu SOLDA: tek elle telefon tutan kullanıcı için sağ üst
            köşe erişilemez bölge. Üç sütunlu ızgara başlığı gerçekten ortalar
            (justify-between ile uzun başlık sağa kayardı). */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 mb-6 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-11 h-11 flex items-center justify-center bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <h3 className="text-xl font-extrabold text-white tracking-tight text-center truncate min-w-0">{title}</h3>
          <div className="w-11" />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">{children}</div>
      </div>
    </div>
  );
};
