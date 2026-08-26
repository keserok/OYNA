import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OynaLogo } from '../components/OynaLogo';
import { oauthDonusuMu } from '../supabaseAuth';

interface SplashScreenProps {
  onStart: () => void;
  /** Oturum geri yüklemesi çözülene dek otomatik ilerlemeyi bekletir
      (yoksa kayıtlı oturum varken 1,2 sn'de AUTH'a düşülüyordu). */
  ready?: boolean;
}

// Her harf için ayrı animasyon varyantı
const letterVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.6 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 20,
      delay: 0.2 + i * 0.05,
    },
  }),
};

export default function SplashScreen({ onStart, ready = true }: SplashScreenProps) {
  // IP-15: otomatik geçiş `ready`yi bekliyordu ama DOKUNUŞ beklemiyordu.
  // Erken dokunan kullanıcı, oturumu açık olsa bile AUTH ekranına düşüyor;
  // oturum çözülünce ekran altından kayıyordu. Artık dokunuş da bekler.
  //
  // Ama ağ takılırsa kullanıcı burada hapsolmasın: 6 sn sonra dokunuş yine
  // kabul edilir — yeni bir tuzak yaratmamak için.
  const [timedOut, setTimedOut] = useState(false);
  // Bekleme yazısı hemen değil ~1 sn sonra çıkar; hızlı bağlantıda yanıp sönmesin.
  const [bekleyenGoster, setBekleyenGoster] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setBekleyenGoster(true), 1000);
    const t2 = setTimeout(() => setTimedOut(true), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const canStart = ready || timedOut;

  // ─── SAĞLAYICI DÖNÜŞÜ: JENERİK OYNATILMAZ (22 Ağustos 2026) ───────────────
  // Web'de Google/Apple girişi TAM SAYFA yönlendirmesidir: uygulama kapanır,
  // sağlayıcıya gidilir, geri dönülür ve uygulama SIFIRDAN açılır. Bu ekran
  // dönüşü normal bir ilk açılıştan ayırt etmiyordu; kullanıcı Google'dan
  // döner dönmez 2,6 saniyelik marka jeneriğiyle karşılaşıyordu ve bunu
  // "uygulama beni attı, baştan başlattı" diye okuyordu.
  //
  // Dönüşte ekran BEKLETMEZ: oturum çözülür çözülmez geçilir. Tek başına bu
  // bile hissi düzeltir — kullanıcı jeneriği değil, kaldığı yeri görür.
  // `useState` ile İLK render'da bir kez ölçülür: sonraki render'larda adres
  // temizlenmiş olabilir ve süre ortada değişirse ekran zıplardı.
  const [oauthDonusu] = useState(oauthDonusuMu);

  // Kurucu kararı (26 Ağu 2026): açılış ~1 sn'de bitsin — jenerik değil eşik.
  //
  // Buradaki tarihi ders hâlâ geçerli: süre bir kez 1,2 sn'ye indirilmişti
  // ama animasyon SIKIŞTIRILMADAN indirildiği için ekran yarıda kesiliyordu.
  // Kural şu: BU SAYI TEK BAŞINA DEĞİŞTİRİLMEZ. Süre ile koreografi birlikte
  // oynar. Bugünkü hizalama: harfler ~0,65 sn'de oturur, slogan 0,8 sn'de,
  // yükleme çizgisi 0,9 sn'de biter; 1,0 sn hepsine yetip kısa bir duruş
  // bırakır. Bir öğe eklersen önce onun bitiş anını hesapla.
  //
  // Arka plan yükü (oturum çözümü, ilk veri, tembel parçalar) endişe değil:
  // aşağıdaki geçiş `ready`yi bekliyor — oturum 1 sn'den geç çözülürse ekran
  // kendiliğinden o kadar kalır. Süreyi kısaltmak o güvenceyi değiştirmez.
  const ACILIS_SURESI_MS = oauthDonusu ? 0 : 1000;
  useEffect(() => {
    if (!ready) return; // oturum durumu belli olmadan otomatik geçme
    const timer = setTimeout(onStart, ACILIS_SURESI_MS);
    return () => clearTimeout(timer);
  }, [onStart, ready, ACILIS_SURESI_MS]);

  const letters = ['O', 'Y', 'N', 'A'];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="splash"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.4 }}
        className={`fixed inset-0 flex flex-col items-center justify-center bg-[#040814] overflow-hidden z-50 select-none ${canStart ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={canStart ? onStart : undefined}
      >
        {/* ── Arka Plan: Yavaş Hareket Eden Neon Halkalar ── */}
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [0.08, 0.18, 0.08] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-[500px] h-[500px] rounded-full border border-[#39FF14]/20 pointer-events-none"
        />
        <motion.div
          animate={{ scale: [1.2, 1.6, 1.2], opacity: [0.04, 0.12, 0.04] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          className="absolute w-[700px] h-[700px] rounded-full border border-[#39FF14]/10 pointer-events-none"
        />

        {/* ── Merkez Glow ── */}
        <motion.div
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-[300px] h-[300px] rounded-full bg-[#39FF14]/15 blur-[80px] pointer-events-none"
        />

        {/* ── Logo ── */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.6, type: 'spring', stiffness: 300, damping: 20 }}
          className="relative z-10 flex flex-col items-center"
        >
          {/* Logo Container — pulse ring */}
          <motion.div
            animate={{
              boxShadow: [
                '0 0 0 0px rgba(57,255,20,0)',
                '0 0 0 16px rgba(57,255,20,0.06)',
                '0 0 0 32px rgba(57,255,20,0)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
            className="w-[160px] h-[160px] flex items-center justify-center rounded-full"
          >
            <OynaLogo
              animate={false}
              width="100%"
              height="100%"
              className="text-primary drop-shadow-[0_0_24px_rgba(57,255,20,0.45)]"
            />
          </motion.div>

          {/* ── OYNA Harfleri — stagger animasyonu ── */}
          <div className="mt-6 flex items-center gap-1">
            {letters.map((letter, i) => (
              <motion.span
                key={letter + i}
                custom={i}
                variants={letterVariants}
                initial="hidden"
                animate="show"
                className="text-4xl font-extrabold text-white tracking-[0.3em] drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]"
              >
                {letter}
              </motion.span>
            ))}
          </div>

          {/* ── Tagline ── */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.35 }}
            className="mt-3 text-[0.625rem] font-bold tracking-[0.4em] text-[#39FF14]/70 uppercase"
          >
            Potansiyel zaferler için
          </motion.p>

          {/* Dönüşte kullanıcı NE OLDUĞUNU okur: "kontrol ediliyor" değil,
              başlattığı işin devamı. Bu yazı gecikmesiz çıkar — dönüş
              beklemesi kısa da olsa boş ekran bırakmayalım. */}
          {oauthDonusu ? (
            <p role="status" aria-live="polite" className="mt-2 text-[0.8125rem] font-semibold text-gray-400">
              Giriş tamamlanıyor…
            </p>
          ) : (!canStart && bekleyenGoster && (
            <p role="status" aria-live="polite" className="mt-2 text-[0.8125rem] font-semibold text-gray-400">
              Oturum kontrol ediliyor…
            </p>
          ))}

          {/* ── Alt Yükleme Çizgisi ── */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '120px' }}
            transition={{ delay: 0.35, duration: 0.55, ease: 'easeOut' }}
            className="mt-8 h-[2px] bg-gradient-to-r from-transparent via-[#39FF14] to-transparent rounded-full"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
