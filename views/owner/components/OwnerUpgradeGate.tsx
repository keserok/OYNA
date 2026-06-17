import React from 'react';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { ownerCard } from '../design/ownerTheme';

interface OwnerUpgradeGateProps {
  title: string;
  description: string;
  features?: string[];
  onUpgrade: () => void;
  onBack?: () => void;
}

export const OwnerUpgradeGate: React.FC<OwnerUpgradeGateProps> = ({
  title,
  description,
  features = [],
  onUpgrade,
  onBack,
}) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
    <div className={`${ownerCard} p-8 max-w-sm w-full relative overflow-hidden`}>
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
      <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-5">
        <Lock size={26} className="text-amber-400" />
      </div>
      <h2 className="text-lg font-black text-white mb-2">{title}</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">{description}</p>
      {features.length > 0 && (
        <ul className="text-left space-y-2 mb-6">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <Sparkles size={12} className="text-amber-400 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onUpgrade}
        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black rounded-xl text-sm flex items-center justify-center gap-2 hover:from-amber-400 hover:to-amber-500 transition-all active:scale-[0.98]"
      >
        Planı Yükselt
        <ArrowRight size={16} />
      </button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-xs font-bold text-slate-500 hover:text-slate-300"
        >
          Özet&apos;e dön
        </button>
      )}
    </div>
  </div>
);
