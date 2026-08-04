import { useEffect, useState } from 'react';
import {
  previewLeaveMatch,
  fetchMatchCancelPolicy,
  CANCEL_POLICY_FALLBACK,
  type LeaveMatchQuote,
  type MatchCancelPolicy,
} from '../services/matchService';

// ════════════════════════════════════════════════════════════════════════════
// [K-15.1] MAÇ LOBİSİ — PARA ALANI
// ────────────────────────────────────────────────────────────────────────────
// Kurucu kararı K-15.1: MatchJoin.tsx, TEKNİK katmana göre değil ÜRÜN
// KAVRAMLARINA göre bölünür. Bu dosya "Para" öbeğidir.
//
// NEDEN AYRI BİR DOSYA: Kurucunun onayladığı iki karar doğrudan buraya
// dokunuyor —
//   • K-3.3  "saha/admin iptalinde tüm kullanıcılara paraları eksiksiz döner"
//   • K-1.1  kaptan para paneli (kim ödedi / kim ödemedi)
// Bölme ölçütü şuydu: kurucunun bir cümlesi = tek bir dosya. Bundan sonra
// "iptal/iade kuralını değiştirelim" dendiğinde YALNIZ bu dosya açılır.
//
// KAPSAM: iptal politikası (serbest iptal saati, kademeler) ve ayrılma
// önizlemesi (ne kadarı iade, ne kadarı yanıyor, kaç puan düşüyor).
// Ekranın kendisi MatchJoin'de kalır; burası yalnız VERİYİ getirir.
// ════════════════════════════════════════════════════════════════════════════

export interface MacParaBilgisi {
  /** Maçın iptal/iade politikası. Sunucudan gelmezse güvenli varsayılan. */
  iptalPolitikasi: MatchCancelPolicy;
  /** "Ayrıl" onayı açıkken hesaplanan iade önizlemesi. Hata olursa null. */
  leaveQuote: LeaveMatchQuote | null;
  leaveQuoteLoading: boolean;
}

/**
 * @param macId           Lobisi açık olan maçın kimliği.
 * @param ayrilmaOnayiAcik "Ayrıl" onay kutusu açık mı — önizleme yalnız o an çekilir.
 */
export function useMacParaBilgisi(
  macId: string | undefined,
  ayrilmaOnayiAcik: boolean,
): MacParaBilgisi {
  const [iptalPolitikasi, setIptalPolitikasi] = useState<MatchCancelPolicy>(CANCEL_POLICY_FALLBACK);
  const [leaveQuote, setLeaveQuote] = useState<LeaveMatchQuote | null>(null);
  const [leaveQuoteLoading, setLeaveQuoteLoading] = useState(false);

  // İptal politikası: maç açıldığında bir kez. Lobideki her cümle (kaptan
  // iptali, ödeme notu) o an geçerli sayıyı gösterir.
  useEffect(() => {
    if (!macId) return;
    let alive = true;
    fetchMatchCancelPolicy(macId).then((p) => { if (alive && p) setIptalPolitikasi(p); });
    return () => { alive = false; };
  }, [macId]);

  // Ayrılma önizlemesi: yalnız onay kutusu AÇIKKEN çekilir.
  // "Hata" ile "iade yok" AYRI sonuçlardır: hata durumunda quote null kalır
  // ve ekranda AYRIL düğmesi pasifleşir — kullanıcı ne alacağını bilmeden
  // ayrılmaz.
  useEffect(() => {
    if (!ayrilmaOnayiAcik || !macId) {
      setLeaveQuote(null);
      setLeaveQuoteLoading(false);
      return;
    }
    let alive = true;
    setLeaveQuoteLoading(true);
    previewLeaveMatch(macId)
      .then((q) => { if (alive) setLeaveQuote(q); })
      .catch((e) => {
        console.error('[useMacParaBilgisi] ayrılma önizlemesi alınamadı:', e);
        if (alive) setLeaveQuote(null);
      })
      .finally(() => { if (alive) setLeaveQuoteLoading(false); });
    return () => { alive = false; };
  }, [ayrilmaOnayiAcik, macId]);

  return { iptalPolitikasi, leaveQuote, leaveQuoteLoading };
}
