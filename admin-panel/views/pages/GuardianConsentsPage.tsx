import React, { useCallback, useEffect, useState } from 'react';
import { Baby, RefreshCw, ShieldCheck, Clock, ShieldOff } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { StatCard } from '../components/StatCard';
import {
  fetchGuardianConsents, fetchMinorsAwaitingConsent,
  GuardianConsentAdminRow, MinorAwaitingRow,
} from '../../services/adminService';

const fmtDate = (s: string | null): string => (s ? new Date(s).toLocaleDateString('tr-TR') : '—');

const statusBadge = (status: string): React.ReactNode => {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    REVOKED: 'bg-red-500/10 text-red-400 border-red-500/20',
    NONE: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  const tr: Record<string, string> = { ACTIVE: 'Aktif', PENDING: 'Bekliyor', REVOKED: 'Geri Alındı', NONE: 'Yok' };
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${map[status] || map.NONE}`}>{tr[status] || status}</span>;
};

export const GuardianConsentsPage: React.FC = () => {
  const [consents, setConsents] = useState<GuardianConsentAdminRow[]>([]);
  const [awaiting, setAwaiting] = useState<MinorAwaitingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [c, a] = await Promise.all([fetchGuardianConsents(), fetchMinorsAwaitingConsent()]);
      setConsents(c);
      setAwaiting(a);
    } catch (e) {
      setErr((e as Error).message || 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount = consents.filter((c) => c.status === 'ACTIVE').length;

  return (
    <PageShell
      route="GUARDIAN_CONSENTS"
      icon={<Baby size={18} />}
      actions={
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition">
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

      {/* Bekleyen küçükler */}
      <section className="mb-8">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Clock size={14} className="text-yellow-400" /> Veli Onayı Bekleyen Küçükler
        </h3>
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0D1117]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400 text-[11px] uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-bold">Kullanıcı</th>
                <th className="text-left px-4 py-2.5 font-bold">Yaş Aralığı</th>
                <th className="text-left px-4 py-2.5 font-bold">Durum</th>
                <th className="text-left px-4 py-2.5 font-bold">Kayıt</th>
              </tr>
            </thead>
            <tbody>
              {awaiting.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Bekleyen küçük kullanıcı yok.</td></tr>
              ) : awaiting.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5 text-white font-semibold">{m.name}</td>
                  <td className="px-4 py-2.5 text-gray-300">{m.age_range ?? '—'}</td>
                  <td className="px-4 py-2.5">{statusBadge(m.guardian_consent_status)}</td>
                  <td className="px-4 py-2.5 text-gray-400">{fmtDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Verilmiş muvafakatler */}
      <section>
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <ShieldCheck size={14} className="text-green-400" /> Verilmiş Veli Muvafakatleri
          <span className="text-[10px] text-gray-600 normal-case font-normal">(T.C. bilgileri hash'li; panelde gösterilmez)</span>
        </h3>
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#0D1117]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400 text-[11px] uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-bold">Çocuk</th>
                <th className="text-left px-4 py-2.5 font-bold">Veli</th>
                <th className="text-left px-4 py-2.5 font-bold">Çocuk Doğum T.</th>
                <th className="text-left px-4 py-2.5 font-bold">Durum</th>
                <th className="text-left px-4 py-2.5 font-bold">Onay</th>
                <th className="text-left px-4 py-2.5 font-bold">Geri Alma</th>
              </tr>
            </thead>
            <tbody>
              {consents.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Kayıtlı muvafakat yok.</td></tr>
              ) : consents.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5 text-white font-semibold">{c.minor_full_name}</td>
                  <td className="px-4 py-2.5 text-gray-300">{c.guardian_full_name}</td>
                  <td className="px-4 py-2.5 text-gray-400">{fmtDate(c.minor_birthdate)}</td>
                  <td className="px-4 py-2.5">{statusBadge(c.status)}</td>
                  <td className="px-4 py-2.5 text-gray-400">{fmtDate(c.consented_at)}</td>
                  <td className="px-4 py-2.5 text-gray-400">{c.revoked_at ? fmtDate(c.revoked_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-gray-600 flex items-center gap-1.5">
          <ShieldOff size={12} /> Bu ekran salt okunurdur; muvafakat yalnızca veli tarafından kendi hesabından geri alınabilir.
        </p>
      </section>
    </PageShell>
  );
};

export default GuardianConsentsPage;
