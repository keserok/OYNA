import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Shield, Scale, Star, Zap, Users } from 'lucide-react';
import { useAppStore } from '../../store';
import { UserRole } from '../../types';
import { showToast } from '../common/GlobalToast';
import type { DeferredProvider } from '../../services/matchLifecycleService';
import { formatTRYShort } from '../../utils/formatTRY';

// ════════════════════════════════════════════════════════════════════════════
// ProviderOfferPicker — maç oluşturmada kaleci/hakem TEKLİF seçici (marketplace).
//   • GK/REF sekmeleri, çoklu seçim (birden çok sağlayıcıya teklif).
//   • "Tümüne gönder" — uygun tüm sağlayıcılara teklif.
//   • Seçimler MatchCreate'e döner (deferredProviders); kapora bloke edilince
//     (aktivasyon) teklifler GERÇEKTEN gönderilir; ilk kabul eden işi alır.
//   Create sheet olarak render edilir → MatchCreate state'i korunur.
// ════════════════════════════════════════════════════════════════════════════

interface ProviderOfferPickerProps {
  onClose: () => void;
  onConfirm: (offers: DeferredProvider[]) => void;
  initial?: DeferredProvider[];
  /**
   * E10: bölgede sağlayıcı yokken "başvur" yolu. Yönlendirmeyi MatchCreate
   * yapar (onNavigate ile) — sheet kendi başına gezinmez.
   */
  onApplyAsProvider?: (role: UserRole) => void;
}

type Tab = 'GK' | 'REF';

const ProviderOfferPicker: React.FC<ProviderOfferPickerProps> = ({ onClose, onConfirm, initial = [], onApplyAsProvider }) => {
  const { adminGoalkeepers, adminReferees } = useAppStore();

  const init = (t: Tab) => initial.find(o => o.type === t);
  const [tab, setTab] = useState<Tab>('GK');
  const [selGK, setSelGK] = useState<Set<string>>(new Set(init('GK')?.all ? [] : init('GK')?.providerIds || []));
  const [selREF, setSelREF] = useState<Set<string>>(new Set(init('REF')?.all ? [] : init('REF')?.providerIds || []));
  const [allGK, setAllGK] = useState<boolean>(!!init('GK')?.all);
  const [allREF, setAllREF] = useState<boolean>(!!init('REF')?.all);

  const providers = tab === 'GK' ? (adminGoalkeepers || []) : (adminReferees || []);
  const sel = tab === 'GK' ? selGK : selREF;
  const setSel = tab === 'GK' ? setSelGK : setSelREF;
  const all = tab === 'GK' ? allGK : allREF;
  const setAll = tab === 'GK' ? setAllGK : setAllREF;

  /** E10: bölgede sağlayıcı yokken tanıdığını davet et — arz tarafını büyütür. */
  const shareProviderInvite = useCallback(async () => {
    const rol = tab === 'GK' ? 'kaleci' : 'hakem';
    const text = `OYNA'da ${rol} olarak maçlara katılıp kazanç sağlayabilirsin. Bizim bölgede ${rol} az — başvurmana sevinirim! https://oyna.app`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `OYNA · ${rol} daveti`, text, url: 'https://oyna.app' });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('Davet metni kopyalandı');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') showToast('Davet paylaşılamadı, metni elle gönderebilirsin.');
    }
  }, [tab]);

  const toggle = (id: string) => {
    if (all) return;
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalSelected = useMemo(() => {
    const g = allGK ? 1 : selGK.size;
    const r = allREF ? 1 : selREF.size;
    return { g, r, any: g > 0 || r > 0 };
  }, [allGK, allREF, selGK, selREF]);

  const confirm = () => {
    const offers: DeferredProvider[] = [];
    if (allGK) offers.push({ type: 'GK', providerIds: [], all: true });
    else if (selGK.size) offers.push({ type: 'GK', providerIds: [...selGK], all: false });
    if (allREF) offers.push({ type: 'REF', providerIds: [], all: true });
    else if (selREF.size) offers.push({ type: 'REF', providerIds: [...selREF], all: false });
    onConfirm(offers);
    onClose();
  };

  const accent = tab === 'GK' ? '#39FF14' : '#FACC15';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-bg flex flex-col">
      {/* Başlık */}
      <div className="pt-safe px-5 pt-5 pb-3 border-b border-white/8 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white italic tracking-tight uppercase">Kaleci &amp; Hakem</h2>
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest mt-0.5" style={{ color: accent }}>
              Çoklu teklif · ilk kabul eden alır
            </p>
          </div>
          <button onClick={onClose} aria-label="Kapat"
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95">
            <X size={18} />
          </button>
        </div>
        {/* Sekmeler */}
        <div className="bg-surface-1 p-1.5 rounded-2xl flex border border-white/5">
          <button onClick={() => setTab('GK')}
            className={`flex-1 py-2.5 text-[0.6875rem] font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 ${tab === 'GK' ? 'bg-primary text-on-primary' : 'text-ink-4'}`}>
            <Shield size={14} /> KALECİ{totalSelected.g > 0 ? ` · ${allGK ? 'Tümü' : selGK.size}` : ''}
          </button>
          <button onClick={() => setTab('REF')}
            className={`flex-1 py-2.5 text-[0.6875rem] font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 ${tab === 'REF' ? 'bg-warning text-on-primary' : 'text-ink-4'}`}>
            <Scale size={14} /> HAKEM{totalSelected.r > 0 ? ` · ${allREF ? 'Tümü' : selREF.size}` : ''}
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-40">
        {/* Tümüne gönder */}
        {/* E10: liste boşken "Tümüne Gönder" anlamsız — kimse yokken herkese
            teklif göndermek ölü bir butondur, o yüzden gizlenir. */}
        {providers.length > 0 && (
          <button onClick={() => setAll(!all)}
            className={`w-full mb-3 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border transition-all ${all ? 'border-2' : 'bg-white/[0.03] border-white/10'}`}
            style={all ? { background: `${accent}14`, borderColor: `${accent}80` } : {}}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}1f`, color: accent }}>
                <Users size={18} />
              </div>
              <div className="text-left">
                <p className="text-sm font-extrabold text-white uppercase italic">Tümüne Gönder</p>
                <p className="text-[0.6875rem] text-ink-4">Uygun tüm {tab === 'GK' ? 'kalecilere' : 'hakemlere'} teklif</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center`} style={all ? { background: accent, borderColor: accent, color: '#0A0E14' } : { borderColor: 'rgba(255,255,255,0.25)' }}>
              {all && <Check size={14} strokeWidth={3} />}
            </div>
          </button>
        )}

        {providers.length === 0 ? (
          /* E10 — DÜRÜST BOŞ DURUM. "Bulunamadı" demek arama hatası gibi
             okunuyordu; gerçek sebep bölgede henüz sağlayıcı olmaması.
             Kullanıcıya iki gerçek çıkış yolu veriyoruz: kendisi başvursun
             ya da tanıdığını yönlendirsin. Maç ikisi de olmadan kurulabilir. */
          <div className="py-10 px-2 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                 style={{ background: `${accent}1a`, color: accent }}>
              {tab === 'GK' ? <Shield size={24} /> : <Scale size={24} />}
            </div>
            <p className="text-sm font-extrabold text-white mb-1.5">
              Bu bölgede {tab === 'GK' ? 'kaleci' : 'hakem'} sayısı az
            </p>
            <p className="text-[0.75rem] leading-relaxed text-white/50 mb-5">
              Kendin başvurabilir ya da tanıdığın bir {tab === 'GK' ? 'kaleciyi' : 'hakemi'} yönlendirebilirsin.
              Maçını {tab === 'GK' ? 'kaleci' : 'hakem'} olmadan da kurabilirsin.
            </p>
            <div className="flex flex-col gap-2">
              {/* Davet paylaşımı yerinde çalışır, maç kurulumundan çıkarmaz. */}
              <button
                onClick={shareProviderInvite}
                className="w-full py-3 rounded-2xl text-[0.8125rem] font-extrabold uppercase tracking-wide"
                style={{ background: accent, color: '#0A0E14' }}
              >
                Tanıdığını Davet Et
              </button>
              {onApplyAsProvider && (
                <button
                  onClick={() => onApplyAsProvider(tab === 'GK' ? UserRole.GOALKEEPER : UserRole.REFEREE)}
                  className="w-full py-3 rounded-2xl text-[0.8125rem] font-extrabold uppercase tracking-wide bg-white/[0.06] border border-white/10 text-white/80"
                >
                  {tab === 'GK' ? 'Kaleci Olarak Başvur' : 'Hakem Olarak Başvur'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`space-y-2.5 transition-opacity ${all ? 'opacity-40 pointer-events-none' : ''}`}>
            {providers.map((p: any) => {
              const on = sel.has(p.id);
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${on ? 'border-2' : 'bg-white/4 border-white/6'}`}
                  style={on ? { background: `${accent}12`, borderColor: `${accent}80` } : {}}>
                  <img src={p.avatar} alt={p.name} referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-2xl object-cover bg-white/5 border border-white/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">{p.name}</span>
                      {p.isElite && <Zap size={12} className="text-warning shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[0.6875rem] text-ink-4">
                      <span className="flex items-center gap-1"><Star size={11} className="fill-white/60 text-white/60" /> {p.rating}</span>
                      <span className="text-ink-4">·</span>
                      <span className="truncate">{p.preferredZones?.[0] || 'Bölge'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold" style={{ color: accent }}>{formatTRYShort(p.fee)}</div>
                    <div className="text-[0.625rem] font-bold uppercase text-ink-4 tracking-widest">bedel</div>
                  </div>
                  <span className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center`}
                    style={on ? { background: accent, borderColor: accent, color: '#0A0E14' } : { borderColor: 'rgba(255,255,255,0.2)' }}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sabit onay çubuğu */}
      <div className="absolute bottom-0 inset-x-0 p-5 pb-safe bg-gradient-to-t from-bg via-bg/95 to-transparent">
        {totalSelected.any && (
          <p className="text-[0.6875rem] text-ink-4 font-bold text-center mb-2">
            Teklifler, kaporayı ödeyip maçı aktifleştirdiğinde gönderilir.
          </p>
        )}
        <button onClick={confirm} disabled={!totalSelected.any}
          className="w-full min-h-[54px] rounded-2xl bg-primary text-on-primary font-extrabold text-sm uppercase tracking-widest active:scale-[0.98] disabled:opacity-40 disabled:bg-white/10 disabled:text-ink-4 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(57,255,20,0.25)]">
          <Zap size={16} />
          {totalSelected.any ? 'Kaporayı Ödediğinde Teklif Gönder' : 'Kaleci veya hakem seç'}
        </button>
      </div>
    </motion.div>
  );
};

export default ProviderOfferPicker;
