import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, ArrowUpCircle, RefreshCw, X } from 'lucide-react';
import { kapiyiSor, magazaAdresi, KAPI_ACIK, type KapiDurumu } from '../utils/uygulamaKapisi';
import { APP_VERSION } from '../utils/appVersion';

// ════════════════════════════════════════════════════════════════════════════
// UYGULAMA KAPISI — bakım ekranı + güncelleme ekranı + öneri şeridi
// ════════════════════════════════════════════════════════════════════════════
//
// KURUCU KARARLARI (5 Ağustos 2026):
//   1A · Bakım = TAM KİLİT. Uygulama açılır açılmaz bekleme ekranı; hiçbir
//        ekran, hiçbir ödeme açılmaz.
//   2A · Güncelleme İKİ KADEME: "önerilen"in altı → kapatılabilir şerit;
//        "en düşük"ün altı → kapatılamaz Güncelle ekranı.
//   3  · Güncelleme ekranında MAĞAZA düğmesi + DESTEK bağlantısı bulunur.
//   4  · Frenler HERKESE (oyuncu · tesis sahibi · kaleci/hakem) uygulanır —
//        bu bileşen uygulamanın en dışına takılır, rol ayrımı yapmaz.
//
// ── KAPI AÇIK ARIZALANIR ───────────────────────────────────────────────────
// Kapı sorulamazsa (ağ yok, sunucu düştü) HİÇBİR ŞEY çizilmez ve uygulama
// normal açılır. Kilit yalnız sunucu açıkça "kilitle" dediğinde kapanır.
//
// ── ÖN PLANA DÖNÜNCE TEKRAR SORULUR ────────────────────────────────────────
// Bakım kapatıldığında kullanıcı uygulamayı SİLİP kurmak zorunda kalmamalı.
// Telefon uygulamaya geri döndüğünde kapı yeniden sorulur; bakım bittiyse
// ekran kendiliğinden açılır.
// ════════════════════════════════════════════════════════════════════════════

/** Kilit ekranlarının ortak kabı — uygulamanın geri kalanıyla aynı dil. */
const KilitEkrani: React.FC<{
  ikon: React.ReactNode;
  baslik: string;
  aciklama: string;
  children?: React.ReactNode;
}> = ({ ikon, baslik, aciklama, children }) => (
  <div
    role="dialog"
    aria-modal="true"
    className="fixed inset-0 z-[300] bg-[#0A0E14] text-white flex flex-col items-center justify-center px-8 text-center"
  >
    <div className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/[0.12] flex items-center justify-center mb-6">
      {ikon}
    </div>
    <h1 className="m-0 font-[Montserrat] font-extrabold italic text-[1.5rem] leading-[1.75rem] tracking-[-0.02em]">
      {baslik}
    </h1>
    <p className="mt-3 mb-0 text-[0.875rem] leading-[1.5] text-[#F5F3EE]/[0.6] max-w-[300px]">
      {aciklama}
    </p>
    <div className="mt-8 w-full max-w-[320px] flex flex-col gap-3">{children}</div>
    <p className="mt-8 mb-0 text-[0.6875rem] text-[#F5F3EE]/[0.35]">Sürüm {APP_VERSION}</p>
  </div>
);

const BeyazDugme: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[50px] rounded-full bg-white text-[#0A0E14] text-[0.8125rem] font-semibold active:scale-[0.99] transition-transform"
  >
    {children}
  </button>
);

const SoluDugme: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[48px] rounded-full bg-white/[0.06] border border-white/[0.12] text-white text-[0.8125rem] active:scale-[0.99] transition-transform"
  >
    {children}
  </button>
);

/** "sa 14:30" gibi kısa bitiş saati — bakım planlıysa gösterilir. */
const bitisMetni = (iso: string | null): string | null => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return null;
    return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
};

export interface UygulamaKapisiProps {
  /** Kapı kapalıyken uygulamanın geri kalanı ÇİZİLMEZ. */
  children: React.ReactNode;
}

export const UygulamaKapisi: React.FC<UygulamaKapisiProps> = ({ children }) => {
  const [durum, setDurum] = useState<KapiDurumu>(KAPI_ACIK);
  const [seritKapatildi, setSeritKapatildi] = useState(false);

  const sor = useCallback(() => {
    void kapiyiSor().then(setDurum);
  }, []);

  useEffect(() => {
    sor();
    // Telefon uygulamaya geri döndüğünde kapı yeniden sorulur: bakım
    // kapatıldığında kullanıcının uygulamayı silip kurması gerekmesin.
    const gorunurluk = () => { if (document.visibilityState === 'visible') sor(); };
    document.addEventListener('visibilitychange', gorunurluk);
    return () => document.removeEventListener('visibilitychange', gorunurluk);
  }, [sor]);

  const magazayaGit = () => {
    try { window.open(magazaAdresi(), '_blank', 'noopener'); } catch { /* yut */ }
  };
  const destegeYaz = () => {
    try {
      window.location.href =
        `mailto:${durum.destek}?subject=${encodeURIComponent(`OYNA ${APP_VERSION} — yardım`)}`;
    } catch { /* yut */ }
  };

  // ── 1) BAKIM — TAM KİLİT ────────────────────────────────────────────────
  if (durum.bakim) {
    const bitis = bitisMetni(durum.bakimBitis);
    return (
      <KilitEkrani
        ikon={<Wrench size={26} className="text-[#F5F3EE]" />}
        baslik="KISA BİR BAKIMDAYIZ"
        aciklama={
          durum.bakimMesaj
            ?? (bitis
              ? `Sistemde kısa bir çalışma var. ${bitis} civarında yeniden açılıyoruz.`
              : 'Sistemde kısa bir çalışma var. Birazdan tekrar dener misin?')
        }
      >
        <BeyazDugme onClick={sor}>
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={15} /> Tekrar dene
          </span>
        </BeyazDugme>
        <SoluDugme onClick={destegeYaz}>Destek</SoluDugme>
      </KilitEkrani>
    );
  }

  // ── 2) ZORUNLU GÜNCELLEME — KAPATILAMAZ ─────────────────────────────────
  if (durum.zorunluGuncelleme) {
    return (
      <KilitEkrani
        ikon={<ArrowUpCircle size={26} className="text-[#F5F3EE]" />}
        baslik="GÜNCELLEME GEREKLİ"
        aciklama={
          durum.guncellemeMesaj
            ?? 'Bu sürüm artık kullanılmıyor. Devam etmek için uygulamayı güncellemen gerekiyor.'
        }
      >
        <BeyazDugme onClick={magazayaGit}>Mağazadan güncelle</BeyazDugme>
        <SoluDugme onClick={destegeYaz}>Destek</SoluDugme>
      </KilitEkrani>
    );
  }

  // ── 3) ÖNERİLEN GÜNCELLEME — KAPATILABİLİR ŞERİT ────────────────────────
  return (
    <>
      {durum.onerilenGuncelleme && !seritKapatildi && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-[90] bg-white text-[#0A0E14] px-4 py-2 pt-safe-2 flex items-center gap-3"
        >
          <ArrowUpCircle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 text-[0.75rem] font-semibold truncate">
            {durum.guncellemeMesaj ?? 'Yeni bir sürüm var'}
          </span>
          <button
            type="button"
            onClick={magazayaGit}
            className="shrink-0 rounded-full bg-[#0A0E14] text-white text-[0.6875rem] font-bold px-3 py-1.5"
          >
            Güncelle
          </button>
          <button
            type="button"
            onClick={() => setSeritKapatildi(true)}
            aria-label="Kapat"
            className="shrink-0 w-6 h-6 flex items-center justify-center opacity-60"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {children}
    </>
  );
};

export default UygulamaKapisi;
