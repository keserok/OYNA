import React, { useState, useEffect } from 'react';
import { Shield, Scale, Building2, Activity, RefreshCw } from 'lucide-react';
import { UserRole, AppView } from '../../types';
import { useAppStore } from '../../store';
import { auth } from '../../supabaseAuth';
import { getFullUserProfile } from '../../services/userService';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Ayarlar → Sahada Rolün ───────────────────────────────────────────────────
// Profil'den taşındı. Oyunculuk her zaman açık; kullanıcı ek rol (Kaleci/Hakem/
// Tesis) için başvurur. Sahip olduğu role dokununca RoleSwitcher açılır;
// başvurmadığı rol için ilgili onboarding/başvuru akışına yönlendirilir.
interface FieldRolePageProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
}

const ROLE_OPTS = [
  { r: UserRole.GOALKEEPER, label: 'Kaleci', sub: 'Maç başı ücretini konuştur, talep al', color: '#39FF14', icon: <Shield size={20} /> },
  { r: UserRole.REFEREE, label: 'Hakem', sub: 'Yönettiğin maçtan kazan', color: '#FF3333', icon: <Scale size={20} /> },
  { r: UserRole.OWNER, label: 'Tesis', sub: 'Sahanı ve rezervasyonları yönet', color: '#3b82f6', icon: <Building2 size={20} /> },
];

const FieldRolePage: React.FC<FieldRolePageProps> = ({ open, onClose, onNavigate }) => {
  const uid = auth.currentUser?.uid || '';
  const { setMyRoles, setIsRoleSwitcherOpen, setServiceAppRole } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !uid) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const profile = await getFullUserProfile(uid);
        if (!active) return;
        setRoles((profile?.roles ?? []) as string[]);
        setPending(((profile as { verification_status?: string })?.verification_status) === 'pending');
      } catch {
        if (active) { setRoles((auth.currentUser?.roles ?? []) as string[]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, uid]);

  const handleRole = (r: UserRole, owned: boolean) => {
    if (owned) {
      if (roles.length) setMyRoles(roles);
      onClose();
      setIsRoleSwitcherOpen(true);
      return;
    }
    if (r === UserRole.OWNER) { onClose(); onNavigate('PARTNER_ONBOARDING'); return; }
    setServiceAppRole(r);
    onClose();
    onNavigate('SERVICE_APPLICATION');
  };

  return (
    <SettingsSubPage open={open} onClose={onClose} title="Sahada Rolün" subtitle="Oyunculuğun her zaman açık — ek rol için başvur">
      {loading ? (
        <div className="py-16 flex justify-center"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-gray-400 leading-relaxed">
            Oyunculuğun her zaman açık. İstersen ek bir rol için başvur; onaylanınca uygulamayı açtığında doğrudan o panele yönlendirilirsin.
          </p>

          {pending && (
            <div className="rounded-2xl px-3.5 py-3 text-[12px] font-bold flex items-center gap-2" style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.35)', color: '#FFAA00' }}>
              <Activity size={15} className="shrink-0" /> Başvurun inceleniyor — oyuncu olarak oynamaya devam edebilirsin.
            </div>
          )}

          <div className="space-y-2.5">
            {ROLE_OPTS.map((opt) => {
              const owned = roles.includes(opt.r);
              return (
                <button
                  key={opt.r}
                  onClick={() => handleRole(opt.r, owned)}
                  className="w-full flex items-center gap-3 rounded-2xl p-4 border transition-all active:scale-[0.99]"
                  style={{ background: `${opt.color}0d`, borderColor: `${opt.color}26` }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${opt.color}1a`, color: opt.color }}>
                    {opt.icon}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-white leading-tight">{opt.label}</p>
                    <p className="text-[11px] text-gray-400 truncate">{opt.sub}</p>
                  </div>
                  {owned ? (
                    <span className="text-[10px] font-extrabold px-3 py-1.5 rounded-full shrink-0" style={{ color: opt.color, background: `${opt.color}1a`, border: `1px solid ${opt.color}40` }}>SAHİP</span>
                  ) : (
                    <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-full shrink-0 text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/40">Başvur →</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </SettingsSubPage>
  );
};

export default FieldRolePage;
