import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Scale, Building2, X, Check, RefreshCw } from 'lucide-react';
import { UserRole } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { setActiveRole } from '../services/userService';
import { MODAL_BACKDROP, MODAL_CARD } from './common/motion';
import { useBackDismiss } from '../hooks/useBackDismiss';
// Rol → açılış ekranı + geçilebilir rol ayıklama tek kaynaktan (App.tsx ile ortak; drift yok).
import { roleToLandingView, switchableRoles } from '../shared/roles';

// Geriye dönük uyumluluk için yeniden dışa aktar (eski içe aktarımlar kırılmasın).
export { roleToLandingView };

const ROLE_META: Record<string, { label: string; sub: string; icon: React.ReactNode; color: string }> = {
  [UserRole.PLAYER]:     { label: 'Oyuncu',  sub: 'Maç yap, takıma katıl',          icon: <span className="text-base">⚽</span>,        color: '#f59e0b' },
  [UserRole.GOALKEEPER]: { label: 'Kaleci',  sub: 'Maç başı ücretini konuştur',     icon: <Shield size={18} />,                       color: '#22c55e' },
  [UserRole.REFEREE]:    { label: 'Hakem',   sub: 'Yönettiğin maçtan kazan',        icon: <Scale size={18} />,                        color: '#ef4444' },
  [UserRole.OWNER]:      { label: 'Tesis',   sub: 'Sahanı ve rezervasyonları yönet', icon: <Building2 size={18} />,                    color: '#3b82f6' },
};

interface RoleSwitcherProps {
  /** Kullanıcının sahip olduğu roller (profiles.roles). */
  roles: string[];
  /** Sheet kapatma. */
  onClose: () => void;
  /**
   * Rol başarıyla değiştikten sonra ilgili açılış ekranına yönlendirme.
   * App.tsx'teki mevcut resetNavigation mantığı buraya bağlanır; böylece
   * merkezi yönlendirme tekrarlanmaz/bozulmaz.
   */
  onSwitched: (newRole: UserRole, landingView: import('../types').AppView) => void;
}

const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ roles, onClose, onSwitched }) => {
  // App.tsx yalnız isRoleSwitcherOpen iken mount ediyor → open sabit true (BULGU-020).
  useBackDismiss(true, onClose, 'role-switcher');
  const activeRole = useAppStore(s => s.role);
  const setRole = useAppStore(s => s.setRole);

  const [pending, setPending] = useState<UserRole | null>(null); // onay bekleyen hedef rol
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Geçerli, benzersiz rolleri ayıkla (görünürlük kapılarıyla TEK kaynak).
  const availableRoles = switchableRoles(roles);

  const handleConfirm = async () => {
    if (!pending || !auth.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const result = await setActiveRole(pending);
      if (!result) {
        setError('Rol değiştirilemedi. Lütfen tekrar dene.');
        setLoading(false);
        return;
      }
      const newRole = pending;
      setRole(newRole); // store'daki aktif rolü güncelle
      if (navigator.vibrate) navigator.vibrate([20, 40, 60]);
      onSwitched(newRole, roleToLandingView(newRole));
    } catch (err) {
      console.error('[RoleSwitcher] switch error:', err);
      setError('Bir hata oluştu. Lütfen tekrar dene.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      {...MODAL_BACKDROP}
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-end justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        {...MODAL_CARD}
        className="w-full rounded-t-[28px] p-6"
        style={{ background: 'linear-gradient(180deg, #161B22 0%, #0A0E14 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-extrabold text-white text-lg">Rol Değiştir</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-white p-1" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
          Bu hesaba bağlı rollerden birine geçebilirsin. Geçiş yaptığında ilgili panele yönlendirilirsin.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl text-xs font-bold text-center bg-red-500/15 border border-red-500/25 text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2.5">
          {availableRoles.map(role => {
            const meta = ROLE_META[role];
            const isActive = role === activeRole;
            return (
              <button
                key={role}
                disabled={isActive || loading}
                onClick={() => { setError(null); setPending(role); }}
                className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border transition-all text-left ${
                  isActive
                    ? 'bg-white/[0.06] border-white/10 cursor-default'
                    : 'bg-[#0F1318] border-white/5 hover:bg-white/5 active:scale-[0.99]'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${meta.color}1f`, color: meta.color, border: `1px solid ${meta.color}40` }}
                >
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-white">{meta.label}</p>
                  <p className="text-[0.6875rem] text-gray-400 truncate">{meta.sub}</p>
                </div>
                {isActive ? (
                  <span className="flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] shrink-0">
                    <Check size={12} /> Aktif
                  </span>
                ) : (
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 shrink-0">Geç</span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Hafif onay modalı (tam re-auth değil) ── */}
      <AnimatePresence>
        {pending && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-6"
            onClick={() => !loading && setPending(null)}
          >
            <motion.div
              {...MODAL_CARD}
              className="w-full max-w-xs rounded-[28px] p-6 text-center"
              style={{ background: '#161B22', border: `1px solid ${ROLE_META[pending].color}40` }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: `${ROLE_META[pending].color}1f`, color: ROLE_META[pending].color, border: `1px solid ${ROLE_META[pending].color}40` }}
              >
                {ROLE_META[pending].icon}
              </div>
              <h3 className="text-base font-extrabold text-white mb-1.5">Rol Değişikliği</h3>
              <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                <span className="font-extrabold text-white">'{ROLE_META[pending].label}'</span> rolüne geçmek istediğine emin misin?
              </p>
              <div className="space-y-2.5">
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="w-full h-12 rounded-2xl font-extrabold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                  style={{ background: ROLE_META[pending].color }}
                >
                  {loading ? (<><RefreshCw size={15} className="animate-spin" /> Geçiliyor...</>) : 'Evet, Geç'}
                </button>
                <button
                  onClick={() => setPending(null)}
                  disabled={loading}
                  className="w-full h-12 rounded-2xl font-extrabold text-sm text-gray-400 border border-white/10 disabled:opacity-60"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RoleSwitcher;
