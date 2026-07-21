/**
 * Kurulum Sihirbazı ilerleme kartı (Faz 7 — saha sahibi kazanımının kalbi).
 * Yeni anlaşılan tesis sahibinin vitrine çıkmak için eksik adımlarını tek
 * bakışta gösterir; her eksik adım tek dokunuşla ilgili ekrana götürür.
 * Tüm adımlar tamamlanınca parça gizlenir (kart yalnız iş varken görünür).
 */
import React from 'react';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';

export interface SetupStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  onFix: () => void;
}

export const OwnerSetupProgress: React.FC<{ steps: SetupStep[] }> = ({ steps }) => {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 100;
  if (doneCount === steps.length) return null; // tamamlandıysa gizle

  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="bg-gradient-to-br from-[#12203a] to-[#161B22] border border-blue-500/20 rounded-3xl p-5 mb-6 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-black text-white">Tesisini yayına hazırla</h3>
          <p className="text-[11px] text-blue-200/70 mt-0.5">
            %{pct} tamamlandı · {steps.length - doneCount} adım kaldı
          </p>
        </div>
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="#10B981" strokeWidth="3"
              strokeDasharray={`${(pct / 100) * 94.2} 94.2`} strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white">%{pct}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.done ? undefined : s.onFix}
            disabled={s.done}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
              s.done ? 'opacity-60' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/5'
            }`}
          >
            {s.done ? (
              <CheckCircle2 size={18} className="text-[#10B981] shrink-0" />
            ) : (
              <Circle size={18} className="text-blue-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-bold ${s.done ? 'text-gray-400 line-through' : 'text-white'}`}>{s.label}</div>
              {!s.done && <div className="text-[10px] text-gray-500 truncate">{s.hint}</div>}
            </div>
            {!s.done && <ArrowRight size={15} className="text-gray-500 shrink-0" />}
          </button>
        ))}
      </div>

      {nextStep && (
        <button
          type="button"
          onClick={nextStep.onFix}
          className="mt-3 w-full py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider hover:bg-blue-500 transition-colors"
        >
          Sıradaki: {nextStep.label}
        </button>
      )}
    </div>
  );
};
