import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

const STEPS = ['Oturum', 'Veritabanı', 'Envanter', 'Hazır'];

interface Props {
  mode: 'loading' | 'error';
  message?: string;
  onRetry?: () => void;
}

const AdminBootShell: React.FC<Props> = ({ mode, message, onRetry }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (mode !== 'loading') return;
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [mode]);

  return (
    <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center gap-8 p-6 text-white">
      {mode === 'loading' ? (
        <>
          <div className="relative">
            <div className="w-14 h-14 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-red-400">OS</span>
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-xs font-mono font-black tracking-widest uppercase text-gray-400">
              OYNA OS Başlatılıyor
            </p>
            <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
              Supabase&apos;den canlı veri yükleniyor
            </p>
          </div>
          <ol className="flex flex-col gap-2 w-full max-w-xs">
            {STEPS.map((label, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <li
                  key={label}
                  className={`flex items-center gap-3 text-[11px] font-mono uppercase tracking-wide px-3 py-2 rounded-lg border transition-all ${
                    done ? 'border-green-500/20 text-green-400 bg-green-500/5' :
                    current ? 'border-red-500/30 text-red-300 bg-red-500/5' :
                    'border-white/5 text-gray-600'
                  }`}
                >
                  {done ? <CheckCircle2 size={14} /> : (
                    <span className={`w-3.5 h-3.5 rounded-full border-2 ${current ? 'border-red-500 border-t-transparent animate-spin' : 'border-gray-700'}`} />
                  )}
                  {label}
                </li>
              );
            })}
          </ol>
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
