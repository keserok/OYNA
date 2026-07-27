/**
 * Kullanıcı 360 (Karar #58): profil + PII (maskeli, audit'li göster) + cüzdan
 * özeti/ledger + güvenilirlik + bu kullanıcıya dokunan admin işlemleri —
 * hepsi tek drawer'da. Aksiyonlar (ban/doğrula/ghost/düzenle) UsersPage'in
 * mevcut onaylı akışlarına delege edilir; burada yeni bir yetki yolu açılmaz.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Ban, ShieldCheck, PlayCircle, Edit3, Eye, Wallet, ScrollText,
  BadgeCheck, Loader2, Mail, Phone, Star,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { toTurkishAdminError } from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { StatusBadge } from './StatusBadge';
import { UserProfileMirror } from './UserProfileMirror';
import { maskEmail, maskPhone } from '../../utils/pii';
import type { AdminUser } from '../../../types';

interface Props {
  user: AdminUser | null;
  onClose: () => void;
  onBanToggle: (u: AdminUser) => void;
  onVerify: (u: AdminUser) => void;
  onGhost: (u: AdminUser) => void;
  onEdit: (u: AdminUser) => void;
  /** Profil Aynası bir alan kaydettiğinde liste tazelemesi için. */
  onUpdated?: () => void;
}

interface WalletRow {
  id: string;
  amount: number;
  balance_type: string | null;
  status: string | null;
  reference_type: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  admin_name: string;
  created_at: string;
}

const fmtMoney = (n: number) => `${Number(n).toLocaleString('tr-TR')}₺`;

export const User360Drawer: React.FC<Props> = ({ user, onClose, onBanToggle, onVerify, onGhost, onEdit, onUpdated }) => {
  const { error: toastError } = useAdminToast();
  // Varsayılan sekme PROFİL: kullanıcıyı uygulamadaki hâliyle gör + düzenle (ayna).
  const [tab, setTab] = useState<'profil' | 'operasyon'>('profil');
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  // PII yalnızca audit'li "göster" tıklamasından sonra açılır (Karar #39).
  // Gerçek değer istemcide tutulmaz; admin_reveal_pii sunucuda okur + loglar.
  const [revealed, setRevealed] = useState<{ email: string | null; phone: string | null }>({ email: null, phone: null });

  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [walletRes, auditRes, profileRes] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('id, amount, balance_type, status, reference_type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('admin_audit_log')
          .select('id, action, admin_name, created_at')
          .eq('target_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', userId)
          .single(),
      ]);
      setWallet((walletRes.data ?? []) as WalletRow[]);
      setAudit((auditRes.data ?? []) as AuditRow[]);
      setWalletBalance(profileRes.data ? Number(profileRes.data.wallet_balance ?? 0) : null);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [userId, toastError]);

  useEffect(() => {
    setRevealed({ email: null, phone: null });
    setWallet([]);
    setAudit([]);
    setWalletBalance(null);
    setTab('profil');
    if (userId) void load();
  }, [userId, load]);

  const revealPii = async (field: 'email' | 'phone') => {
    if (!userId) return;
    try {
      // Zorunlu audit: değer sunucudan gelir, log düşmeden dönmez (KVKK izi)
      const { data, error } = await supabase.rpc('admin_reveal_pii', { p_target_user_id: userId, p_field: field });
      if (error) throw error;
      setRevealed((prev) => ({ ...prev, [field]: (data as string | null) ?? '—' }));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  if (!user) return null;

  const reliability = user.reliabilityScore ?? Math.round((user.rating ?? 5) * 20);

  // Portal → document.body: dönüşümlü (transform) bir üst öğe içinde kalırsa
  // `position:fixed` viewport yerine o öğeye göre konumlanıp üst kısmı ekranın
  // dışında/arkasında kalıyordu. Body'ye portal ederek her zaman viewport'a hizalanır.
  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[240] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl"
        >
          {/* Başlık */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=1f2937&color=fff`}
                alt=""
                className="w-11 h-11 rounded-full object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 font-mono uppercase">Kullanıcı 360</p>
                <h2 className="text-sm font-black text-white truncate">{user.name}</h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">{user.role || 'PLAYER'}</span>
                  {user.isBanned ? <StatusBadge tone="danger">BANLI</StatusBadge> : <StatusBadge tone="success">AKTİF</StatusBadge>}
                  {user.isVerified && <StatusBadge tone="info">DOĞRULANMIŞ</StatusBadge>}
                  {user.cardActive && <StatusBadge tone="info">{(user.cardTier || 'bronze').toUpperCase()} KART</StatusBadge>}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Sekmeler: PROFİL = uygulama aynası (düzenlenebilir), OPERASYON = 360 verisi */}
          <div className="flex items-stretch border-b border-white/10 shrink-0">
            {([
              { key: 'profil', label: 'Profil (Uygulama Aynası)' },
              { key: 'operasyon', label: 'Operasyon 360' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide border-b-2 transition-colors ${
                  tab === key ? 'border-[#39FF14] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'profil' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              <UserProfileMirror userId={user.id} onUpdated={onUpdated} />
            </div>
          )}

          <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 ${tab !== 'operasyon' ? 'hidden' : ''}`}>
            {/* İletişim (PII — maskeli) */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2.5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">İletişim (KVKK — görüntüleme kayıt altına alınır)</p>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-gray-300 font-mono min-w-0">
                  <Mail size={12} className="text-gray-500 shrink-0" />
                  <span className="truncate">{revealed.email ?? (user.email ? maskEmail(user.email) : '—')}</span>
                </span>
                {user.email && revealed.email === null && (
                  <button type="button" onClick={() => void revealPii('email')} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-white border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <Eye size={11} /> Göster
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-gray-300 font-mono min-w-0">
                  <Phone size={12} className="text-gray-500 shrink-0" />
                  <span className="truncate">{revealed.phone ?? (user.phone ? maskPhone(user.phone) : '—')}</span>
                </span>
                {revealed.phone === null && (
                  <button type="button" onClick={() => void revealPii('phone')} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-white border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <Eye size={11} /> Göster
                  </button>
                )}
              </div>
            </div>

            {/* Güvenilirlik & istatistik */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Güvenilirlik</p>
                <p className={`text-lg font-black font-mono ${reliability >= 80 ? 'text-green-400' : reliability >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{reliability}</p>
              </div>
              <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Puan</p>
                <p className="text-lg font-black font-mono text-white flex items-center justify-center gap-1">
                  {(user.rating ?? 5).toFixed(1)} <Star size={12} className="text-[#FFFF00] fill-current" />
                </p>
              </div>
              <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Maç</p>
                <p className="text-lg font-black font-mono text-white">{user.matchCount ?? 0}</p>
              </div>
            </div>

            {/* Cüzdan */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={12} /> Cüzdan
                </p>
                <span className="text-sm font-black font-mono text-[#39FF14]">
                  {walletBalance !== null ? fmtMoney(walletBalance) : '—'}
                </span>
              </div>
              {loading ? (
                <p className="text-[11px] text-gray-600 py-3 text-center flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Yükleniyor…</p>
              ) : wallet.length === 0 ? (
                <p className="text-[11px] text-gray-600 py-3 text-center">Cüzdan hareketi yok.</p>
              ) : (
                <div className="space-y-1.5">
                  {wallet.map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-2 bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white truncate">
                          {w.reference_type || w.balance_type || 'Hareket'}
                          {w.status && <span className="text-gray-500 font-normal"> · {w.status}</span>}
                        </p>
                        <p className="text-[9px] text-gray-600 font-mono">{new Date(w.created_at).toLocaleString('tr-TR')}</p>
                      </div>
                      <span className={`text-xs font-black font-mono shrink-0 ${Number(w.amount) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {Number(w.amount) >= 0 ? '+' : ''}{fmtMoney(Number(w.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bu kullanıcıya dokunan admin işlemleri */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <ScrollText size={12} /> Admin İşlem Geçmişi (bu kullanıcı)
              </p>
              {audit.length === 0 ? (
                <p className="text-[11px] text-gray-600 py-2 text-center">Kayıtlı admin işlemi yok.</p>
              ) : audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-gray-300 truncate">{a.action}</span>
                  <span className="text-gray-600 shrink-0">{a.admin_name} · {new Date(a.created_at).toLocaleDateString('tr-TR')}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              Üyelik: {user.joinDate ? new Date(user.joinDate).toLocaleDateString('tr-TR') : '—'}
              {user.oynaId ? ` · OYNA ID: ${user.oynaId}` : ''} · ID: <span className="font-mono">{user.id.slice(0, 8)}…</span>
            </p>
          </div>

          {/* Aksiyon barı — mevcut onaylı akışlara delege */}
          <div className="shrink-0 p-4 border-t border-white/10 grid grid-cols-4 gap-2">
            <button type="button" onClick={() => onEdit(user)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[9px] font-black uppercase">
              <Edit3 size={14} /> Düzenle
            </button>
            <button type="button" onClick={() => onBanToggle(user)} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[9px] font-black uppercase border ${user.isBanned ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              {user.isBanned ? <ShieldCheck size={14} /> : <Ban size={14} />}
              {user.isBanned ? 'Unban' : 'Banla'}
            </button>
            <button type="button" disabled={user.isVerified} onClick={() => onVerify(user)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[9px] font-black uppercase disabled:opacity-30">
              <BadgeCheck size={14} /> Doğrula
            </button>
            <button type="button" onClick={() => onGhost(user)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-[9px] font-black uppercase">
              <PlayCircle size={14} /> Ghost
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
};
