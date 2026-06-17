import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
}

export const OwnerSecurityModal: React.FC<Props> = ({ onClose }) => {
  const notify = useOwnerToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) {
      notify('Şifre en az 6 karakter olmalı.', 'error');
      return;
    }
    if (password !== confirm) {
      notify('Şifreler eşleşmiyor.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      notify('Şifreniz güncellendi.', 'success');
      setPassword('');
      setConfirm('');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerCenteredModal title="Güvenlik & Şifre" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-[#0A0E14] rounded-2xl border border-white/5">
          <Lock size={20} className="text-blue-400" />
          <p className="text-xs text-gray-400">
            Yeni şifreniz Supabase Auth üzerinden güvenli şekilde güncellenir.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Yeni Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40"
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Şifre Tekrar</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40"
            placeholder="••••••••"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !password || !confirm}
          className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 disabled:opacity-50"
        >
          {isSaving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
        </button>
      </div>
    </OwnerCenteredModal>
  );
};
