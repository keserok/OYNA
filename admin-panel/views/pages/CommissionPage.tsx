import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { PageShell } from '../components/PageShell';
import { PitchAgreementsPanel } from '../components/PitchAgreementsPanel';
import { useAdminToast } from '../context/AdminToastContext';
import {
  Percent, Plus, RefreshCw, Edit2, Check, X, HeartPulse,
  AlertTriangle, AlertOctagon, Info, Link2,
} from 'lucide-react';
import {
  fetchCommissionHealthAdmin, toTurkishAdminError, type CommissionHealth,
} from '../../services/adminService';

interface CommissionConfigRow {
  id: string;
  scope: 'GLOBAL' | 'PITCH' | 'SERVICE_GK' | 'SERVICE_REF' | 'MATCH';
  scope_id: string | null;
  model: 'MODEL_A' | 'MODEL_B';
  rate_pct: number;
  markup_pct: number;
  /** Sabit markup (₺). 0'dan büyükse yüzde yerine BU geçerlidir. */
  markup_amount: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type EditRow = Partial<CommissionConfigRow> & { _isNew?: boolean };

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL:      'Global (Varsayılan)',
  PITCH:       'Saha Özel',
  SERVICE_GK:  'Kaleci Hizmeti',
  SERVICE_REF: 'Hakem Hizmeti',
  MATCH:       'Maç Özel',
};

const MODEL_LABELS: Record<string, string> = {
  MODEL_A: 'Model A (% Kapora)',
  MODEL_B: 'Model B (% + Markup)',
};

export const CommissionPage: React.FC = () => {
  const [rows, setRows]       = useState<CommissionConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [saving, setSaving]   = useState(false);
  // Uygulama bağlantısı sağlık raporu (admin_commission_health): etkin kural,
  // yapılandırma sorunları ve "para gerçekten bu kurallardan mı aktı" kanıtı.
  const [health, setHealth]   = useState<CommissionHealth | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, healthRes] = await Promise.all([
      supabase.from('commission_config').select('*').order('created_at'),
      fetchCommissionHealthAdmin().then((h) => ({ h, e: null as string | null })).catch((e) => ({ h: null, e: toTurkishAdminError(e) })),
    ]);
    if (error) { toastError(error.message); }
    else { setRows(data as CommissionConfigRow[]); }
    setHealth(healthRes.h);
    setHealthErr(healthRes.e);
    setLoading(false);
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  /** Çift aktif GLOBAL Model A çözücüyü belirsizleştirir — kayıttan önce uyar. */
  const wouldDuplicateGlobal = (candidate: { scope?: string; model?: string; is_active?: boolean; id?: string }) =>
    candidate.scope === 'GLOBAL' && (candidate.model ?? 'MODEL_A') === 'MODEL_A' && (candidate.is_active ?? true)
    && rows.some((r) => r.id !== candidate.id && r.scope === 'GLOBAL' && r.model === 'MODEL_A' && r.is_active);

  const handleSave = async () => {
    if (!editRow) return;
    if (wouldDuplicateGlobal(editRow) && !window.confirm(
      'DİKKAT: Zaten aktif bir GLOBAL Model A kuralı var. İkincisini aktifleştirmek '
      + 'çözücüyü belirsizleştirir (uygulama rastgele birini seçer). Yine de kaydedilsin mi?',
    )) return;
    setSaving(true);
    try {
      if (editRow._isNew) {
        const { error } = await supabase.from('commission_config').insert({
          scope:      editRow.scope ?? 'GLOBAL',
          scope_id:   editRow.scope_id ?? null,
          model:      editRow.model ?? 'MODEL_A',
          rate_pct:   Number(editRow.rate_pct ?? 0),
          markup_pct: Number(editRow.markup_pct ?? 0),
          markup_amount: Number(editRow.markup_amount ?? 0),
          is_active:  editRow.is_active ?? true,
          notes:      editRow.notes ?? null,
        });
        if (error) throw error;
        success('Komisyon kuralı eklendi.');
      } else {
        const { error } = await supabase.from('commission_config').update({
          model:      editRow.model,
          rate_pct:   Number(editRow.rate_pct ?? 0),
          markup_pct: Number(editRow.markup_pct ?? 0),
          markup_amount: Number(editRow.markup_amount ?? 0),
          is_active:  editRow.is_active,
          notes:      editRow.notes ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', editRow.id!);
        if (error) throw error;
        success('Komisyon kuralı güncellendi.');
      }
      setEditRow(null);
      void load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: CommissionConfigRow) => {
    if (!row.is_active && wouldDuplicateGlobal({ ...row, is_active: true }) && !window.confirm(
      'DİKKAT: Zaten aktif bir GLOBAL Model A kuralı var. Bunu da aktifleştirmek '
      + 'çözücüyü belirsizleştirir. Yine de etkinleştirilsin mi?',
    )) return;
    const { error } = await supabase.from('commission_config')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { toastError(error.message); }
    else { success(row.is_active ? 'Devre dışı bırakıldı.' : 'Etkinleştirildi.'); void load(); }
  };

  const ISSUE_ICON = { CRITICAL: AlertOctagon, WARN: AlertTriangle, INFO: Info } as const;
  const ISSUE_CLS = {
    CRITICAL: 'text-red-300 bg-red-500/[0.07] border-red-500/30',
    WARN: 'text-amber-300 bg-amber-500/[0.06] border-amber-500/25',
    INFO: 'text-gray-400 bg-white/[0.03] border-white/10',
  } as const;

  return (
    <PageShell
      title="Komisyon Yönetimi"
      description="Çok seviyeli komisyon oranlarını yapılandırın"
      icon={<Percent size={20} />}
      actions={
        <div className="flex gap-2">
          <button onClick={() => void load()}
            className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          <button
            onClick={() => setEditRow({ _isNew: true, scope: 'GLOBAL', model: 'MODEL_A', rate_pct: 15, markup_pct: 0, markup_amount: 0, is_active: true })}
            className="h-9 px-3 rounded-xl bg-[#39FF14] text-black font-bold flex items-center gap-2 text-sm hover:brightness-110 active:scale-95 transition-all">
            <Plus size={14} /> Yeni Kural
          </button>
        </div>
      }
    >
      {/* ── UYGULAMA BAĞLANTISI (sağlık) — panel ↔ para yolu kanıtı ──────────
          Etkin kural sunucudaki _pitch_agreement çözüm sırasının birebir
          aynısıyla bulunur; sorunlar gerçek yapılandırma hatalarıdır. */}
      <div className="mb-6 bg-[#10151C] border border-white/[0.06] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <HeartPulse size={13} className={health && health.sorunlar.some((s) => s.level === 'CRITICAL') ? 'text-red-400' : 'text-[#39FF14]'} />
            Uygulama Bağlantısı
          </p>
          {health && health.sorunlar.length === 0 && (
            <span className="text-[10px] font-extrabold text-green-400 bg-green-500/10 border border-green-500/25 rounded-lg px-2 py-1 flex items-center gap-1">
              <Link2 size={11} /> BAĞLANTI SAĞLIKLI — kurallar para yoluna birebir işliyor
            </span>
          )}
        </div>

        {healthErr ? (
          <p className="text-[11px] text-gray-500">{healthErr}</p>
        ) : !health ? (
          <p className="text-[11px] text-gray-600">Sağlık raporu yükleniyor…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-black/25 border border-[#39FF14]/20 rounded-xl p-3.5">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Uygulamanın Kullandığı Oran</p>
                <p className="text-lg font-extrabold text-[#39FF14] font-mono mt-0.5">%{health.etkinGlobal.rate_pct}</p>
                <p className="text-[9px] text-gray-600">
                  {health.etkinGlobal.kaynak === 'SUNUCU_VARSAYILANI'
                    ? '⚠ panel kuralı DEĞİL — sunucu varsayılanı'
                    : `+ fiyat farkı: ${health.etkinGlobal.markup_amount > 0 ? `${health.etkinGlobal.markup_amount}₺ sabit` : `%${health.etkinGlobal.markup_pct}`}`}
                </p>
              </div>
              <div className="bg-black/25 border border-white/[0.05] rounded-xl p-3.5">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Komisyon Geliri (30g)</p>
                <p className="text-lg font-extrabold text-white font-mono mt-0.5">₺{health.kanit.intentKomisyonToplam.toLocaleString('tr-TR')}</p>
                <p className="text-[9px] text-gray-600">{health.kanit.intentKomisyonluAdet} komisyonlu tahsilat</p>
              </div>
              <div className="bg-black/25 border border-white/[0.05] rounded-xl p-3.5">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Orana Bağlanan Maç (30g)</p>
                <p className="text-lg font-extrabold text-white font-mono mt-0.5">{health.kanit.macDondurulmusAdet}</p>
                <p className="text-[9px] text-gray-600">kurulurken oran maça donduruldu</p>
              </div>
              <div className="bg-black/25 border border-white/[0.05] rounded-xl p-3.5">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Saha Anlaşması</p>
                <p className="text-lg font-extrabold text-white font-mono mt-0.5">{health.sahaKuralAdet}</p>
                <p className="text-[9px] text-gray-600">
                  model dağılımı (30g): {Object.entries(health.kanit.macModelDagilimi).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}
                </p>
              </div>
            </div>

            {health.sorunlar.length > 0 && (
              <div className="space-y-1.5">
                {health.sorunlar.map((s) => {
                  const Icon = ISSUE_ICON[s.level] ?? Info;
                  return (
                    <div key={s.code} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${ISSUE_CLS[s.level] ?? ISSUE_CLS.INFO}`}>
                      <Icon size={13} className="shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-relaxed"><b className="font-mono text-[9px] uppercase mr-1.5">{s.code}</b>{s.message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Global rate highlight */}
      {(() => {
        const global = rows.find(r => r.scope === 'GLOBAL' && r.is_active);
        return global ? (
          <div className="mb-6 bg-[#1a2000] border border-[#39FF14]/20 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-[#39FF14]/10 rounded-2xl flex items-center justify-center shrink-0">
              <span className="text-[#39FF14] font-extrabold text-xl">%{global.rate_pct}</span>
            </div>
            <div>
              <p className="text-white font-extrabold">Aktif Global Oran</p>
              <p className="text-gray-400 text-sm">{MODEL_LABELS[global.model]} · {global.notes ?? ''}</p>
            </div>
          </div>
        ) : null;
      })()}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              {['Kapsam','Model','Oran (%)','Fiyat farkı','Notlar','Durum',''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-600">Komisyon kuralı yok.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${!row.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-bold text-white whitespace-nowrap">{SCOPE_LABELS[row.scope] ?? row.scope}</td>
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{MODEL_LABELS[row.model] ?? row.model}</td>
                <td className="px-4 py-3 text-[#39FF14] font-extrabold">{row.rate_pct}%</td>
                <td className="px-4 py-3 text-gray-400">
                  {row.markup_amount > 0
                    ? `${Math.round(row.markup_amount).toLocaleString('tr-TR')} ₺`
                    : row.markup_pct > 0 ? `${row.markup_pct}%` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{row.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${row.is_active ? 'text-green-400 bg-green-400/10' : 'text-gray-500 bg-gray-500/10'}`}>
                    {row.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditRow({ ...row })}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleToggleActive(row)}
                      className={`p-1.5 rounded-lg transition-colors ${row.is_active ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'}`}>
                      {row.is_active ? <X size={13} /> : <Check size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Saha bazlı anlaşmalar — saha adıyla, örnek hesapla ve iptal saatiyle.
          Üstteki ham tablo kapsam kurallarının tamamını gösterir; buradaki
          bölüm ise günlük işi (hangi sahayla kaça anlaştık) tek ekranda tutar. */}
      <PitchAgreementsPanel />

      {/* Edit modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="bg-[#161B22] border border-white/10 rounded-[28px] p-6 w-full max-w-md space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-extrabold text-lg">{editRow._isNew ? 'Yeni Komisyon Kuralı' : 'Kuralı Düzenle'}</h2>
              <button onClick={() => setEditRow(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>

            {editRow._isNew && (
              <Field label="Kapsam">
                <select value={editRow.scope ?? 'GLOBAL'} onChange={e => setEditRow(r => ({ ...r!, scope: e.target.value as CommissionConfigRow['scope'], scope_id: e.target.value === 'GLOBAL' ? null : r!.scope_id }))}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            )}

            {/* Kapsam ID: belirli saha/maç/sağlayıcı override'ı (boş = kapsam geneli varsayılan) */}
            {editRow._isNew && editRow.scope && editRow.scope !== 'GLOBAL' && (
              <Field label={`Kapsam ID (opsiyonel — ${SCOPE_LABELS[editRow.scope] ?? editRow.scope})`}>
                <input type="text"
                  value={editRow.scope_id ?? ''}
                  onChange={e => setEditRow(r => ({ ...r!, scope_id: e.target.value.trim() || null }))}
                  placeholder="Saha/Maç/Sağlayıcı UUID — boş bırakılırsa kapsam geneli geçerli"
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-mono" />
              </Field>
            )}

            <Field label="Model">
              <select value={editRow.model ?? 'MODEL_A'} onChange={e => setEditRow(r => ({ ...r!, model: e.target.value as 'MODEL_A' | 'MODEL_B' }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm">
                {Object.entries(MODEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>

            <Field label="Komisyon Oranı (%)">
              <input type="number" min="0" max="100" step="0.5"
                value={editRow.rate_pct ?? 0}
                onChange={e => setEditRow(r => ({ ...r!, rate_pct: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Field>

            <Field label="Fiyat farkı — yüzde (%)">
              <input type="number" min="0" max="200" step="0.5"
                value={editRow.markup_pct ?? 0}
                onChange={e => setEditRow(r => ({ ...r!, markup_pct: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Field>

            {/* Sabit tutar doluysa yüzde YOK SAYILIR (sunucudaki _markup_tutari). */}
            <Field label="Fiyat farkı — sabit tutar (₺) · doluysa yüzdeyi ezer">
              <input type="number" min="0" step="10"
                value={editRow.markup_amount ?? 0}
                onChange={e => setEditRow(r => ({ ...r!, markup_amount: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Field>

            <Field label="Notlar (opsiyonel)">
              <input type="text"
                value={editRow.notes ?? ''}
                onChange={e => setEditRow(r => ({ ...r!, notes: e.target.value }))}
                placeholder="Açıklama..."
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-white text-sm" />
            </Field>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={editRow.is_active ?? true}
                onChange={e => setEditRow(r => ({ ...r!, is_active: e.target.checked }))}
                className="accent-[#39FF14] w-4 h-4" />
              <span className="text-white text-sm font-bold">Aktif</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditRow(null)}
                className="flex-1 py-3 bg-white/5 text-gray-400 font-bold rounded-xl hover:bg-white/10 transition-colors text-sm">
                İptal
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-[#39FF14] text-black font-extrabold rounded-xl hover:brightness-110 active:scale-95 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] text-gray-500 font-extrabold uppercase tracking-wider block mb-2">{label}</label>
    {children}
  </div>
);
