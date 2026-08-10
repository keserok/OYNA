import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Clock, Users } from 'lucide-react';
import { useAppStore } from '../../store';
import { sorulduIsaretle } from '../../notifications/pushIzniKapisi';

// ─── D2 — Bildirim izni açıklama ekranı ──────────────────────────────────────
//
// Telefonun kendi izin kutusu çıkmadan ÖNCE gösterilir. Amaç tek: kullanıcı
// "neden izin veriyorum"u bilsin. Eskiden izin girişte, hiçbir bağlam olmadan
// isteniyordu ve 35 kişiden sıfırı kabul etmişti.
//
// "Şimdi değil" de bir cevaptır: telefonun izin kutusu hiç açılmaz, böylece
// kullanıcının tek şansı harcanmaz. Ayarlardan sonra açabilir.

interface Props {
  /** İzin gerçekten istenecekse çağrılır (telefonun kutusunu bu açar). */
  onIzinIste: () => Promise<void> | void;
}

const PushIzniModal: React.FC<Props> = ({ onIzinIste }) => {
  const { pushIzniSorulsun, setPushIzniSorulsun } = useAppStore();
  const [bekliyor, setBekliyor] = useState(false);

  const kapat = () => {
    sorulduIsaretle();          // bu cihazda bir daha sorma
    setPushIzniSorulsun(false);
  };

  const kabul = async () => {
    if (bekliyor) return;
    setBekliyor(true);
    try {
      await onIzinIste();
    } finally {
      sorulduIsaretle();
      setPushIzniSorulsun(false);
      setBekliyor(false);
    }
  };

  return (
    <AnimatePresence>
      {pushIzniSorulsun && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-xl flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-surface-1 to-[#0d1117] border border-primary/25 shadow-[0_30px_70px_rgba(0,0,0,0.85)] p-6"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary/12 border border-primary/25 flex items-center justify-center text-primary mb-4">
              <Bell size={22} />
            </div>

            <h3 className="text-lg font-extrabold text-white tracking-tight leading-snug">
              Maçın saatinde hatırlatalım mı?
            </h3>
            <p className="text-[0.8125rem] text-gray-400 leading-relaxed mt-2">
              Kadroya girdin. Bildirimlere izin verirsen şunları kaçırmazsın:
            </p>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Clock size={15} className="text-primary shrink-0 mt-0.5" />
                <span className="text-[0.8125rem] text-white/80 leading-snug">
                  Maçtan <span className="font-bold text-white">1 saat önce</span> hatırlatma
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Users size={15} className="text-primary shrink-0 mt-0.5" />
                <span className="text-[0.8125rem] text-white/80 leading-snug">
                  Maç <span className="font-bold text-white">iptal olursa</span> ya da kadro değişirse anında haber
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <button
                onClick={() => void kabul()}
                disabled={bekliyor}
                className="w-full py-3.5 rounded-2xl font-extrabold text-[0.8125rem] uppercase tracking-widest text-black bg-primary active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {bekliyor ? 'Bir saniye…' : 'Bildirimlere izin ver'}
              </button>
              <button
                onClick={kapat}
                disabled={bekliyor}
                className="w-full py-3 rounded-2xl font-bold text-[0.8125rem] text-gray-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Şimdi değil
              </button>
            </div>

            <p className="text-[0.6875rem] text-gray-400 text-center mt-3 leading-relaxed">
              Sonra Ayarlar → Bildirimler'den değiştirebilirsin.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PushIzniModal;
