/**
 * Kullanıcı 360 (Karar #58): profil + PII (maskeli, audit'li göster) + TAHSİLAT
 * özeti + güvenilirlik + bu kullanıcıya dokunan admin işlemleri —
 * hepsi tek drawer'da.
 *
 * CÜZDAN BLOĞU KALDIRILDI (17 Ağu 2026): tüketici cüzdanı kapandı, bakiye artık
 * her kullanıcıda 0 — panel para hakkında yalnız anlamsız bir sıfır gösteriyordu.
 * Yerine kurucunun istediği soru cevaplanıyor: bu kişiden ne kadar tahsil
 * edildi, ne kadarı iade edildi, hangi kartla ödüyor. Aksiyonlar (ban/doğrula/ghost/düzenle) UsersPage'in
 * mevcut onaylı akışlarına delege edilir; burada yeni bir yetki yolu açılmaz.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Ban, ShieldCheck, PlayCircle, Eye, CreditCard, ScrollText,
  BadgeCheck, Loader2, Mail, Phone, Receipt, ShieldCheck as ShieldLock,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import {
  toTurkishAdminError, fetchUserPaymentSummaryAdmin,
  type AdminUserPaymentSummary,
} from '../../services/adminService';
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
  /** Profil Aynası bir alan kaydettiğinde liste tazelemesi için. */
  onUpdated?: () => void;
}

interface AuditRow {
  id: string;
  action: string;
  admin_name: string;
  created_at: string;
}

const fmtMoney = (n: number) => `${Number(n).toLocaleString('tr-TR')}₺`;

/** Ödeme türü etiketleri — ham anahtar yerine sade Türkçe. */
const ODEME_TURU: Record<string, string> = {
  BOOKING: 'Saha kaporası',
  MATCH_JOIN: 'Maça katılım',
  MATCH: 'Maç ödemesi',
  SERVICE: 'Kaleci/hakem hizmeti',
  TOP_UP: 'Cüzdan yükleme (eski)',
};

const ODEME_DURUMU: Record<string, string> = {
  PAID: 'Tahsil edildi',
  CAPTURED: 'Tahsil edildi',
  BLOCKED: 'Güvencede',
  PENDING: 'Beklemede',
  FAILED: 'Başarısız',
  REFUNDED: 'İade edildi',
  VOIDED: 'İptal',
};

const ODEME_DURUM_RENK: Record<string, string> = {
  PAID: 'text-green-400', CAPTURED: 'text-green-400', BLOCKED: 'text-amber-300',
  PENDING: 'text-gray-400', FAILED: 'text-red-400',
  REFUNDED: 'text-blue-300', VOIDED: 'text-gray-500',
};

export const User360Drawer: React.FC<Props> = ({ user, onClose, onBanToggle, onVerify, onGhost, onUpdated }) => {
  const { error: toastError } = useAdminToast();
  // Varsayılan sekme PROFİL: kullanıcıyı uygulamadaki hâliyle gör + düzenle (ayna).
  const [tab, setTab] = useState<'profil' | 'operasyon'>('profil');
  const [odeme, setOdeme] = useState<AdminUserPaymentSummary | null>(null);
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
      const [odemeRes, auditRes] = await Promise.all([
        // Özet RPC henüz yayınlanmamışsa drawer'ın TAMAMI çökmesin: tahsilat
        // bloğu boş görünür, profil ve işlem geçmişi çalışmaya devam eder.
        fetchUserPaymentSummaryAdmin(userId).catch(() => null),
        supabase
          .from('admin_audit_log')
          .select('id, action, admin_name, created_at')
          .eq('target_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setOdeme(odemeRes);
      setAudit((auditRes.data ?? []) as AuditRow[]);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [userId, toastError]);

  useEffect(() => {
    setRevealed({ email: null, phone: null });
    setOdeme(null);
    setAudit([]);
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

  const reliability = user.reliabilityScore ?? 100;

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
                <h2 className="text-sm font-extrabold text-white truncate">{user.name}</h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[9px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">{user.role || 'PLAYER'}</span>
                  {user.isBanned ? <StatusBadge tone="danger">BANLI</StatusBadge> : <StatusBadge tone="success">AKTİF</StatusBadge>}
                  {user.isVerified && <StatusBadge tone="info">DOĞRULANMIŞ</StatusBadge>}
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
                className={`flex-1 px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide border-b-2 transition-colors ${
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
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">İletişim (KVKK — görüntüleme kayıt altına alınır)</p>
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
                <p className={`text-lg font-extrabold font-mono ${reliability >= 80 ? 'text-green-400' : reliability >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{reliability}</p>
              </div>
              <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Maç</p>
                <p className="text-lg font-extrabold font-mono text-white">{user.matchCount ?? 0}</p>
              </div>
            </div>

            {/* ── TAHSİLAT — "bu kişiden ne kadar aldık?" ──────────────────
                Cüzdan bloğunun yerini aldı. Kaynak: payment_intents (tek
                doğruluk kaynağı); kırılım kullanıcıya değil BURAYA gösterilir. */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt size={12} /> Tahsilat
                </p>
                <span className="text-sm font-extrabold font-mono text-[#39FF14]">
                  {odeme ? fmtMoney(odeme.collected) : '—'}
                </span>
              </div>

              {loading ? (
                <p className="text-[11px] text-gray-600 py-3 text-center flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Yükleniyor…</p>
              ) : !odeme ? (
                <p className="text-[11px] text-gray-600 py-3 text-center">Tahsilat özeti okunamadı.</p>
              ) : (
                <>
                  {/* Kırılım: karttan çekilen = hizmet tabanı + kart işlem bedeli.
                      Kullanıcı ekranda tek rakam görür (kurucu kararı B4); panelin
                      görevi tam olarak bu kırılımı göstermek. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Hizmet tabanı</p>
                      <p className="text-xs font-extrabold font-mono text-white">{fmtMoney(odeme.net)}</p>
                    </div>
                    <div className="bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                      <p className="text-[9px] text-gray-500 uppercase font-bold">Kart işlem bedeli</p>
                      <p className="text-xs font-extrabold font-mono text-amber-300">{fmtMoney(odeme.card_fees)}</p>
                    </div>
                    <div className="bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                      <p className="text-[9px] text-gray-500 uppercase font-bold">İade edilen</p>
                      <p className="text-xs font-extrabold font-mono text-blue-300">{fmtMoney(odeme.refunded)}</p>
                    </div>
                    <div className="bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                      <p className="text-[9px] text-gray-500 uppercase font-bold">İşlem · Başarısız</p>
                      <p className="text-xs font-extrabold font-mono text-white">
                        {odeme.count} <span className={odeme.failed > 0 ? 'text-red-400' : 'text-gray-600'}>· {odeme.failed}</span>
                      </p>
                    </div>
                  </div>

                  {odeme.recent.length === 0 ? (
                    <p className="text-[11px] text-gray-600 py-2 text-center">Ödeme hareketi yok.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {odeme.recent.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">
                              {ODEME_TURU[r.related_entity_type ?? ''] ?? (r.related_entity_type || 'Ödeme')}
                              {r.pitch_name ? <span className="text-gray-500 font-normal"> · {r.pitch_name}</span> : null}
                            </p>
                            <p className="text-[9px] text-gray-600 font-mono">
                              {new Date(r.created_at).toLocaleString('tr-TR')}
                              {r.card_fee > 0 ? ` · taban ${fmtMoney(r.taban)} + bedel ${fmtMoney(r.card_fee)}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-extrabold font-mono text-white">{fmtMoney(r.amount)}</p>
                            <p className={`text-[9px] font-bold ${ODEME_DURUM_RENK[r.status] ?? 'text-gray-500'}`}>
                              {ODEME_DURUMU[r.status] ?? r.status}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── KAYITLI KARTLAR (maskeli) ───────────────────────────────────
                Kart numarası ve CVV OYNA'da HİÇ saklanmaz; sağlayıcı token'ı da
                bu ekrana gelmez (özet fonksiyonu onu dışarıda bırakır). Burada
                görünen tek şey markanın adı, son 4 hane ve son kullanma. */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={12} /> Kayıtlı Kartlar
              </p>
              {!odeme || odeme.cards.length === 0 ? (
                <p className="text-[11px] text-gray-600 py-2 text-center">Kayıtlı kart yok.</p>
              ) : odeme.cards.map((c, i) => (
                <div key={`${c.last4}-${i}`} className="flex items-center justify-between gap-2 bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2">
                  <span className="text-[11px] font-bold text-white font-mono">
                    {c.brand || 'KART'} ···· {c.last4 ?? '????'}
                  </span>
                  <span className="text-[9px] text-gray-600 font-mono">
                    {c.exp_month && c.exp_year ? `${String(c.exp_month).padStart(2, '0')}/${String(c.exp_year).slice(-2)}` : '—'}
                    {c.is_default ? ' · varsayılan' : ''}
                  </span>
                </div>
              ))}
              <p className="text-[9px] text-gray-600 leading-relaxed flex items-start gap-1.5 pt-1">
                <ShieldLock size={10} className="shrink-0 mt-0.5" />
                Kart numarası ve güvenlik kodu OYNA'da saklanmaz; ödeme sağlayıcısındaki
                token bu ekrana da gelmez. Görünen bilgi maskelidir.
              </p>
            </div>

            {/* Bu kullanıcıya dokunan admin işlemleri */}
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
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
          {/* Aksiyon barından "Düzenle" KALKTI: düzenleme tek yerde, Profil
              (Uygulama Aynası) sekmesinde — kullanıcı kararı "üç düzenleme yeri
              tek yerde birleşsin". */}
          <div className="shrink-0 p-4 border-t border-white/10 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => onBanToggle(user)} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[9px] font-extrabold uppercase border ${user.isBanned ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              {user.isBanned ? <ShieldCheck size={14} /> : <Ban size={14} />}
              {user.isBanned ? 'Unban' : 'Banla'}
            </button>
            <button type="button" disabled={user.isVerified} onClick={() => onVerify(user)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[9px] font-extrabold uppercase disabled:opacity-30">
              <BadgeCheck size={14} /> Doğrula
            </button>
            <button type="button" onClick={() => onGhost(user)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-[9px] font-extrabold uppercase">
              <PlayCircle size={14} /> Ghost
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
};
