import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { updateOwnerBillingEmail } from '../../../services/ownerAccountService';
import { toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
  userId: string;
  initialEmail?: string | null;
  planTier?: string;
  onSaved: (email: string) => void;
}

export const OwnerBillingSettingsModal: React.FC<Props> = ({
  onClose,
  userId,
  initialEmail,
  planTier = 'Starter',
  onSaved,
}) => {
  const notify = useOwnerToast();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      notify('Geçerli bir fatura e-postası girin.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await updateOwnerBillingEmail(userId, trimmed);
      onSaved(trimmed);
      notify('Fatura e-postası kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerCenteredModal title="SaaS & Fatura" onClose={onClose}>
      <div className="space-y-5">
        <div className="p-4 bg-bg rounded-2xl border border-white/5">
          <p className="text-[10px] text-gray-500 uppercase font-bold">Mevcut Plan</p>
          <p className="text-lg font-extrabold text-white mt-1">{planTier}</p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
            <Mail size={12} /> Fatura E-postası
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-bg border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40"
            placeholder="fatura@sirket.com"
          />
          <p className="text-[10px] text-gray-500">
            Plan yükseltme ve fatura bildirimleri bu adrese gönderilir.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-blue-600 text-white font-extrabold rounded-2xl hover:bg-blue-500 disabled:opacity-50"
        >
          {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </OwnerCenteredModal>
  );
};
