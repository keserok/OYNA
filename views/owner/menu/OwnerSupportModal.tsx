import React from 'react';
import { ExternalLink, HelpCircle, Mail } from 'lucide-react';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
}

const SUPPORT_EMAIL = 'destek@oyna.app';

export const OwnerSupportModal: React.FC<Props> = ({ onClose }) => (
  <OwnerCenteredModal title="Destek Merkezi" onClose={onClose}>
    <div className="space-y-4">
      <p className="text-sm text-gray-400 leading-relaxed">
        Tesis paneli, ödeme entegrasyonu veya plan yükseltme konularında ekibimiz size yardımcı
        olur.
      </p>

      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=OYNA%20İşletme%20Paneli%20Destek`}
        className="flex items-center gap-4 p-4 bg-[#0A0E14] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
          <Mail size={20} />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-white">E-posta Desteği</h4>
          <p className="text-xs text-gray-500">{SUPPORT_EMAIL}</p>
        </div>
        <ExternalLink size={16} className="text-gray-500" />
      </a>

      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
        <HelpCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200">
          Acil teknik sorunlarda tesis adınız ve ekran görüntüsü ile yazın; öncelikli yanıt
          alırsınız.
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10"
      >
        Kapat
      </button>
    </div>
  </OwnerCenteredModal>
);
