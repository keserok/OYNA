import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudOff, RefreshCw, X, Clock, Send } from 'lucide-react';
import { subscribeOutbox, flushOutbox } from '../../../services/offline/outbox';
import type { OutboxItem } from '../../../shared/outboxModel';

// ─── P-OFFLINE — bekleyen işlem rozeti + detay sayfası ───────────────────────
// Kuyruk boşken hiç render olmaz. Doluyken panel başlığında amber çip:
// "⏳ N bekleyen". Dokununca DETAY SAYFASI açılır (para dürüstlüğü: saha
// sahibi NEYİN beklemede olduğunu görür) — her satırda işlem etiketi + saat;
// "Tümünü Gönder" ile elle tetiklenir. Online olayında zaten otomatik gönderilir.

const timeOf = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

/** `chip` = başlık içi küçük rozet. `strip` = alt barın üstünde tam genişlik şerit
 *  (BULGU-125: nakit tahsilat Takvim'den yapılıyor, orada başlık hiç yok). */
export const OutboxBadge: React.FC<{ variant?: 'chip' | 'strip' }> = ({ variant = 'chip' }) => {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => subscribeOutbox(setItems), []);

  // Kuyruk boşaldıysa (gönderim başarılı) sayfayı kapat — rozet de kaybolur.
  useEffect(() => { if (items.length === 0) setOpen(false); }, [items.length]);

  if (items.length === 0) return null;

  const sendAll = async () => {
    if (flushing) return;
    setFlushing(true);
    try { await flushOutbox(); } finally { setFlushing(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'strip'
            ? 'fixed left-4 right-4 z-40 flex items-center justify-center gap-2 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 backdrop-blur-md text-amber-300 text-[13px] font-black uppercase max-w-lg mx-auto active:scale-[0.99] transition-transform'
            : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase whitespace-nowrap active:scale-95 transition-transform'
        }
        // 72px = OwnerBottomNav yüksekliği (8+48+8) + 8px boşluk.
        style={variant === 'strip' ? { bottom: 'calc(var(--safe-bottom) + 72px)' } : undefined}
      >
        <CloudOff size={variant === 'strip' ? 15 : 12} />
        {variant === 'strip' ? `${items.length} kasa işlemi gönderilmedi` : `${items.length} bekleyen`}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[130] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[36px] shadow-2xl p-6 pb-8"
            >
              <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-black text-white italic tracking-tight uppercase flex items-center gap-2">
                  <CloudOff size={18} className="text-amber-400" /> Bekleyen İşlemler
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 bg-[#0A0E14] rounded-full flex items-center justify-center text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-[11.5px] text-gray-400 leading-relaxed mb-4">
                Bağlantı yokken alınan kayıtlar. İnternet gelince otomatik gönderilir;
                istersen şimdi dene.
              </p>

              <div className="max-h-[45vh] overflow-y-auto flex flex-col gap-2 mb-4">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#0A0E14] border border-white/5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{it.label}</p>
                      {it.tries > 0 && (
                        <p className="text-[10px] text-amber-400/80 font-bold mt-0.5">
                          {it.tries} deneme yapıldı · yeniden denenecek
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 flex items-center gap-1 text-[11px] text-gray-500 tabular-nums">
                      <Clock size={11} /> {timeOf(it.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={sendAll}
                disabled={flushing}
                className="w-full py-3.5 rounded-2xl bg-amber-400 text-black text-[14px] font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {flushing ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                {flushing ? 'Gönderiliyor…' : 'Tümünü Gönder'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
