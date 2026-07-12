import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { decodeBase64Utf8, getIntentStatus } from '../../services/paymentService';

/**
 * 3D SECURE SAYFASI — banka SMS doğrulaması UYGULAMA İÇİNDE açılır
 * (Uber/Martı standardı: kullanıcı OYNA'dan hiç çıkmaz).
 *
 * Akış: edge 'pay' → threeDSHtml (base64) → bu sheet iframe'e basar →
 * banka sayfası → SMS → iyzico-3ds-callback sonucu postMessage ile bildirir.
 *
 * İki sonuç kanalı (hangisi önce gelirse):
 *   1) postMessage {source:'oyna-payment', ok, reason} — callback sayfasından
 *   2) yoklama yedeği: payment_intents.status (PAID/FAILED) her 3 sn
 * Başarıda hemen kapanır (OYNA kendi başarı ekranını gösterir); hatada banka/
 * OYNA hata sayfası görünür kalır, kullanıcı "Kapat" ile döner.
 */

export interface ThreeDSOutcome {
  ok: boolean;
  /** SLOT_TAKEN_REFUNDED | BOOKING_CLOSED_REFUNDED | MD_FAILED | AUTH_FAILED | TIMEOUT | null */
  reason: string | null;
}

interface ThreeDSSheetProps {
  htmlBase64: string;
  intentId: string;
  onDone: (outcome: ThreeDSOutcome) => void;
  /** Kullanıcı doğrulamayı yarıda bıraktı (X) — ödeme alınmadı. */
  onCancel: () => void;
}

const POLL_MS = 3000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 dk — banka SMS'i için bol süre

const ThreeDSSheet: React.FC<ThreeDSSheetProps> = ({ htmlBase64, intentId, onDone, onCancel }) => {
  const [failed, setFailed] = useState<string | null>(null); // reason — hata sayfası görünür kalır
  const doneRef = useRef(false);
  const html = useRef<string>('');
  if (!html.current) {
    try { html.current = decodeBase64Utf8(htmlBase64); }
    catch { html.current = htmlBase64; } // bazı sağlayıcılar düz HTML dönebilir
  }

  useEffect(() => {
    const finish = (outcome: ThreeDSOutcome) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone(outcome);
    };

    // 1) Sonuç sayfasından postMessage
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { source?: string; ok?: boolean; reason?: string | null } | null;
      if (!d || d.source !== 'oyna-payment') return;
      if (d.ok) {
        finish({ ok: true, reason: d.reason ?? null });
      } else {
        // Hata: sayfa görünür kalsın, kullanıcı mesajı okuyup "Kapat" desin
        setFailed(d.reason ?? 'MD_FAILED');
      }
    };
    window.addEventListener('message', onMessage);

    // 2) Yoklama yedeği (postMessage kaçarsa — ör. WebView kısıtları)
    const poll = setInterval(async () => {
      if (doneRef.current) return;
      try {
        const s = await getIntentStatus(intentId);
        if (!s) return;
        if (s.status === 'PAID') finish({ ok: true, reason: s.resultReason });
        else if (s.status === 'FAILED') setFailed(s.failReason ?? 'MD_FAILED');
      } catch { /* ağ hatası — sonraki turda tekrar */ }
    }, POLL_MS);

    // 3) Zaman aşımı
    const timeout = setTimeout(() => finish({ ok: false, reason: 'TIMEOUT' }), TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [intentId, onDone]);

  const handleClose = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (failed) onDone({ ok: false, reason: failed });
    else onCancel();
  };

  return (
    <div lang="tr" className="fixed inset-0 z-[70] bg-[#0A0E14] flex flex-col">
      <header className="px-5 pt-safe py-3.5 flex items-center gap-3 border-b border-white/8 bg-[#0A0E14] shrink-0">
        <span className="w-9 h-9 rounded-xl bg-[#39FF14]/12 flex items-center justify-center text-[#39FF14] shrink-0">
          <ShieldCheck size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-black text-white leading-tight">Banka Doğrulaması</h1>
          <p className="text-[10.5px] text-gray-500 font-semibold">3D Secure · SMS ile onayla</p>
        </div>
        <button
          onClick={handleClose}
          className={`h-9 px-3.5 rounded-full text-[12px] font-extrabold flex items-center gap-1.5 active:scale-95 transition-all ${
            failed ? 'bg-red-400 text-[#0A0E14]' : 'bg-[#161B22] border border-white/8 text-gray-300'
          }`}
        >
          <X size={14} /> {failed ? 'Kapat' : 'Vazgeç'}
        </button>
      </header>
      <iframe
        title="Banka 3D Secure doğrulaması"
        srcDoc={html.current}
        className="flex-1 w-full border-0 bg-white"
      />
      <div className="px-5 py-2.5 pb-safe border-t border-white/8 bg-[#0A0E14] shrink-0">
        <p className="text-[10.5px] text-gray-500 text-center leading-relaxed">
          Bankanın gönderdiği SMS kodunu bu sayfada gir. Onaylanmayan tutar kartına yansımaz.
        </p>
      </div>
    </div>
  );
};

export default ThreeDSSheet;
