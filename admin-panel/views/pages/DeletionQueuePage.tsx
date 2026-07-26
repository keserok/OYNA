/**
 * Silme Kuyruğu (Karar #20): bekleyen hesap silme talepleri panelden görünür ve
 * yönetilir. Bekleme süresi app_config.account_deletion_wait_days (tek kaynak).
 * Uygun (süresi dolmuş) talepler işlenebilir; işleme MODERATOR yetkisi ister,
 * aktif rezervasyon/ödeme guard'ı ve audit sunucuda zorlanır.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { UserX, RefreshCw, Trash2, Clock, ShieldCheck } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { useAdminToast } from '../context/AdminToastContext';
import {
  cancelAccountDeletionAdmin, fetchDeletionQueue, processAccountDeletion, toTurkishAdminError,
  type DeletionQueueRow,
} from '../../services/adminService';

export const DeletionQueuePage: React.FC<{ onRefresh?: () => Promise<void> }> = ({ onRefresh }) => {
  const { success, error: toastError } = useAdminToast();
  const [rows, setRows] = useState<DeletionQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ActionConfirmOptions | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchDeletionQueue());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    if (onRefresh) await onRefresh();
    await load();
  };

  const runDelete = async (row: DeletionQueueRow, anonymize: boolean) => {
    setBusy(row.user_id);
    try {
      await processAccountDeletion(row.user_id, anonymize);
      success(anonymize ? 'Hesap anonimleştirildi' : 'Hesap silindi');
      setConfirm(null);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(null);
    }
  };

  // Kullanıcı vazgeçtiyse: talebi kuyruktan çıkar (hesap olduğu gibi kalır, audit'e düşer).
  const runCancelRequest = async (row: DeletionQueueRow) => {
    setBusy(row.user_id);
    try {
      await cancelAccountDeletionAdmin(row.user_id);
      success('Silme talebi iptal edildi — hesap aktif kalmaya devam eder');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(null);
    }
  };

  const askDelete = (row: DeletionQueueRow, anonymize: boolean) => {
    setConfirm({
      title: anonymize ? 'Hesabı Anonimleştir' : 'Hesabı Kalıcı Sil',
      description: `${row.full_name || row.user_id.slice(0, 8)} için silme talebi işlenecek. ${
        anonymize ? 'Kişisel veriler anonimleştirilir, istatistik bütünlüğü korunur.' : 'Kayıt kalıcı silinir.'
      }`,
      impactText: row.is_eligible
        ? 'Aktif rezervasyon/ödeme varsa sunucu işlemi reddeder. İşlem audit\'e yazılır.'
        : 'DİKKAT: Bekleme süresi henüz dolmadı. Erken işlem kullanıcı hakkını ihlal edebilir.',
      actionType: 'BAN_USER',
      targetId: row.user_id,
      targetName: row.full_name || row.user_id.slice(0, 8),
      confirmPhrase: 'SİL',
      onConfirm: () => void runDelete(row, anonymize),
      onCancel: () => setConfirm(null),
    });
  };

  const columns = [
    {
      header: 'KULLANICI',
      render: (r: DeletionQueueRow) => (
        <div>
          <div className="font-bold text-white text-xs">{r.full_name || '—'}</div>
          <div className="text-[10px] text-gray-500 font-mono">{r.email || r.user_id.slice(0, 8)}</div>
        </div>
      ),
    },
    {
      header: 'TALEP TARİHİ',
      render: (r: DeletionQueueRow) => (
        <span className="text-[11px] font-mono text-gray-400">{new Date(r.requested_at).toLocaleString('tr-TR')}</span>
      ),
    },
    {
      header: 'UYGUNLUK',
      render: (r: DeletionQueueRow) => (
        r.is_eligible
          ? <StatusBadge tone="danger">SİLİNEBİLİR</StatusBadge>
          : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
              <Clock size={11} /> {new Date(r.eligible_at).toLocaleDateString('tr-TR')}
            </span>
          )
      ),
    },
    {
      header: `BEKLEME (${rows[0]?.wait_days ?? 7}g)`,
      render: (r: DeletionQueueRow) => {
        const daysLeft = Math.max(0, Math.ceil((new Date(r.eligible_at).getTime() - Date.now()) / 86_400_000));
        return <span className="text-[11px] text-gray-400">{r.is_eligible ? 'Süre doldu' : `${daysLeft} gün kaldı`}</span>;
      },
    },
    {
      header: 'AKSİYON',
      render: (r: DeletionQueueRow) => (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy === r.user_id}
            onClick={() => askDelete(r, true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase bg-amber-500/10 text-amber-300 border-amber-500/25 disabled:opacity-40"
            title="Anonimleştir (istatistik korunur)"
          >
            <ShieldCheck size={11} /> Anonimleştir
          </button>
          <button
            type="button"
            disabled={busy === r.user_id}
            onClick={() => askDelete(r, false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase bg-red-500/10 text-red-400 border-red-500/25 disabled:opacity-40"
            title="Kalıcı sil"
          >
            <Trash2 size={11} /> Sil
          </button>
          <button
            type="button"
            disabled={busy === r.user_id}
            onClick={() => void runCancelRequest(r)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase bg-white/5 text-gray-300 border-white/15 hover:text-white disabled:opacity-40"
            title="Kullanıcı vazgeçti — talebi kuyruktan çıkar"
          >
            <RefreshCw size={11} /> Talebi İptal Et
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      route="DELETION_QUEUE"
      icon={<UserX size={20} />}
      actions={<ModuleCrudBar moduleKey={null} onRefresh={refresh} />}
    >
      <div className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-4 mb-4 flex items-center gap-3">
        <RefreshCw size={20} className="text-gray-500 shrink-0" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Kullanıcının talebiyle başlayan silme kuyruğu. Bekleme süresi dolan talepler <b>SİLİNEBİLİR</b> olarak
          işaretlenir. Anonimleştirme kişisel veriyi kaldırıp istatistik bütünlüğünü korur; kalıcı silme kaydı
          tamamen kaldırır. Aktif rezervasyon/ödeme varsa işlem reddedilir.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage="Bekleyen silme talebi yok"
        emptyDescription="Kullanıcı silme talebi oluşturduğunda burada görünür."
      />

      <ActionConfirmModal isOpen={!!confirm} options={confirm} />
    </PageShell>
  );
};
