import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getCommissionBreakdown,
  type CommissionBreakdown,
  type CommissionScope,
  type CommissionModel,
} from '../../services/commissionService';

const tl = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;

interface FeeBreakdownProps {
  amount: number;
  scope?: CommissionScope;
  scopeId?: string | null;
  model?: CommissionModel;
  /** 'earner': sağlayıcı/tesis sahibi (net vurgulu). 'payer': ödeyen oyuncu (toplam vurgulu). */
  mode?: 'earner' | 'payer';
  /** Önceden hesaplanmış döküm varsa (ör. createServiceRequest dönüşü) RPC çağrısını atla. */
  preset?: CommissionBreakdown | null;
  className?: string;
}

/**
 * Komisyon dökümünü tek kaynaktan (calculate_commission) gösteren ortak bileşen.
 * Her para yüzeyinde aynı Brüt → Komisyon → Net üç satırını basar.
 */
export const FeeBreakdown: React.FC<FeeBreakdownProps> = ({
  amount, scope = 'GLOBAL', scopeId = null, model = 'MODEL_A', mode = 'earner', preset, className = '',
}) => {
  const [data, setData] = useState<CommissionBreakdown | null>(preset ?? null);
  const [loading, setLoading] = useState(!preset);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preset) { setData(preset); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setFailed(false);
    getCommissionBreakdown(amount, scope, scopeId, model).then(res => {
      if (cancelled) return;
      if (res) setData(res); else setFailed(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [amount, scope, scopeId, model, preset]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-[11px] text-gray-500 font-bold ${className}`}>
        <Loader2 size={12} className="animate-spin" /> Komisyon hesaplanıyor…
      </div>
    );
  }

  // Oran alınamadıysa tutarı GİZLEME — dürüst fallback.
  if (failed || !data) {
    return (
      <div className={`text-[11px] text-gray-400 font-medium ${className}`}>
        <div className="flex justify-between"><span>Tutar</span><span className="text-white font-bold">{tl(amount)}</span></div>
        <p className="text-gray-600 mt-1">Komisyon dökümü şu an gösterilemiyor.</p>
      </div>
    );
  }

  const rowClass = 'flex justify-between items-center text-[12px]';

  if (mode === 'payer') {
    // Ödeyen: toplam vurgulu; komisyonun OYNA'ya gittiği şeffafça belirtilir.
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className={`${rowClass} text-gray-400`}>
          <span>Tutar</span><span className="text-white font-semibold">{tl(data.amount)}</span>
        </div>
        {data.markupPct > 0 && (
          <div className={`${rowClass} text-gray-500`}>
            <span>Hizmet farkı (%{data.markupPct})</span>
            <span>+{tl(data.payerTotal - data.amount)}</span>
          </div>
        )}
        <div className="h-px bg-white/8 my-1" />
        <div className={`${rowClass}`}>
          <span className="text-white font-black uppercase tracking-wide text-[11px]">Toplam</span>
          <span className="text-[#39FF14] font-black">{tl(data.payerTotal)}</span>
        </div>
        <p className="text-[10px] text-gray-600 pt-0.5">
          Tutarın %{data.commissionPct}'i ({tl(data.oynaTake)}) OYNA hizmet bedelidir.
        </p>
      </div>
    );
  }

  // earner: net (eline geçecek) vurgulu.
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className={`${rowClass} text-gray-400`}>
        <span>Brüt tutar</span><span className="text-white font-semibold">{tl(data.amount)}</span>
      </div>
      <div className={`${rowClass} text-gray-500`}>
        <span>OYNA komisyonu (%{data.commissionPct})</span>
        <span className="text-red-400">−{tl(data.oynaTake)}</span>
      </div>
      <div className="h-px bg-white/8 my-1" />
      <div className={`${rowClass}`}>
        <span className="text-white font-black uppercase tracking-wide text-[11px]">Eline geçecek</span>
        <span className="text-[#39FF14] font-black">{tl(data.ownerNet)}</span>
      </div>
    </div>
  );
};

export default FeeBreakdown;
