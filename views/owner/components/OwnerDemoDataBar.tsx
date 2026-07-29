import React, { useState } from 'react';
import { FlaskConical, Trash2 } from 'lucide-react';
import { useConfirmSheet } from './useConfirmSheet';
import {
  seedOwnerScreenDemo,
  purgeOwnerScreenDemo,
  toTurkishError,
} from '../../../services/pitchOwnerService';
import { useOwnerToast } from './useOwnerToast';

/**
 * WP5: Finans & Ekip ekranlarında SİLİNEBİLİR demo veri kontrolü.
 * Gerçek DB satırları (is_demo=true) ekler/temizler; gerçek kayıtlarla karışmaz.
 */
export const OwnerDemoDataBar: React.FC<{
  pitchId: string;
  onChanged: () => void;
  hasDemo?: boolean;
}> = ({ pitchId, onChanged, hasDemo }) => {
  const notify = useOwnerToast();
  const { confirm, confirmElement } = useConfirmSheet();
  const [busy, setBusy] = useState<null | 'seed' | 'purge'>(null);
  const canUse = !!pitchId && !pitchId.startsWith('mock-');
  if (!canUse) return null;

  const run = async (kind: 'seed' | 'purge') => {
    if (kind === 'purge' && !(await confirm({ title: 'Demo verileri sil?', message: 'Bu tesise ait tüm demo veriler temizlenecek.', confirmLabel: 'Sil', destructive: true }))) return;
    setBusy(kind);
    try {
      if (kind === 'seed') {
        await seedOwnerScreenDemo(pitchId);
        notify('Demo veriler eklendi.', 'success');
      } else {
        await purgeOwnerScreenDemo(pitchId);
        notify('Demo veriler temizlendi.', 'success');
      }
      onChanged();
    } catch (e) {
      notify(toTurkishError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-amber-500/5 border border-amber-500/15">
      <div className="flex items-center gap-2 text-[11px] text-amber-200/80 font-bold">
        <FlaskConical size={14} /> Demo veri — ekranı dolu gör, sonra tek dokunuşla temizle
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('seed')}
          className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/25 disabled:opacity-50 hover:bg-amber-500/25 transition-colors"
        >
          {busy === 'seed' ? '...' : 'Demo Ekle'}
        </button>
        {hasDemo && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('purge')}
            className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 disabled:opacity-50 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={12} /> {busy === 'purge' ? '...' : 'Temizle'}
          </button>
        )}
      </div>
      {confirmElement}
    </div>
  );
};
