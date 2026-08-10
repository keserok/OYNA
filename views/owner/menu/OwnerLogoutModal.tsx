import React from 'react';
import { LogOut } from 'lucide-react';
import { useBackDismiss } from '../../../hooks/useBackDismiss';

interface Props {
  onClose: () => void;
  onConfirm: () => void;
}

export const OwnerLogoutModal: React.FC<Props> = ({ onClose, onConfirm }) => {
  // priority 10: yikici onay, altindaki modalin ustunde kapanir (BULGU-132).
  useBackDismiss(true, onClose, 'owner-logout-modal', 10);
  return (
  <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
    <div className="bg-surface-1 w-full max-w-sm rounded-[32px] border border-white/10 p-8 text-center animate-in zoom-in duration-300">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
        <LogOut size={40} />
      </div>
      <h3 className="text-2xl font-extrabold text-white mb-2">Güvenli Çıkış</h3>
      <p className="text-gray-400 text-sm mb-8 leading-relaxed">
        Oturumunu sonlandırmak istediğine emin misin?
      </p>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onClose}
          className="py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="py-4 bg-red-500 text-white font-extrabold rounded-2xl hover:bg-red-400"
        >
          Çıkış Yap
        </button>
      </div>
    </div>
  </div>
  );
};
