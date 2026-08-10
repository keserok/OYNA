import React, { useEffect, useState, useCallback } from 'react';
import { Bell, MessageSquare, Lock, X } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchNotificationTemplates,
  sendTemplateTestAdmin,
  updateNotificationTemplate,
  fetchBildirimSeviyeleri,
  setBildirimSeviyesi,
  toTurkishAdminError,
  type NotificationTemplateRow,
  type BildirimSeviyeRow,
} from '../../services/adminService';

// ─── S2 — Üç mod (4 Ağustos 2026) ────────────────────────────────────────────
// Oyuncu tarafında artık 41 ayrı düğme yok, üç mod var. Bu ekran hangi
// bildirimin hangi modda gideceğini belirler.
const SEVIYE_ETIKET: Record<number, { ad: string; aciklama: string; renk: string }> = {
  1: { ad: 'Zorunlu',       aciklama: 'Her modda gider — kapatılamaz',        renk: 'text-amber-300 bg-amber-500/15 border-amber-500/25' },
  2: { ad: 'Önemli',        aciklama: '"Önemli olanlar" ve "Hepsi" modunda',  renk: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/25' },
  3: { ad: 'İsteğe bağlı',  aciklama: 'Yalnız "Hepsi" modunda',               renk: 'text-gray-300 bg-white/8 border-white/15' },
};

const CATEGORY_LABELS: Record<string, string> = {
  MAC: 'Maç Bildirimleri',
  REZERVASYON: 'Rezervasyon',
  ODEME: 'Ödeme',
  HESAP: 'Hesap',
  SOSYAL: 'Sosyal',
  FAIRPLAY: 'Fair-Play (Güvenilirlik)',
  SISTEM: 'Sistem',
  PAZARLAMA: 'Pazarlama',
  GENEL: 'Genel',
};

/**
 * Canlı önizleme için örnek değişken değerleri. Bildirim metinlerindeki
 * {{degisken}} kalıplarını gerçeğe yakın örneklerle değiştirir.
 */
const PREVIEW_SAMPLES: Record<string, string> = {
  player_name: 'Ahmet Y.',
  match_date: 'Cmt 20:00',
  match_time: '20:00',
  field_name: 'Yeşilçim Halısaha',
  team_name: 'Şimşekler',
  amount: '120 ₺',
  city: 'Ordu',
  opponent_name: 'Mehmet K.',
  rating: '4.8',
};

/**
 * Bir metindeki {{degisken}} kalıplarını örnek değerlerle değiştirir.
 * Bilinmeyen değişkenler olduğu gibi (kalıp halinde) bırakılır.
 */
export function replacePreviewVars(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return PREVIEW_SAMPLES[key] ?? whole;
  });
}

interface EditDraft {
  id: string;
  type_key: string;
  label_tr: string;
  title_tr: string;
  body_tr: string;
  title_en: string;
  body_en: string;
}

/**
 * Bildirim Şablonları — kurucunun, yazılımcıya ihtiyaç duymadan uygulamadan
 * gönderilen bildirimlerin METİNLERİNİ (Türkçe/İngilizce başlık ve gövde)
 * düzenleyebildiği ekran. Zorunluluk ve ses gibi DAVRANIŞ alanları kilitlidir.
 */
export const NotificationTemplatesPage: React.FC<{ onRefresh?: () => Promise<void> }> = () => {
  const { success, error: toastError } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplateRow[]>([]);
  // type_key -> seviye/kullanım bilgisi (admin_bildirim_seviyeleri)
  const [seviyeler, setSeviyeler] = useState<Record<string, BildirimSeviyeRow>>({});
  const [seviyeYazan, setSeviyeYazan] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // Şablonu önizleme örnek değişkenleriyle KENDİ hesabına gerçek bildirim
  // olarak gönderir — metin değişikliği yayınlanmadan cihazda test edilir.
  const sendTest = async (row: NotificationTemplateRow) => {
    setTesting(row.type_key);
    try {
      await sendTemplateTestAdmin(row.type_key, PREVIEW_SAMPLES);
      success(`Test bildirimi gönderildi (${row.label_tr}) — kendi hesabının Bildirimler'inde gör`);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setTesting(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, sev] = await Promise.all([
        fetchNotificationTemplates(),
        // Seviye/kullanım bilgisi okunamazsa ekran yine açılsın — metin
        // düzenleme bu bilgiye bağlı değil.
        fetchBildirimSeviyeleri().catch(() => [] as BildirimSeviyeRow[]),
      ]);
      setTemplates(rows);
      setSeviyeler(Object.fromEntries(sev.map((r) => [r.type_key, r])));
    } catch (err) {
      setLoadError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seviyeDegistir = async (typeKey: string, yeni: number) => {
    const onceki = seviyeler[typeKey];
    if (!onceki || onceki.mod_seviyesi === yeni) return;
    setSeviyeYazan(typeKey);
    // iyimser güncelleme
    setSeviyeler((p) => ({ ...p, [typeKey]: { ...onceki, mod_seviyesi: yeni } }));
    try {
      await setBildirimSeviyesi(typeKey, yeni);
      success(`"${onceki.label_tr}" artık ${SEVIYE_ETIKET[yeni].ad.toLowerCase()} seviyede`);
    } catch (err) {
      setSeviyeler((p) => ({ ...p, [typeKey]: onceki })); // geri al
      toastError(toTurkishAdminError(err));
    } finally {
      setSeviyeYazan(null);
    }
  };

  const openEditor = (row: NotificationTemplateRow) => {
    setDraft({
      id: row.id,
      type_key: row.type_key,
      label_tr: row.label_tr,
      title_tr: row.title_tr,
      body_tr: row.body_tr,
      title_en: row.title_en ?? '',
      body_en: row.body_en ?? '',
    });
  };

  const save = async () => {
    if (!draft) return;
    const labelTr = draft.label_tr.trim();
    const titleTr = draft.title_tr.trim();
    const bodyTr = draft.body_tr.trim();
    if (!labelTr || !titleTr || !bodyTr) {
      toastError('Etiket, başlık ve gövde (Türkçe) boş bırakılamaz');
      return;
    }
    const titleEn = draft.title_en.trim() || null;
    const bodyEn = draft.body_en.trim() || null;
    setSaving(true);
    try {
      await updateNotificationTemplate(draft.id, labelTr, titleTr, bodyTr, titleEn, bodyEn);
      setTemplates((prev) =>
        prev.map((r) =>
          r.id === draft.id
            ? { ...r, label_tr: labelTr, title_tr: titleTr, body_tr: bodyTr, title_en: titleEn, body_en: bodyEn }
            : r,
        ),
      );
      success(`${labelTr} kaydedildi`);
      setDraft(null);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSaving(false);
    }
  };

  const grouped = templates.reduce<Record<string, NotificationTemplateRow[]>>((acc, r) => {
    const cat = r.category ?? 'GENEL';
    (acc[cat] ||= []).push(r);
    return acc;
  }, {});

  return (
    <PageShell route="NOTIFICATION_TEMPLATES" icon={<Bell size={20} />}>
      {loading ? (
        <PageLoadingSkeleton />
      ) : loadError ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-400 font-bold mb-1">Bildirim şablonları yüklenemedi</p>
          <p className="text-xs text-gray-500 mb-4">{loadError}</p>
          <button
            onClick={() => void load()}
            className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20"
          >
            Tekrar dene
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-2xl p-4">
            <p className="text-[11px] text-cyan-300/80 leading-relaxed">
              Buradan bildirim <b>METİNLERİNİ</b> değiştirebilirsin; davranış (zorunluluk / ses) kilitlidir.
              Metinlerdeki <code className="text-cyan-200 bg-black/30 px-1 rounded">{'{{degisken}}'}</code> kalıpları
              gönderim sırasında gerçek değerlerle doldurulur — önizlemede örnek değerlerle gösterilir.
            </p>
          </div>

          {templates.length === 0 ? (
            <div className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-10 text-center">
              <MessageSquare size={28} className="text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400 font-bold">Henüz bildirim şablonu yok</p>
            </div>
          ) : (
            Object.entries(grouped).map(([cat, rows]) => (
              <section key={cat} className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-4">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rows.map((row) => (
                    <div key={row.id} className="bg-black/30 border border-white/[0.06] rounded-xl p-4 flex flex-col">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{row.label_tr}</p>
                          <span className="inline-block mt-1 text-[9px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                            {row.type_key}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                          {row.is_mandatory && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded text-amber-400 bg-amber-500/15">
                              Zorunlu
                            </span>
                          )}
                          {!row.can_user_disable && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded text-red-400 bg-red-500/20">
                              <Lock size={9} /> Kapatılamaz
                            </span>
                          )}
                          {/* S4b: 51 şablonun 36'sı bugüne kadar HİÇ gönderilmedi.
                              Panelde düzenlediğin metnin gerçekten kullanılıp
                              kullanılmadığı belli olsun diye bu rozet var. */}
                          {seviyeler[row.type_key] && !seviyeler[row.type_key].uretiliyor && (
                            <span
                              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded text-gray-400 bg-white/8 border border-white/10"
                              title="Bu tür bugüne kadar hiç gönderilmedi — metni değiştirmek şu an bir şeyi değiştirmez"
                            >
                              Kullanılmıyor
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-black/40 border border-white/[0.06] rounded-lg p-3 mb-3 space-y-1">
                        <p className="text-[11px] font-bold text-white leading-snug">
                          {replacePreviewVars(row.title_tr)}
                        </p>
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                          {replacePreviewVars(row.body_tr)}
                        </p>
                      </div>

                      {/* S2: hangi modda gideceği — üç seviye */}
                      {seviyeler[row.type_key] && (
                        <div className="mb-3">
                          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5">
                            Hangi modda gitsin?
                          </p>
                          <div className="flex gap-1">
                            {[1, 2, 3].map((sv) => {
                              const secili = seviyeler[row.type_key].mod_seviyesi === sv;
                              const kilitli = row.is_mandatory && sv !== 1;
                              return (
                                <button
                                  key={sv}
                                  type="button"
                                  disabled={seviyeYazan === row.type_key || kilitli}
                                  onClick={() => void seviyeDegistir(row.type_key, sv)}
                                  title={
                                    kilitli
                                      ? 'Bu bildirim zorunlu — seviyesi düşürülemez'
                                      : SEVIYE_ETIKET[sv].aciklama
                                  }
                                  className={`flex-1 px-1.5 py-1 rounded-md text-[9px] font-extrabold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    secili ? SEVIYE_ETIKET[sv].renk : 'text-gray-400 bg-transparent border-white/10 hover:bg-white/5'
                                  }`}
                                >
                                  {SEVIYE_ETIKET[sv].ad}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditor(row)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-gray-200 transition-colors"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          disabled={testing === row.type_key}
                          onClick={() => void sendTest(row)}
                          className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-cyan-300 transition-colors disabled:opacity-40"
                          title="Şablonu örnek değişkenlerle KENDİ hesabına bildirim olarak gönderir"
                        >
                          {testing === row.type_key ? 'Gönderiliyor…' : 'Kendime Test Gönder'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="bg-surface-1 border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-surface-1 border-b border-white/[0.06]">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-white truncate">Şablonu Düzenle</h2>
                <p className="text-[10px] font-mono text-gray-500 mt-0.5">{draft.type_key}</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setDraft(null)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 disabled:opacity-40"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <Field
                label="Etiket (panelde görünen ad)"
                value={draft.label_tr}
                onChange={(v) => setDraft({ ...draft, label_tr: v })}
              />
              <Field
                label="Başlık (Türkçe)"
                value={draft.title_tr}
                onChange={(v) => setDraft({ ...draft, title_tr: v })}
              />
              <Field
                label="Gövde (Türkçe)"
                value={draft.body_tr}
                onChange={(v) => setDraft({ ...draft, body_tr: v })}
                textarea
              />
              <Field
                label="Başlık (İngilizce — opsiyonel)"
                value={draft.title_en}
                onChange={(v) => setDraft({ ...draft, title_en: v })}
              />
              <Field
                label="Gövde (İngilizce — opsiyonel)"
                value={draft.body_en}
                onChange={(v) => setDraft({ ...draft, body_en: v })}
                textarea
              />

              <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-xl p-3">
                <p className="text-[9px] font-extrabold text-cyan-300/70 uppercase tracking-wider mb-2">Canlı Önizleme</p>
                <div className="bg-black/40 border border-white/[0.06] rounded-lg p-3 space-y-1">
                  <p className="text-[11px] font-bold text-white leading-snug">
                    {replacePreviewVars(draft.title_tr) || 'Başlık önizlemesi'}
                  </p>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {replacePreviewVars(draft.body_tr) || 'Gövde önizlemesi'}
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 px-5 py-4 bg-surface-1 border-t border-white/[0.06]">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDraft(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300 disabled:opacity-40"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-extrabold hover:bg-green-500/30 disabled:opacity-40"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, textarea }) => (
  <div>
    <label className="text-[11px] font-bold text-gray-400 block mb-1.5">{label}</label>
    {textarea ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500/40 focus:outline-none transition-colors resize-y leading-relaxed"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-cyan-500/40 focus:outline-none transition-colors"
      />
    )}
  </div>
);
