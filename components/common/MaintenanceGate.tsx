/**
 * Bakım modu kapısı (Eksiklik #4'ün zorlama katmanı).
 * Sunucudaki is_maintenance_active() değerini açılışta + her 3 dakikada bir +
 * uygulama öne gelince kontrol eder; aktifse adminler HARİÇ tam ekran bakım
 * perdesi gösterir. Hata durumunda kapı AÇIK kalır (fail-open): RPC yoksa veya
 * ağ koptuysa kullanıcıyı asla yanlışlıkla kilitlemez.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const CHECK_INTERVAL_MS = 3 * 60 * 1000;

export const MaintenanceGate: React.FC = () => {
  const [active, setActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('is_maintenance_active');
      if (error) { setActive(false); return; } // fail-open
      const on = data === true;
      setActive(on);
      if (on) {
        // Yalnız perde inecekken admin muafiyetine bak (gereksiz sorgu yapmaz)
        const { data: u } = await supabase.auth.getUser();
        if (u?.user) {
          const { data: p } = await supabase
            .from('profiles').select('is_admin').eq('id', u.user.id).maybeSingle();
          setIsAdmin(!!p?.is_admin);
        } else {
          setIsAdmin(false);
        }
      }
    } catch {
      setActive(false); // fail-open
    }
  }, []);

  useEffect(() => {
    void check();
    const t = setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  const retry = async () => {
    setChecking(true);
    await check();
    setChecking(false);
  };

  if (!active || isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-[#0A0E14] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-3xl bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center mb-6">
        <Wrench size={36} className="text-yellow-400" />
      </div>
      <h1 className="text-xl font-black text-white mb-2">Kısa bir bakımdayız</h1>
      <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
        OYNA'yı daha iyi hale getirmek için kısa süreliğine bakımdayız.
        Birazdan tekrar buradayız — rezervasyonlarınız ve bakiyeniz güvende.
      </p>
      <button
        type="button"
        onClick={() => void retry()}
        disabled={checking}
        className="mt-8 flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50"
      >
        <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> Tekrar Dene
      </button>
    </div>
  );
};

export default MaintenanceGate;
