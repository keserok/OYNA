/**
 * KAMPANYALAR (20 Ağu 2026 yeniden tasarımı — kurucu isteği: "fazla boş ve
 * anlamsız duruyordu, gelişmiş bir modal yapalım").
 *
 * Sayfa artık bir KOKPİT: son kampanyaların özeti + zengin geçmiş. Oluşturma
 * işi "Yeni Kampanya" modalına taşındı:
 *   · Hedef segment + CANLI kişi sayısı
 *   · Başlık/mesaj karakter sayaçları (push kesme sınırlarıyla) + hızlı emoji
 *   · Telefon kilit ekranı PUSH ÖNİZLEMESİ — gönderilen bildirim nasıl
 *     görünecekse öyle
 *   · Büyük kitle güvenlik barajı: 250+ kişiye gönderim "GÖNDER" yazmadan
 *     yayınlanmaz (yanlış tuş bütün kullanıcıya bildirim atamaz)
 *   · Simülasyon/gerçek push durumu her adımda görünür
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  broadcastNotification,
  fetchSegmentPreview,
  fetchAppConfig,
  fetchBroadcastCampaigns,
  toTurkishAdminError,
  type BroadcastSegment,
  type BroadcastCampaignRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import {
  Megaphone, Send, Users, History, Smartphone, FlaskConical, Plus, X, Loader2,
  ShieldAlert, Shield, Scale, Sparkles, Clock,
} from 'lucide-react';

const SEGMENTS = [
  { id: 'ALL', label: 'Tüm Kullanıcılar', desc: 'Platformdaki herkes', icon: Users },
  { id: 'OWNER', label: 'Saha Sahipleri', desc: 'Tesis hesapları', icon: Megaphone },
  { id: 'NEW_USERS', label: 'Yeni Üyeler', desc: 'Son 30 günde katılanlar', icon: Sparkles },
  { id: 'GOALKEEPER', label: 'Kaleciler', desc: 'Hizmet veren kaleciler', icon: Shield },
  { id: 'REFEREE', label: 'Hakemler', desc: 'Hizmet veren hakemler', icon: Scale },
] as const;

const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s.label]));

// iOS/Android kilit ekranında kırpılmadan görünen yaklaşık sınırlar.
const TITLE_SOFT_LIMIT = 40;
const BODY_SOFT_LIMIT = 150;
// Bu kişi sayısının üstünde yazılı onay istenir — tek yanlış tıkla herkese gitmesin.
const CONFIRM_THRESHOLD = 250;

const EMOJIS = ['⚽', '🔥', '🎉', '📣', '💚', '⏰', '🏆', '🎁'] as const;

// ─── Yeni Kampanya modalı ───────────────────────────────────────────────────
interface ComposerProps {
  pushLive: boolean | null;
  onClose: () => void;
  onSent: () => void;
}

const CampaignComposerModal: React.FC<ComposerProps> = ({ pushLive, onClose, onSent }) => {
  const { success, error: toastError } = useAdminToast();
  const [segment, setSegment] = useState<BroadcastSegment>('ALL');
  const [count, setCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    fetchSegmentPreview(segment)
      .then((n) => { if (!cancelled) setCount(n); })
      .catch(() => { if (!cancelled) setCount(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [segment]);

  const needsTypedConfirm = (count ?? 0) >= CONFIRM_THRESHOLD;
  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending
    && (!needsTypedConfirm || confirmText.trim().toUpperCase() === 'GÖNDER');

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const sent = await broadcastNotification(title.trim(), body.trim(), segment);
      success(`📣 ${sent} kullanıcıya gönderildi${pushLive ? '' : ' (simülasyon: yalnız uygulama içi)'}`);
      onSent();
      onClose();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSending(false);
    }
  };

  const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[250] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#10151C] border border-pink-500/20 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 bg-[#10151C]/95 backdrop-blur border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <Megaphone size={15} className="text-pink-400" /> Yeni Kampanya
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {pushLive
                ? 'Gerçek push AÇIK — bildirim telefonlara gider.'
                : 'Simülasyon modu — bildirim yalnız uygulama içinde görünür, telefona push gitmez.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-[1fr_320px] gap-5 p-6">
          {/* ── Sol: hedef + içerik ── */}
          <div className="space-y-5 min-w-0">
            <section>
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">1 · Hedef Kitle</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEGMENTS.map((s) => {
                  const Icon = s.icon;
                  const active = segment === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSegment(s.id)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                        active ? 'bg-pink-500/10 border-pink-500/40 text-white' : 'bg-black/25 border-white/[0.06] text-gray-400 hover:border-white/15'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-pink-400' : 'text-gray-600'} />
                      <span className="min-w-0">
                        <span className="block text-xs font-extrabold truncate">{s.label}</span>
                        <span className="block text-[9px] text-gray-500">{s.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest">2 · İçerik</p>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Başlık</label>
                  <span className={`text-[9px] font-mono ${title.length > TITLE_SOFT_LIMIT ? 'text-amber-400' : 'text-gray-600'}`}>
                    {title.length}/{TITLE_SOFT_LIMIT}
                  </span>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="örn. Hafta sonu maçları açıldı ⚽"
                  className="w-full h-11 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-pink-500/40"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mesaj</label>
                  <span className={`text-[9px] font-mono ${body.length > BODY_SOFT_LIMIT ? 'text-amber-400' : 'text-gray-600'}`}>
                    {body.length}/{BODY_SOFT_LIMIT}
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder="Kampanya mesajın — kısa, net, tek eylem çağrısı."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-pink-500/40"
                />
                {(title.length > TITLE_SOFT_LIMIT || body.length > BODY_SOFT_LIMIT) && (
                  <p className="text-[9px] text-amber-400/90 mt-1">
                    Sınırı aşan kısım bazı telefonlarda "…" ile kırpılır — önizlemeden kontrol et.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-bold text-gray-600 uppercase mr-1">Hızlı ekle:</span>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setBody((b) => (b + (b.endsWith(' ') || b === '' ? '' : ' ') + e))}
                    className="w-8 h-8 rounded-lg bg-black/30 border border-white/10 hover:border-pink-500/40 text-sm"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">3 · Gönderim</p>
              {needsTypedConfirm && (
                <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-xl p-3 mb-3">
                  <p className="text-[10px] text-amber-300 font-bold flex items-center gap-1.5 mb-2">
                    <ShieldAlert size={12} /> {count?.toLocaleString('tr-TR')} kişiye gidecek — onaylamak için <span className="font-mono">GÖNDER</span> yaz
                  </p>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="GÖNDER"
                    className="w-full h-9 bg-black/40 border border-amber-500/30 rounded-lg px-3 text-sm text-white font-mono uppercase focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void send()}
                className="w-full h-12 bg-pink-600 hover:bg-pink-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Gönderiliyor…' : `Yayınla${count != null ? ` (${count.toLocaleString('tr-TR')} kişi)` : ''}`}
              </button>
            </section>
          </div>

          {/* ── Sağ: telefon push önizlemesi + kitle ── */}
          <div className="space-y-4">
            <div className="bg-black/25 border border-white/[0.06] rounded-2xl p-4 text-center">
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-1">Hedef Kitle</p>
              <p className="text-3xl font-extrabold text-pink-400 font-mono">
                {previewLoading ? '…' : count != null ? count.toLocaleString('tr-TR') : '—'}
              </p>
              <p className="text-[10px] text-gray-500">{SEGMENT_LABEL[segment]}</p>
            </div>

            {/* Kilit ekranı push mockup'ı */}
            <div>
              <p className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Smartphone size={11} /> Telefonda böyle görünür
              </p>
              <div className="rounded-[26px] border border-white/10 bg-gradient-to-b from-[#1b2436] to-[#0d1420] p-3 pt-8 relative overflow-hidden">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-black/50" />
                <p className="text-center text-[26px] font-extrabold text-white/90 mb-0.5 tabular-nums">{now}</p>
                <p className="text-center text-[10px] text-white/50 mb-4">
                  {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </p>
                <div className="bg-white/[0.14] backdrop-blur rounded-2xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-5 h-5 rounded-md bg-[#39FF14] text-black text-[9px] font-extrabold flex items-center justify-center shrink-0">O</span>
                    <span className="text-[9px] font-bold text-white/70 uppercase tracking-wide flex-1">OYNA</span>
                    <span className="text-[9px] text-white/50">şimdi</span>
                  </div>
                  <p className="text-[12px] font-bold text-white leading-snug break-words">
                    {title.trim() || 'Kampanya başlığı'}
                  </p>
                  <p className="text-[11px] text-white/80 leading-snug mt-0.5 break-words">
                    {body.trim() || 'Kampanya mesajın burada görünür.'}
                  </p>
                </div>
                {!pushLive && (
                  <p className="text-center text-[8px] text-amber-300/80 mt-2 font-bold uppercase tracking-wide">
                    Simülasyon — telefona gitmez, uygulama içinde görünür
                  </p>
                )}
              </div>
            </div>

            <p className="text-[9px] text-gray-600 leading-relaxed">
              Gönderim anlıktır ve geri alınamaz. Kampanya geçmişe kaydedilir; sayı,
              bildirim tercihi açık kullanıcılara göre hesaplanır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sayfa ──────────────────────────────────────────────────────────────────
export const CampaignsPage: React.FC<{ route?: 'NOTIFICATIONS' }> = ({ route = 'NOTIFICATIONS' }) => {
  const [pushLive, setPushLive] = useState<boolean | null>(null);
  const [history, setHistory] = useState<BroadcastCampaignRow[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchBroadcastCampaigns(30));
    } catch {
      /* geçmiş yoksa sessiz geç */
    }
  }, []);

  const loadPushStatus = useCallback(async () => {
    try {
      const cfg = await fetchAppConfig();
      const row = cfg.find((c) => c.key === 'push_live_enabled');
      setPushLive(row ? Boolean(row.value) : false);
    } catch {
      setPushLive(null);
    }
  }, []);

  useEffect(() => { void loadHistory(); void loadPushStatus(); }, [loadHistory, loadPushStatus]);

  const stats = useMemo(() => {
    const son30 = history.filter((c) => Date.now() - new Date(c.created_at).getTime() < 30 * 86400_000);
    return {
      kampanya: son30.length,
      ulasilan: son30.reduce((sum, c) => sum + (c.recipient_count || 0), 0),
      gercek: son30.filter((c) => !c.is_simulation).length,
    };
  }, [history]);

  return (
    <PageShell
      route={route}
      icon={<Megaphone size={20} />}
      actions={
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-white rounded-xl bg-pink-600 hover:bg-pink-500"
        >
          <Plus size={14} /> Yeni Kampanya
        </button>
      }
      stats={
        <div className="grid grid-cols-3 gap-3">
          {([
            ['Kampanya (30g)', String(stats.kampanya), 'text-pink-400'],
            ['Ulaşılan Kişi (30g)', stats.ulasilan.toLocaleString('tr-TR'), 'text-white'],
            ['Gerçek Push (30g)', String(stats.gercek), 'text-green-400'],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
              <p className={`text-lg font-extrabold mt-1 font-mono ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      }
    >
      {pushLive === false && (
        <div className="mb-4 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <FlaskConical size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            <b>Simülasyon modu:</b> Gönderdiğin bildirimler kullanıcılara <b>uygulama içinde</b> görünür,
            ancak telefonlara <b>gerçek push GİTMEZ</b>. Gerçek push için Sistem Parametreleri → Bildirim →
            "Gerçek Push Bildirimi Aktif" anahtarını aç.
          </p>
        </div>
      )}
      {pushLive === true && (
        <div className="mb-4 bg-green-500/[0.06] border border-green-500/20 rounded-2xl p-4 flex items-start gap-3">
          <Smartphone size={16} className="text-green-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-green-300/90 leading-relaxed">
            <b>Gerçek push AÇIK:</b> Bildirimler kullanıcıların telefonlarına gerçek push olarak gider.
          </p>
        </div>
      )}

      {/* Geçmiş */}
      <div className="max-w-4xl bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <History size={14} className="text-gray-400" />
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kampanya Geçmişi</p>
        </div>
        {history.length === 0 ? (
          <div className="py-10 text-center">
            <Megaphone size={26} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-bold">Henüz kampanya gönderilmemiş.</p>
            <p className="text-[11px] text-gray-600 mt-1">İlkini oluşturmak için sağ üstteki "Yeni Kampanya"ya bas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((c) => (
              <div key={c.id} className="bg-black/20 border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-extrabold text-white truncate min-w-0">{c.title}</p>
                  <span
                    className={`shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-md ${
                      c.is_simulation ? 'text-amber-400 bg-amber-500/10' : 'text-green-400 bg-green-500/10'
                    }`}
                  >
                    {c.is_simulation ? 'SİMÜLASYON' : 'GERÇEK PUSH'}
                  </span>
                </div>
                {c.body && <p className="text-[11px] text-gray-400 truncate mt-0.5">{c.body}</p>}
                <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1"><Users size={10} /> {SEGMENT_LABEL[c.segment] ?? c.segment} · {c.recipient_count.toLocaleString('tr-TR')} kişi</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> {new Date(c.created_at).toLocaleString('tr-TR')}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {composerOpen && (
        <CampaignComposerModal
          pushLive={pushLive}
          onClose={() => setComposerOpen(false)}
          onSent={() => { void loadHistory(); }}
        />
      )}
    </PageShell>
  );
};
