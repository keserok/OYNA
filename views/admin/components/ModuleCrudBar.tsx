import React, { useState } from 'react';
import { Plus, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import { purgeModuleDemo, seedModuleDemo, toTurkishAdminError, type DemoModuleKey } from '../../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from './ConfirmDialog';

interface ModuleCrudBarProps {
  moduleKey?: DemoModuleKey | null;
  addLabel?: string;
  onAdd?: () => void;
  onRefresh?: () => Promise<void>;
  showDemo?: boolean;
}

export const ModuleCrudBar: React.FC<ModuleCrudBarProps> = ({
  moduleKey,
  addLabel,
  onAdd,
  onRefresh,
  showDemo = true,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<'seed' | 'purge' | null>(null);
  const { success, error: toastError } = useAdminToast();

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      if (onRefresh) await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    if (!moduleKey) return;
    try {
      const result = await seedModuleDemo(moduleKey);
      success(`Demo veriler yüklendi`);
      if (onRefresh) await onRefresh();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  const handlePurge = async () => {
    if (!moduleKey) return;
    try {
      await purgeModuleDemo(moduleKey);
      success('Demo veriler temizlendi');
      if (onRefresh) await onRefresh();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {onAdd && addLabel && (
          <button
            onClick={onAdd}
            disabled={loading}
            className="inline-flex items-center gap-2 h-9 px-4 bg-white text-black hover:bg-gray-100 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
          >
            <Plus size={14} strokeWidth={2.5} /> {addLabel}
          </button>
        )}
        {showDemo && moduleKey && import.meta.env.DEV && (
          <>
            <button
              onClick={() => setConfirm('seed')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-purple-600/90 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <Sparkles size={13} /> Demo
            </button>
            <button
              onClick={() => setConfirm('purge')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-transparent hover:bg-white/5 text-gray-400 hover:text-red-400 text-[11px] font-bold rounded-lg border border-white/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} /> Demo Sil
            </button>
          </>
        )}
        {onRefresh && (
          <button
            onClick={() => void run(onRefresh)}
            disabled={loading}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-transparent hover:bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Yenile"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'seed'}
        title="Demo verileri yükle"
        description="Bu modül için örnek kayıtlar eklenecek. Mevcut demo kayıtlar önce silinir."
        confirmLabel="Yükle"
        onConfirm={() => { setConfirm(null); void handleSeed(); }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'purge'}
        title="Demo verileri sil"
        description="Yalnızca demo işaretli kayıtlar kalıcı olarak silinecek."
        confirmLabel="Sil"
        destructive
        onConfirm={() => { setConfirm(null); void handlePurge(); }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
};
