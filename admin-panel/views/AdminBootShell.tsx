import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { AdminBootPhase } from '../services/adminBootstrap';
import { Spinner } from '../../components/ui/Spinner';

const STEPS = ['Oturum', 'Envanter', 'Operasyonel', 'Hazır'];

const PHASE_STEP: Record<AdminBootPhase, number> = {
  session: 0,
  inventory: 1,
  operational: 2,
  ready: 3,
};

interface Props {
  mode: 'loading' | 'error';
  phase?: AdminBootPhase;
  message?: string;
  onRetry?: () => void;
  /** Yükleme uzun sürerse gösterilen kaçış kapısı (ör. çıkış → giriş ekranı). */
  onEscape?: () => void;
}

const AdminBootShell: React.FC<Props> = ({ mode, phase = 'session', message, onRetry, onEscape }) => {
  const step = PHASE_STEP[phase];
  const allDone = phase === 'ready';

  // Yükleme 12 sn'yi geçerse kullanıcı asla kilitli kalmasın: bir kaçış kapısı sun.
  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    if (mode !== 'loading' || !onEscape) return;
    setShowEscape(false);
    const t = setTimeout(() => setShowEscape(true), 12_000);
    return () => clearTimeout(t);
  }, [mode, onEscape]);

  return (
    <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center gap-8 p-6 text-white">
      {mode === 'loading' ? (
        <>
          <div className="relative">
            <Spinner size={56} thickness={4} color="#EF4444" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-red-400">OS</span>
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-xs font-mono font-black tracking-widest uppercase text-gray-400">
              OYNA OS Başlatılıyor
            </p>
            <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
              {phase === 'session' && 'Oturum doğrulanıyor…'}
              {phase === 'inventory' && 'Saha ve maç envanteri yükleniyor…'}
              {phase === 'operational' && 'Kullanıcılar ve KPI verileri yükleniyor…'}
              {phase === 'ready' && 'Panel hazırlanıyor…'}
            </p>
          </div>
          <ol className="flex flex-col gap-2 w-full max-w-xs">
            {STEPS.map((label, i) => {
              const done = allDone || i < step;
              const current = !allDone && i === step;
              return (
                <li
                  key={label}
                  className={`flex items-center gap-3 text-[11px] font-mono uppercase tracking-wide px-3 py-2 rounded-lg border transition-all ${
                    done ? 'border-green-500/20 text-green-400 bg-green-500/5' :
                    current ? 'border-red-500/30 text-red-300 bg-red-500/5' :
                    'border-white/5 text-gray-600'
                  }`}
                >
                  {done ? <CheckCircle2 size={14} /> : current ? (
                    <Spinner size={14} thickness={2} color="#EF4444" glow={false} />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-700" />
                  )}
                  {label}
                </li>
              );
            })}
          </ol>
          {showEscape && onEscape && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Beklenenden uzun sürüyor
              </p>
              <button
                type="button"
                onClick={onEscape}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-300 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
              >
                <RefreshCw size={13} />
                Giriş ekranına dön
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-lg font-black uppercase tracking-widest text-red-400 mb-2">
              Veri Yüklenemedi
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              {message || 'Platform verileri Supabase\'den alınamadı. Mock veri gösterilmiyor.'}
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-2 px-6 py-3 bg-red-600/20 border border-red-500/40 rounded-xl text-red-300 text-xs font-black uppercase tracking-widest hover:bg-red-600/30 transition-colors"
            >
              <RefreshCw size={14} />
              Yeniden Dene
            </button>
          )}
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider text-center max-w-sm">
            Bağlantı ve migration için: <code className="text-gray-500">npm run admin:deploy</code>
          </p>
        </>
      )}
    </div>
  );
};

export default AdminBootShell;
