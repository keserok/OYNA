import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../../supabaseClient';

type Status = 'checking' | 'ok' | 'pending';

// v2: eski sürüm import.meta.env'i DOĞRUDAN okuyordu — env değişkeni olmayan
// (gömülü üretim yedeğiyle çalışan) kurulumlarda ve geçici ağ hatasında yanlış
// "deploy edilmedi" uyarısı basıyor, sonucu da sessionStorage'da yapıştırıyordu.
// Artık uygulamanın ÇÖZÜMLENMİŞ supabase istemcisiyle yoklar; yalnız gerçek
// "fonksiyon yok" (PGRST202) durumunda uyarır. Anahtar v2 → bayat yanlış
// 'pending' önbellekleri geçersiz.
const CACHE_KEY = 'oyna_admin_rpc_check_v2';

const isMissingFnError = (err: { code?: string; message?: string } | null): boolean => {
  if (!err) return false;
  const msg = err.message || '';
  return err.code === 'PGRST202' || msg.includes('PGRST202') || msg.includes('schema cache');
};

export const AdminStatusBar: React.FC = () => {
  const [status, setStatus] = useState<Status>(() => {
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CACHE_KEY) : null;
    if (cached === 'ok' || cached === 'pending') return cached;
    return 'checking';
  });

  useEffect(() => {
    if (status !== 'checking') return;

    let cancelled = false;
    void (async () => {
      try {
        const { error } = await supabase.rpc('admin_fetch_revenue_trend', { p_days: 1 });
        // Yalnız "fonksiyon yok" uyarı sebebidir; UNAUTHORIZED/veri hataları
        // fonksiyonun deploy edildiğini kanıtlar → ok.
        const next: Status = isMissingFnError(error) ? 'pending' : 'ok';
        if (!cancelled) {
          sessionStorage.setItem(CACHE_KEY, next);
          setStatus(next);
        }
      } catch {
        // Ağ hatası = sonuçsuz yoklama; korkutma, önbellekleme (sonraki açılış tekrar dener).
        if (!cancelled) setStatus('ok');
      }
    })();
    return () => { cancelled = true; };
  }, [status]);

  if (status === 'checking') {
    return (
      <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 bg-white/[0.02] border-b border-white/5 text-[10px] text-gray-500">
        <Loader2 size={10} className="animate-spin" />
        Altyapı kontrol ediliyor...
      </div>
    );
  }

  if (status === 'ok') return null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/25 text-[11px] text-amber-200">
      <AlertTriangle size={12} className="shrink-0" />
      <span>
        Yeni admin RPC&apos;leri henüz deploy edilmedi — gelir grafiği, ACL revoke ve kullanıcı oluşturma kısıtlı çalışır.
      </span>
      <code className="hidden md:inline text-[10px] bg-black/30 px-2 py-0.5 rounded font-mono">npm run admin:deploy</code>
    </div>
  );
};
