/**
 * VELİ ONAYLARI (20 Ağu 2026 yeniden tasarımı — kurucu isteği):
 * "Onay isteyen kullanıcı ve veli YAN YANA görünsün; kullanıcı bilgilerinin
 * görüntülenebildiği basit bir onay ekranı olsun."
 *
 * Yapı:
 *   · Bekleyen küçükler  → çift kart (solda ÇOCUK, sağda VELİ ya da "veli
 *     bekleniyor" boşluğu) + tek tuş ONAYLA (veli seç + zorunlu sebep).
 *   · Verilmiş muvafakatler → aynı çift kart düzeni + GERİ AL + detay drawer
 *     (iki profil karşılıklı; e-posta/telefon KVKK gereği maskeli, audit'li
 *     "göster" ile açılır — admin_reveal_pii her görüntülemeyi loglar).
 *
 * Yetki modeli (kurucu kararı, 20 Ağu): panel onay VEREBİLİR ve GERİ ALABİLİR.
 * Panel onayı veli beyanı değildir — kayda 'ADMIN-PANEL-v1' işareti düşer ve
 * bu ekran o kayıtları "Panelden verildi" rozetiyle ayırt eder.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Baby, RefreshCw, ShieldCheck, Clock, Eye, Link2, Loader2, Search,
  ShieldOff, UserCheck, UserRound, X, Copy,
} from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { supabase } from '../../../supabaseClient';
import { maskEmail, maskPhone } from '../../utils/pii';
import { ageFromBirthdate } from '../../../shared/profilePresentation';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  fetchGuardianConsents, fetchMinorsAwaitingConsent, fetchAdminProfiles,
  fetchProfileById, fetchProfileNamesAdmin,
  grantGuardianConsentAdmin, revokeGuardianConsentAdmin, toTurkishAdminError,
  GuardianConsentAdminRow, MinorAwaitingRow,
} from '../../services/adminService';
import type { AdminUser } from '../../../types';

const fmtDate = (s: string | null): string => (s ? new Date(s).toLocaleDateString('tr-TR') : '—');

const DURUM_TR: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'demo' }> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  PENDING: { label: 'Bekliyor', tone: 'warning' },
  REVOKED: { label: 'Geri Alındı', tone: 'danger' },
  NONE: { label: 'Onay Yok', tone: 'demo' },
};

const durumBadge = (status: string): React.ReactNode => {
  const d = DURUM_TR[status] ?? { label: status, tone: 'demo' as const };
  return <StatusBadge tone={d.tone}>{d.label}</StatusBadge>;
};

/** Çift kartın tek yüzü: kişi özeti (çocuk ya da veli). */
const KisiYuzu: React.FC<{
  rol: 'ÇOCUK' | 'VELİ';
  name: string | null;
  sub?: string | null;
  avatarUrl?: string | null;
  empty?: string;
  accent: 'yellow' | 'green';
}> = ({ rol, name, sub, avatarUrl, empty, accent }) => {
  const ring = accent === 'yellow' ? 'border-yellow-500/25' : 'border-green-500/25';
  const chip = accent === 'yellow' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' : 'text-green-400 bg-green-500/10 border-green-500/25';
  if (!name) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
        <div className="w-9 h-9 rounded-full border border-dashed border-white/15 flex items-center justify-center text-gray-600 shrink-0">
          <UserRound size={15} />
        </div>
        <div className="min-w-0">
          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${chip}`}>{rol}</span>
          <p className="text-[11px] text-gray-600 italic mt-1 truncate">{empty || 'Henüz bağlanmadı'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-black/30 ${ring}`}>
      <div
        className="w-9 h-9 rounded-full bg-cover bg-center bg-[#1f2937] border border-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      >
        {!avatarUrl && (name.charAt(0) || '?')}
      </div>
      <div className="min-w-0">
        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${chip}`}>{rol}</span>
        <p className="text-xs font-extrabold text-white truncate mt-0.5">{name}</p>
        {sub && <p className="text-[9px] text-gray-500 font-mono truncate">{sub}</p>}
      </div>
    </div>
  );
};

/** İki yüz arasındaki bağ işareti. */
const Bag: React.FC<{ aktif?: boolean }> = ({ aktif }) => (
  <div className="shrink-0 flex flex-col items-center justify-center px-1">
    <Link2 size={14} className={aktif ? 'text-green-400' : 'text-gray-600'} />
  </div>
);

// ─── Onay modali: veli seç + zorunlu sebep ──────────────────────────────────
interface OnayModalProps {
  minor: MinorAwaitingRow;
  /** Daha önce bağlı (ör. geri alınmış) veli varsa ön-seçim adayı. */
  oncekiVeliId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

const OnayModal: React.FC<OnayModalProps> = ({ minor, oncekiVeliId, onClose, onDone }) => {
  const { success, error: toastError } = useAdminToast();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const [candidates, setCandidates] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [secilen, setSecilen] = useState<AdminUser | null>(null);
  const [sebep, setSebep] = useState('');
  const [busy, setBusy] = useState(false);

  // Önceki veli varsa aday olarak baştan yüklle — destek çoğu kez aynı veliyi yeniden bağlar.
  useEffect(() => {
    if (!oncekiVeliId) return;
    void fetchProfileById(oncekiVeliId).then((p) => { if (p) setSecilen((s) => s ?? p); }).catch(() => undefined);
  }, [oncekiVeliId]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) { setCandidates([]); return; }
    let cancelled = false;
    setSearching(true);
    fetchAdminProfiles({ search: q, limit: 8, status: 'all' })
      .then(({ users }) => { if (!cancelled) setCandidates(users.filter((u) => u.id !== minor.id)); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debounced, minor.id]);

  const onayla = async () => {
    if (!secilen) return;
    setBusy(true);
    try {
      await grantGuardianConsentAdmin(minor.id, secilen.id, sebep.trim());
      success(`✅ ${minor.name} ↔ ${secilen.name} veli onayı verildi (denetime yazıldı)`);
      onDone();
      onClose();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#161B22] border border-green-500/25 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-white uppercase flex items-center gap-2"><UserCheck size={15} className="text-green-400" /> Veli Onayı Ver</h3>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              <span className="text-white font-bold">{minor.name}</span> için panelden onay veriyorsunuz.
              Bu, veli beyanının yerine geçmez; kayda <span className="font-mono text-purple-300">panelden verildi</span> işareti düşer ve denetime yazılır.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="w-7 h-7 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0"><X size={14} /></button>
        </div>

        {/* Veli seçimi */}
        <div className="space-y-2">
          <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest">Veli Hesabı (18+)</p>
          {secilen ? (
            <div className="flex items-center justify-between gap-2 bg-green-500/[0.06] border border-green-500/25 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-cover bg-center bg-[#1f2937] border border-white/10 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                     style={secilen.avatar ? { backgroundImage: `url(${secilen.avatar})` } : undefined}>
                  {!secilen.avatar && secilen.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white truncate">{secilen.name}</p>
                  <p className="text-[9px] text-gray-500 font-mono truncate">{secilen.email ? maskEmail(secilen.email) : secilen.id.slice(0, 8) + '…'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSecilen(null)} className="text-[9px] font-extrabold text-gray-500 hover:text-white uppercase shrink-0">Değiştir</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Veli adı veya e-posta ara (en az 2 harf)…"
                  className="w-full h-10 bg-black/40 border border-white/15 rounded-xl pl-9 pr-3 text-sm text-white focus:border-green-500/40 focus:outline-none"
                />
              </div>
              {searching && <p className="text-[10px] text-gray-600 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Aranıyor…</p>}
              {candidates.length > 0 && (
                <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSecilen(c)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/10 bg-black/30 hover:border-green-500/30 text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-cover bg-center bg-[#1f2937] border border-white/10 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                           style={c.avatar ? { backgroundImage: `url(${c.avatar})` } : undefined}>
                        {!c.avatar && c.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white truncate">{c.name}</p>
                        <p className="text-[9px] text-gray-500 font-mono truncate">{c.email ? maskEmail(c.email) : c.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="text-[9px] text-gray-600">Velinin reşit (18+) olduğu sunucuda da doğrulanır; reşit olmayan hesap veli seçilemez.</p>
        </div>

        {/* Zorunlu sebep */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest">Sebep (zorunlu — denetime yazılır)</p>
          <textarea
            value={sebep}
            onChange={(e) => setSebep(e.target.value)}
            rows={3}
            placeholder="örn. Veli telefonla arayıp kimlik doğrulaması yaptı — destek talebi #123"
            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-green-500/40 focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-bold">Vazgeç</button>
          <button
            type="button"
            disabled={busy || !secilen || sebep.trim().length < 5}
            onClick={() => void onayla()}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-extrabold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Onayı Ver
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Geri alma modali ───────────────────────────────────────────────────────
const GeriAlModal: React.FC<{ minorId: string; minorName: string; onClose: () => void; onDone: () => void }> = ({ minorId, minorName, onClose, onDone }) => {
  const { success, error: toastError } = useAdminToast();
  const [sebep, setSebep] = useState('');
  const [busy, setBusy] = useState(false);

  const geriAl = async () => {
    setBusy(true);
    try {
      await revokeGuardianConsentAdmin(minorId, sebep.trim());
      success(`Veli onayı geri alındı — ${minorName} sınırlı moda döndü (denetime yazıldı)`);
      onDone();
      onClose();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#161B22] border border-red-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-extrabold text-white uppercase">Veli Onayını Geri Al</h3>
          <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
            <span className="text-white font-bold">{minorName}</span> için aktif veli onayı geri alınacak;
            çocuk hesabı ödeme yapamayan sınırlı moda döner. İşlem denetime yazılır.
          </p>
        </div>
        <textarea
          value={sebep}
          onChange={(e) => setSebep(e.target.value)}
          rows={3}
          placeholder="Sebep (zorunlu — örn. veli talebi, şüpheli onay)…"
          className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-red-500/40 focus:outline-none resize-none"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-bold">Vazgeç</button>
          <button
            type="button"
            disabled={busy || sebep.trim().length < 5}
            onClick={() => void geriAl()}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />} Geri Al
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Karşılıklı profil detayı (drawer) ──────────────────────────────────────
interface DetayHedef {
  minorId: string;
  guardianId: string | null;
  consent?: GuardianConsentAdminRow | null;
}

const ProfilSutunu: React.FC<{ rol: 'ÇOCUK' | 'VELİ'; profil: AdminUser | null; loading: boolean }> = ({ rol, profil, loading }) => {
  const { error: toastError } = useAdminToast();
  const [revealed, setRevealed] = useState<{ email: string | null; phone: string | null }>({ email: null, phone: null });
  const accent = rol === 'ÇOCUK' ? 'yellow' : 'green';
  const chip = accent === 'yellow' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' : 'text-green-400 bg-green-500/10 border-green-500/25';

  useEffect(() => { setRevealed({ email: null, phone: null }); }, [profil?.id]);

  const goster = async (field: 'email' | 'phone') => {
    if (!profil) return;
    try {
      // KVKK: gerçek değer sunucudan gelir ve görüntüleme loglanır (admin_reveal_pii).
      const { data, error } = await supabase.rpc('admin_reveal_pii', { p_target_user_id: profil.id, p_field: field });
      if (error) throw error;
      setRevealed((prev) => ({ ...prev, [field]: (data as string | null) ?? '—' }));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  return (
    <div className="flex-1 min-w-0 bg-black/30 border border-white/[0.06] rounded-2xl p-4 space-y-3">
      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${chip}`}>{rol}</span>
      {loading ? (
        <p className="text-[11px] text-gray-600 py-6 text-center flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Yükleniyor…</p>
      ) : !profil ? (
        <p className="text-[11px] text-gray-600 py-6 text-center italic">Profil bulunamadı / bağlı değil.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-cover bg-center bg-[#1f2937] border border-white/10 flex items-center justify-center text-white text-sm font-bold shrink-0"
                 style={profil.avatar ? { backgroundImage: `url(${profil.avatar})` } : undefined}>
              {!profil.avatar && profil.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-white truncate">{profil.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[8px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">{profil.role}</span>
                {profil.isBanned ? <StatusBadge tone="danger">BANLI</StatusBadge> : <StatusBadge tone="success">AKTİF</StatusBadge>}
                {profil.isVerified && <StatusBadge tone="info">DOĞRULANMIŞ</StatusBadge>}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 font-mono truncate min-w-0">{revealed.email ?? (profil.email ? maskEmail(profil.email) : '—')}</span>
              {profil.email && revealed.email === null && (
                <button type="button" onClick={() => void goster('email')} className="flex items-center gap-1 text-[9px] font-bold text-gray-500 hover:text-white border border-white/10 rounded-lg px-1.5 py-0.5 shrink-0"><Eye size={10} /> Göster</button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400 font-mono truncate min-w-0">{revealed.phone ?? (profil.phone ? maskPhone(profil.phone) : '—')}</span>
              {revealed.phone === null && (
                <button type="button" onClick={() => void goster('phone')} className="flex items-center gap-1 text-[9px] font-bold text-gray-500 hover:text-white border border-white/10 rounded-lg px-1.5 py-0.5 shrink-0"><Eye size={10} /> Göster</button>
              )}
            </div>
            <p className="text-[9px] text-gray-600 pt-1">
              Üyelik: {profil.joinDate ? new Date(profil.joinDate).toLocaleDateString('tr-TR') : '—'} · Maç: {profil.matchCount ?? 0} · ID: <span className="font-mono">{profil.id.slice(0, 8)}…</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

const CiftDetayDrawer: React.FC<{ hedef: DetayHedef; onClose: () => void; onGeriAl: (minorId: string, name: string) => void }> = ({ hedef, onClose, onGeriAl }) => {
  const [minor, setMinor] = useState<AdminUser | null>(null);
  const [guardian, setGuardian] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchProfileById(hedef.minorId).catch(() => null),
      hedef.guardianId ? fetchProfileById(hedef.guardianId).catch(() => null) : Promise.resolve(null),
    ]).then(([m, g]) => {
      if (cancelled) return;
      setMinor(m);
      setGuardian(g);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hedef.minorId, hedef.guardianId]);

  const c = hedef.consent;
  const panelden = c?.consent_text_version === 'ADMIN-PANEL-v1';

  return (
    <div className="fixed inset-0 z-[245] flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-[10px] text-gray-500 font-mono uppercase">Veli Onayı Detayı</p>
            <h2 className="text-sm font-extrabold text-white">Çocuk ↔ Veli</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {/* İki profil YAN YANA */}
          <div className="flex gap-3 items-stretch">
            <ProfilSutunu rol="ÇOCUK" profil={minor} loading={loading} />
            <Bag aktif={c?.status === 'ACTIVE'} />
            <ProfilSutunu rol="VELİ" profil={guardian} loading={loading} />
          </div>

          {/* Muvafakat meta */}
          {c && (
            <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Muvafakat Kaydı</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <p className="text-gray-500">Durum</p><div>{durumBadge(c.status)}</div>
                <p className="text-gray-500">Onay tarihi</p><p className="text-gray-300 font-mono">{fmtDate(c.consented_at)}</p>
                <p className="text-gray-500">Geri alma</p><p className="text-gray-300 font-mono">{c.revoked_at ? fmtDate(c.revoked_at) : '—'}</p>
                <p className="text-gray-500">Çocuk doğum tarihi</p><p className="text-gray-300 font-mono">{fmtDate(c.minor_birthdate)}</p>
                <p className="text-gray-500">Kaynak</p>
                <p className={panelden ? 'text-purple-300 font-bold' : 'text-gray-300'}>
                  {panelden ? 'Panelden verildi (veli beyanı değil)' : `Veli beyanı (${c.consent_text_version || 'sürüm ?'})`}
                </p>
              </div>
              <p className="text-[9px] text-gray-600 leading-relaxed pt-1">
                T.C. kimlik bilgileri hash'li saklanır ve panelde HİÇ gösterilmez.
              </p>
            </div>
          )}

          {c?.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => onGeriAl(hedef.minorId, c.minor_full_name)}
              className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-extrabold uppercase tracking-widest hover:bg-red-500/20 flex items-center justify-center gap-2"
            >
              <ShieldOff size={14} /> Onayı Geri Al
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sayfa ──────────────────────────────────────────────────────────────────
export const GuardianConsentsPage: React.FC = () => {
  const { success } = useAdminToast();
  const [consents, setConsents] = useState<GuardianConsentAdminRow[]>([]);
  const [awaiting, setAwaiting] = useState<MinorAwaitingRow[]>([]);
  const [veliAdlari, setVeliAdlari] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [onayModal, setOnayModal] = useState<MinorAwaitingRow | null>(null);
  const [geriAlModal, setGeriAlModal] = useState<{ minorId: string; minorName: string } | null>(null);
  const [detay, setDetay] = useState<DetayHedef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [c, a] = await Promise.all([fetchGuardianConsents(), fetchMinorsAwaitingConsent()]);
      setConsents(c);
      setAwaiting(a);
      // Bekleyenlerde önceden bağlanmış (geri alınmış) veli adlarını tek seferde çöz.
      const veliIds = a.map((m) => m.guardian_user_id).filter((x): x is string => !!x);
      if (veliIds.length) {
        setVeliAdlari(await fetchProfileNamesAdmin(veliIds).catch(() => ({})));
      } else {
        setVeliAdlari({});
      }
    } catch (e) {
      setErr((e as Error).message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => consents.filter((c) => c.status === 'ACTIVE').length, [consents]);

  const kodKopyala = async (kod: string) => {
    try {
      await navigator.clipboard.writeText(kod);
      success(`Bağlantı kodu kopyalandı: ${kod}`);
    } catch {
      /* pano izni yoksa sessiz geç — kod zaten ekranda */
    }
  };

  const yasEtiketi = (m: MinorAwaitingRow): string => {
    const yas = ageFromBirthdate(m.birthdate);
    if (yas != null) return `${yas} yaş`;
    return m.age_range ? `${m.age_range} yaş aralığı` : 'yaş bilinmiyor';
  };

  return (
    <PageShell
      route="GUARDIAN_CONSENTS"
      icon={<Baby size={18} />}
      actions={
        <button onClick={() => void load()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      }
      stats={
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Aktif Onay" value={activeCount} unit="onay" color="#22c55e" />
          <StatCard label="Bekleyen Küçük" value={awaiting.length} unit="kullanıcı" color="#eab308" />
          <StatCard label="Toplam Kayıt" value={consents.length} unit="muvafakat" color="#3b82f6" />
        </div>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3">{err}</div>}

      {/* ── Bekleyen küçükler: ÇOCUK ↔ VELİ yan yana + tek tuş onay ── */}
      <section className="mb-8">
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Clock size={14} className="text-yellow-400" /> Veli Onayı Bekleyenler
        </h3>
        {awaiting.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0D1117] px-4 py-8 text-center text-gray-500 text-sm">
            Bekleyen küçük kullanıcı yok.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {awaiting.map((m) => {
              const oncekiVeliAdi = m.guardian_user_id ? veliAdlari[m.guardian_user_id] : null;
              return (
                <div key={m.id} className="rounded-2xl border border-yellow-500/15 bg-[#0D1117] p-3.5 space-y-3">
                  <div className="flex items-stretch gap-2">
                    <KisiYuzu
                      rol="ÇOCUK"
                      name={m.name}
                      sub={`${yasEtiketi(m)} · kayıt ${fmtDate(m.created_at)}`}
                      avatarUrl={m.avatar_url}
                      accent="yellow"
                    />
                    <Bag />
                    <KisiYuzu
                      rol="VELİ"
                      name={oncekiVeliAdi ?? null}
                      sub={oncekiVeliAdi ? 'önceki bağ (geri alınmış)' : undefined}
                      empty="Veli bekleniyor"
                      accent="green"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {durumBadge(m.guardian_consent_status)}
                      {m.guardian_link_code && (
                        <button
                          type="button"
                          onClick={() => void kodKopyala(m.guardian_link_code!)}
                          title="Velinin uygulamada gireceği bağlantı kodu — kopyala"
                          className="flex items-center gap-1.5 text-[10px] font-extrabold font-mono text-gray-300 bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10"
                        >
                          <Copy size={10} /> KOD: {m.guardian_link_code}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDetay({ minorId: m.id, guardianId: m.guardian_user_id })}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-extrabold text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 uppercase"
                      >
                        <Eye size={11} /> Bilgiler
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnayModal(m)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-extrabold text-white bg-green-600 hover:bg-green-500 rounded-lg uppercase"
                      >
                        <UserCheck size={12} /> Onayla
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Verilmiş muvafakatler: çift kart + geri al + detay ── */}
      <section>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <ShieldCheck size={14} className="text-green-400" /> Verilmiş Veli Muvafakatleri
          <span className="text-[10px] text-gray-600 normal-case font-normal">(T.C. bilgileri hash'li; panelde gösterilmez)</span>
        </h3>
        {consents.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0D1117] px-4 py-8 text-center text-gray-500 text-sm">
            Kayıtlı muvafakat yok.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {consents.map((c) => {
              const panelden = c.consent_text_version === 'ADMIN-PANEL-v1';
              return (
                <div key={c.id} className={`rounded-2xl border bg-[#0D1117] p-3.5 space-y-3 ${c.status === 'ACTIVE' ? 'border-green-500/15' : 'border-white/10'}`}>
                  <div className="flex items-stretch gap-2">
                    <KisiYuzu
                      rol="ÇOCUK"
                      name={c.minor_full_name}
                      sub={`doğum ${fmtDate(c.minor_birthdate)}`}
                      accent="yellow"
                    />
                    <Bag aktif={c.status === 'ACTIVE'} />
                    <KisiYuzu
                      rol="VELİ"
                      name={c.guardian_full_name}
                      sub={`onay ${fmtDate(c.consented_at)}`}
                      accent="green"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {durumBadge(c.status)}
                      {panelden && (
                        <span className="text-[9px] font-extrabold text-purple-300 bg-purple-500/10 border border-purple-500/25 px-1.5 py-0.5 rounded uppercase">Panelden verildi</span>
                      )}
                      {c.revoked_at && <span className="text-[9px] text-gray-600 font-mono">geri alma {fmtDate(c.revoked_at)}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDetay({ minorId: c.minor_user_id, guardianId: c.guardian_user_id, consent: c })}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-extrabold text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 uppercase"
                      >
                        <Eye size={11} /> Bilgiler
                      </button>
                      {c.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => setGeriAlModal({ minorId: c.minor_user_id, minorName: c.minor_full_name })}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-extrabold text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 uppercase"
                        >
                          <ShieldOff size={11} /> Geri Al
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-600 flex items-center gap-1.5">
          <ShieldOff size={12} /> Panel onayı veli beyanının yerine geçmez; kayda "panelden verildi" işareti düşer ve her işlem denetime yazılır.
        </p>
      </section>

      {onayModal && (
        <OnayModal
          minor={onayModal}
          oncekiVeliId={onayModal.guardian_user_id}
          onClose={() => setOnayModal(null)}
          onDone={() => void load()}
        />
      )}
      {geriAlModal && (
        <GeriAlModal
          minorId={geriAlModal.minorId}
          minorName={geriAlModal.minorName}
          onClose={() => setGeriAlModal(null)}
          onDone={() => { setDetay(null); void load(); }}
        />
      )}
      {detay && (
        <CiftDetayDrawer
          hedef={detay}
          onClose={() => setDetay(null)}
          onGeriAl={(minorId, name) => setGeriAlModal({ minorId, minorName: name })}
        />
      )}
    </PageShell>
  );
};

export default GuardianConsentsPage;
