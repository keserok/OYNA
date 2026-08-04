import React, { useState, useEffect } from 'react';
import { Shield, Scale, Building2, Activity, RefreshCw, KeyRound, ChevronRight } from 'lucide-react';
import { UserRole, AppView } from '../../types';
import { useAppStore } from '../../store';
import { auth } from '../../supabaseAuth';
import { getFullUserProfile } from '../../services/userService';
import { hasMultipleSwitchableRoles } from '../../shared/roles';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Ayarlar → Sahada Rolün ───────────────────────────────────────────────────
// Profil'den taşındı. Oyunculuk her zaman açık; kullanıcı ek rol (Kaleci/Hakem)
// için başvurur. Sahip olduğu role dokununca RoleSwitcher açılır; başvurmadığı
// rol için başvuru akışına yönlendirilir.
// IP-22: Tesis rolüne BAŞVURULMAZ — tesis ve yetkilileri OYNA ekibi tarafından
// tanımlanır. Bu yüzden "Tesis" satırı yalnız role ZATEN sahip olana gösterilir.
interface FieldRolePageProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
  /**
   * "Tesise Katıl" — 6 haneli davet koduyla bir tesis ekibine katılma.
   * Kullanıcı kararı (2026-08): Ayarlar'ın "İşletme" bölümünden buraya taşındı;
   * davet koduyla ekibe girmek de bir "sahadaki rolün" meselesi.
   * Modal Ayarlar ekranında duruyor (katılım sonrası tesis listesini orası
   * tazeliyor); bu sayfa yalnız açılışı tetikler. Verilmezse satır çizilmez.
   */
  onJoinPitch?: () => void;
}

const ROLE_OPTS = [
  { r: UserRole.GOALKEEPER, label: 'Kaleci', sub: 'Maç başı ücretini konuştur, talep al', color: '#39FF14', icon: <Shield size={20} /> },
  { r: UserRole.REFEREE, label: 'Hakem', sub: 'Yönettiğin maçtan kazan', color: '#FF3333', icon: <Scale size={20} /> },
  { r: UserRole.OWNER, label: 'Tesis', sub: 'Sahanı ve rezervasyonları yönet', color: '#3b82f6', icon: <Building2 size={20} /> },
];

const FieldRolePage: React.FC<FieldRolePageProps> = ({ open, onClose, onNavigate, onJoinPitch }) => {
  const uid = auth.currentUser?.uid || '';
  const { myRoles, setMyRoles, setIsRoleSwitcherOpen, setServiceAppRole } = useAppStore();
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
      // IP-14 · BULGU-027: burada eskiden `setMyRoles(roles)` vardı — profilden
      // gelen HAM diziyi yazıyor ve App.tsx'in bilinçli kurduğu
      // `profiles.roles ∪ aktif rol` birleşimini eziyordu. Eski owner
      // hesaplarında profiles.roles 'OWNER' içermediği için rol kayboluyordu.
      // Artık ezmiyoruz, BİRLEŞTİRİYORUZ.
      const birlesik = Array.from(new Set<string>([...(myRoles || []), ...roles]));
      if (birlesik.length) setMyRoles(birlesik);

      // Rol değiştirici yalnız ≥2 geçilebilir rol varsa RENDER EDİLİYOR
      // (App.tsx kapısı). Tek rolde eskiden sayfa kapanıp hiçbir şey açılmıyordu:
      // dokunuş sessizce yutuluyordu. Artık tek roldeyken sayfa AÇIK kalır.
      if (!hasMultipleSwitchableRoles(birlesik)) return;

      onClose();
      setIsRoleSwitcherOpen(true);
      return;
    }
    setServiceAppRole(r);
    onClose();
    onNavigate('SERVICE_APPLICATION');
  };

  return (
    <SettingsSubPage open={open} onClose={onClose} title="Sahada Rolün" subtitle="Oyunculuğun her zaman açık — ek rol için başvur">
      {loading ? (
        <div className="py-16 flex justify-center"><RefreshCw size={20} className="animate-spin text-ink-4" /></div>
      ) : (
        <div className="space-y-4">
          <p className="text-[0.8125rem] text-gray-400 leading-relaxed">
            Oyunculuğun her zaman açık. İstersen ek bir rol için başvur; onaylanınca uygulamayı açtığında doğrudan o panele yönlendirilirsin.
          </p>

          {pending && (
            <div className="rounded-2xl px-3.5 py-3 text-[0.75rem] font-bold flex items-center gap-2" style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.35)', color: '#FFAA00' }}>
              <Activity size={15} className="shrink-0" /> Başvurun inceleniyor — oyuncu olarak oynamaya devam edebilirsin.
            </div>
          )}

          <div className="space-y-2.5">
            {ROLE_OPTS.filter((opt) => opt.r !== UserRole.OWNER || roles.includes(opt.r)).map((opt) => {
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
                    <p className="text-[0.6875rem] text-gray-400 truncate">{opt.sub}</p>
                  </div>
                  {owned ? (
                    <span className="text-[0.6875rem] font-extrabold px-3 py-1.5 rounded-full shrink-0" style={{ color: opt.color, background: `${opt.color}1a`, border: `1px solid ${opt.color}40` }}>SAHİP</span>
                  ) : (
                    <span className="text-[0.6875rem] font-extrabold px-3 py-1.5 rounded-full shrink-0 text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/40">Başvur →</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── TESİSE KATIL ──────────────────────────────────────────────
              Rol BAŞVURUSU değil, davet kodu kullanma: ayrı bir başlık
              altında ve ayrı bir görsel dilde duruyor ki yukarıdaki üç
              "başvur" satırıyla karışmasın.
              IP-22 hatırlatması: tesis rolüne başvurulmaz — tesisi OYNA ekibi
              tanımlar. Buradaki iş, TANIMLANMIŞ bir tesisin ekibine
              katılmaktır. */}
          {onJoinPitch && (
            <div className="pt-1">
              <h3 className="text-xs font-bold text-ink-4 uppercase mb-2.5 ml-1">Tesis Ekibi</h3>
              <button
                onClick={() => { onClose(); onJoinPitch(); }}
                className="w-full flex items-center gap-3 p-4 bg-[#161B22] border border-white/8 rounded-2xl hover:bg-white/5 transition-colors active:scale-[0.99]"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-gray-300 shrink-0">
                  <KeyRound size={20} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-white leading-tight">Tesise Katıl</p>
                  <p className="text-[0.6875rem] text-gray-400">Sana verilen 6 haneli davet koduyla tesis ekibine katıl</p>
                </div>
                <ChevronRight size={18} className="text-ink-4 shrink-0" />
              </button>
            </div>
          )}
        </div>
      )}
    </SettingsSubPage>
  );
};

export default FieldRolePage;
