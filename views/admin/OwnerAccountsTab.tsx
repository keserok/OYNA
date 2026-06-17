import React, { useCallback, useEffect, useState } from 'react';
import { Building2, RefreshCw, Save, Shield } from 'lucide-react';
import {
  listOwnerAccountsForAdmin,
  updateOwnerAccountForAdmin,
  planTierLabel,
  accountStatusLabel,
  type OwnerAccountAdminRow,
} from '../../services/ownerAccountService';
import { toTurkishError } from '../../services/pitchOwnerService';
import type { OwnerAccount, OwnerEntitlements } from '../../types';

const PLAN_OPTIONS: OwnerAccount['plan_tier'][] = ['starter', 'pro', 'enterprise'];
const STATUS_OPTIONS: OwnerAccount['status'][] = [
  'trialing', 'active', 'past_due', 'suspended', 'cancelled',
];

const OwnerAccountsTab: React.FC = () => {
  const [rows, setRows] = useState<OwnerAccountAdminRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, {
    plan_tier: OwnerAccount['plan_tier'];
    status: OwnerAccount['status'];
    entitlements: OwnerEntitlements;
  }>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listOwnerAccountsForAdmin();
      setRows(data);
      const nextDrafts: typeof drafts = {};
      data.forEach((r) => {
        nextDrafts[r.owner_user_id] = {
          plan_tier: r.plan_tier,
          status: r.status,
          entitlements: { ...r.entitlements },
        };
      });
      setDrafts(nextDrafts);
    } catch (err) {
      setError(toTurkishError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (
    userId: string,
    field: 'plan_tier' | 'status',
    value: string,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  };

  const updateEntitlement = (
    userId: string,
    key: keyof OwnerEntitlements,
    value: boolean | number,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        entitlements: { ...prev[userId].entitlements, [key]: value },
      },
    }));
  };

  const handleSave = async (userId: string) => {
    const draft = drafts[userId];
    if (!draft) return;
    setSavingId(userId);
    try {
      await updateOwnerAccountForAdmin(userId, {
        plan_tier: draft.plan_tier,
        status: draft.status,
        entitlements: draft.entitlements,
      });
      await load();
    } catch (err) {
      alert(toTurkishError(err));
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500 animate-pulse font-mono text-sm">
        SaaS hesapları yükleniyor…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Shield size={22} className="text-emerald-400" />
            Saha Sahibi SaaS Hesapları
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Plan, durum ve entitlement yönetimi — değişiklikler anında panele yansır.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/10"
        >
          <RefreshCw size={14} /> Yenile
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">Henüz owner_accounts kaydı yok.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const draft = drafts[row.owner_user_id];
            if (!draft) return null;
            return (
              <div
                key={row.id}
                className="bg-[#161B22] border border-white/5 rounded-2xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-white">
                      {row.owner_name ?? 'İsimsiz Owner'}
                    </p>
                    <p className="text-xs text-gray-500">{row.owner_email ?? row.owner_user_id}</p>
                    <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                      <Building2 size={10} /> {row.facility_count ?? 0} tesis
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={draft.plan_tier}
                      onChange={(e) => updateDraft(row.owner_user_id, 'plan_tier', e.target.value)}
                      className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p}>{planTierLabel(p)}</option>
                      ))}
                    </select>
                    <select
                      value={draft.status}
                      onChange={(e) => updateDraft(row.owner_user_id, 'status', e.target.value)}
                      className="bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{accountStatusLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    [
                      ['max_facilities', 'Max Tesis', 'number'],
                      ['max_courts', 'Max Saha', 'number'],
                      ['max_staff', 'Max Personel', 'number'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="space-y-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">{label}</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.entitlements[key]}
                        onChange={(e) =>
                          updateEntitlement(row.owner_user_id, key, parseInt(e.target.value, 10) || 0)
                        }
                        className="w-full bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </label>
                  ))}
                  {(
                    [
                      ['finance', 'Finans'],
                      ['team', 'Ekip'],
                      ['flash_deals', 'Flash Deal'],
                      ['withdrawals', 'Çekim'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-gray-300 pt-4">
                      <input
                        type="checkbox"
                        checked={draft.entitlements[key]}
                        onChange={(e) =>
                          updateEntitlement(row.owner_user_id, key, e.target.checked)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSave(row.owner_user_id)}
                  disabled={savingId === row.owner_user_id}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Save size={14} />
                  {savingId === row.owner_user_id ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OwnerAccountsTab;
