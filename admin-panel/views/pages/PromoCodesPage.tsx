import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { createPromoCode, fetchPromoCodes, deletePromoCode, setPromoCodeActive, toTurkishAdminError, type PromoCodeRow } from '../../services/adminService';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { Zap, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface PromoCodesPageProps {
  onRefresh?: () => Promise<void>;
}

export const PromoCodesPage: React.FC<PromoCodesPageProps> = ({ onRefresh }) => {
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [discountValue, setDiscountValue] = useState('15');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [description, setDescription] = useState('');
  const [deleteRow, setDeleteRow] = useState<PromoCodeRow | null>(null);
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPromoCodes());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!code.trim()) return;
    try {
      await createPromoCode({
        code: code.trim(),
        discountType,
        discountValue: Number(discountValue),
        description: description || undefined,
      });
      setShowForm(false);
      setCode('');
      setDescription('');
      success('Promo kodu oluşturuldu');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  const refresh = async () => {
    await load();
    if (onRefresh) await onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    try {
      await deletePromoCode(deleteRow.id);
      success(`"${deleteRow.code}" silindi`);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setDeleteRow(null);
    }
  };

  const handleToggle = async (row: PromoCodeRow) => {
    try {
      await setPromoCodeActive(row.id, !row.is_active);
      success(row.is_active ? 'Kod pasifleştirildi' : 'Kod aktifleştirildi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
  };

  return (
    <>
      <PageShell
        route="PROMO_CODES"
        icon={<Zap size={20} />}
        actions={
          <ModuleCrudBar
            moduleKey="promo_codes"
            addLabel="Yeni Kod"
            onAdd={() => setShowForm(!showForm)}
            onRefresh={refresh}
          />
        }
      >
        {showForm && (
          <div className="bg-surface-1/60 border border-white/[0.06] rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KOD" className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-white font-mono text-sm focus:outline-none focus:border-purple-500/40" />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FIXED')} className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-white text-sm">
              <option value="PERCENT">Yüzde</option>
              <option value="FIXED">Sabit ₺</option>
            </select>
            <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="Değer" className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-white text-sm" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama (opsiyonel)" className="h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-white text-sm" />
            <button onClick={() => void handleCreate()} className="md:col-span-2 h-10 bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors">Oluştur</button>
          </div>
        )}

        <DataTable
          columns={[
            { header: 'Kod', render: (r: PromoCodeRow) => <span className="font-mono font-bold text-purple-400">{r.code}</span> },
            { header: 'İndirim', render: (r: PromoCodeRow) => <span className="text-sm">{r.discount_type === 'PERCENT' ? `%${r.discount_value}` : `₺${r.discount_value}`}</span> },
            { header: 'Kullanım', render: (r: PromoCodeRow) => <span className="text-sm text-gray-400">{r.redemption_count}{r.max_redemptions ? `/${r.max_redemptions}` : ''}</span> },
            { header: 'Segment', render: (r: PromoCodeRow) => <span className="text-[11px] text-gray-500">{r.target_segment || '—'}</span> },
            { header: 'Durum', render: (r: PromoCodeRow) => (
              <StatusBadge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'Aktif' : 'Pasif'}</StatusBadge>
            )},
            { header: '', render: (r: PromoCodeRow) => (
              <div className="flex gap-1 justify-end">
                <button onClick={() => void handleToggle(r)} className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white" title={r.is_active ? 'Pasifleştir' : 'Aktifleştir'}>
                  {r.is_active ? <ToggleRight size={14} className="text-green-400" /> : <ToggleLeft size={14} />}
                </button>
                <button onClick={() => setDeleteRow(r)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 size={14} /></button>
              </div>
            )},
          ]}
          data={rows}
          loading={loading}
          emptyMessage="Henüz promo kodu yok"
        />
      </PageShell>

      <ConfirmDialog
        open={!!deleteRow}
        title="Promo kodunu sil"
        description={deleteRow ? `"${deleteRow.code}" kalıcı olarak silinecek.` : ''}
        confirmLabel="Sil"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteRow(null)}
      />
    </>
  );
};
