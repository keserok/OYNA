/**
 * Silme Kuyruğu (Karar #20): bekleyen hesap silme talepleri panelden görünür ve
 * yönetilir. Bekleme süresi app_config.account_deletion_wait_days (tek kaynak).
 * Uygun (süresi dolmuş) talepler işlenebilir; işleme MODERATOR yetkisi ister,
 * aktif rezervasyon/ödeme guard'ı ve audit sunucuda zorlanır.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { UserX, RefreshCw, Trash2, Clock, ShieldCheck, Undo2 } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchDeletionQueue, processAccountDeletion, cancelAccountDeletion, toTurkishAdminError,
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

  const runCancel = async (row: DeletionQueueRow) => {
    setBusy(row.user_id);
    try {
      await cancelAccountDeletion(row.user_id);
      success('Silme talebi iptal edildi, kullanıcı bilgilendirildi');
      setConfirm(null);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(null);
    }
  };

  const askCancel = (row: DeletionQueueRow) => {
    setConfirm({
      title: 'Silme Talebini İptal Et',
      description: `${row.full_name || row.user_id.slice(0, 8)} kullanıcısının hesap silme talebi geri alınacak. Hesap aktif kalmaya devam eder ve kullanıcıya bildirim gider.`,
      impactText: 'Kullanıcı hesabını korumak istediğini bildirdiyse veya yanlış talep açıldıysa kullanılır.',
      actionType: 'BAN_USER',
      targetId: row.user_id,
      targetName: row.full_name || row.user_id.slice(0, 8),
      onConfirm: () => void runCancel(row),
      onCancel: () => setConfirm(null),
    });
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
            onClick={() => askCancel(r)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase bg-sky-500/10 text-sky-300 border-sky-500/25 disabled:opacity-40"
            title="Silme talebini iptal et (hesap korunur)"
          >
            <Undo2 size={11} /> İptal Et
          </button>
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
          işaretlenir. <b>Anonimleştirme</b> kişisel veriyi (uygulama <i>ve</i> kimlik doğrulama kaydındaki gerçek
          e-posta dahil) kaldırıp istatistik bütünlüğünü korur; <b>kalıcı silme</b> kaydı tamamen kaldırır.
          Aktif rezervasyon/ödeme veya admin hesabıysa işlem reddedilir. <b>İptal Et</b> ile talep geri alınabilir.
          Sistem Parametreleri’nden <i>“Otomatik Hesap Silme İşleme”</i> açılırsa süresi dolan talepler her gün
          otomatik anonimleştirilir.
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
