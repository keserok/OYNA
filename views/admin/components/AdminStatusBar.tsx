import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

type Status = 'checking' | 'ok' | 'pending';

const CACHE_KEY = 'oyna_admin_rpc_check_v1';

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
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!url || !key) {
          if (!cancelled) {
            sessionStorage.setItem(CACHE_KEY, 'pending');
            setStatus('pending');
          }
          return;
        }
        const res = await fetch(`${url}/rest/v1/rpc/admin_fetch_revenue_trend`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_days: 1 }),
        });
        const text = await res.text();
        const next: Status = text.includes('PGRST202') ? 'pending' : 'ok';
        if (!cancelled) {
          sessionStorage.setItem(CACHE_KEY, next);
          setStatus(next);
        }
      } catch {
        if (!cancelled) {
          sessionStorage.setItem(CACHE_KEY, 'pending');
          setStatus('pending');
        }
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
