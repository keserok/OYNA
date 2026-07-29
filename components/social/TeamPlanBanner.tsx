import React, { useEffect, useState } from 'react';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { getMatchTactic, MatchTacticInfo } from '../../services/tacticSocialService';
import { formatLabel } from '../../services/teamSocialService';

// ================================================================
// TeamPlanBanner — maç lobisinde takım planı önizlemesi (Küme 3/L76)
// Yöneticinin maça atadığı taktiği YALNIZ o takımın üyeleri görür
// (match_tactics RLS); plan yoksa hiç çizilmez. Dokunuş Stüdyo'yu
// studioContext ile tam hidre açar.
// ================================================================

const TeamPlanBanner: React.FC<{ matchId: string }> = ({ matchId }) => {
  const [plan, setPlan] = useState<MatchTacticInfo | null>(null);
  const setStudioContext = useAppStore(s => s.setStudioContext);
  const navigateTo = useAppStore(s => s.navigateTo);

  useEffect(() => {
    let alive = true;
    getMatchTactic(matchId)
      .then(p => { if (alive) setPlan(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [matchId]);

  if (!plan) return null;

  return (
    <button
      onClick={() => {
        setStudioContext({ teamId: plan.teamId, tacticId: plan.tacticId });
        navigateTo('STUDIO');
      }}
      className="w-full mb-6 rounded-2xl bg-[#39FF14]/6 border border-[#39FF14]/20 p-3.5 flex items-center gap-3 text-left active:scale-[0.99]"
    >
      <ClipboardList size={18} className="text-[#39FF14] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14]/80">
          Takım Planı Hazır
        </div>
        <div className="text-sm font-bold truncate text-white">
          {plan.name || 'Taktik'}
          <span className="text-ink-4 font-semibold">
            {plan.formation ? ` · ${plan.formation}` : ''}
            {plan.size ? ` · ${formatLabel(plan.size)}` : ''}
          </span>
        </div>
      </div>
      <ChevronRight size={16} className="text-ink-4 shrink-0" />
    </button>
  );
};

export default TeamPlanBanner;
