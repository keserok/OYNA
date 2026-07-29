import React, { useCallback, useEffect, useState } from 'react';
import { Building2, KeyRound, Mail, RefreshCw, Save, Send, Shield, Dices } from 'lucide-react';
import {
  listOwnerAccountsForAdmin,
  planTierLabel,
  accountStatusLabel,
  type OwnerAccountAdminRow,
} from '../../services/ownerAccountService';
import { updateOwnerAccountAdmin, manageOwnerCredentials, toTurkishAdminError, type OwnerCredentialAction } from '../services/adminService';
import { useAdminToast } from './context/AdminToastContext';
import type { OwnerAccount, OwnerEntitlements } from '../../types';

/** Paylaşılabilir geçici şifre üretir (okunması kolay, 12 karakter). */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const PLAN_OPTIONS: OwnerAccount['plan_tier'][] = ['starter', 'pro', 'enterprise'];
const STATUS_OPTIONS: OwnerAccount['status'][] = [
  'trialing', 'active', 'past_due', 'suspended', 'cancelled',
];

const OwnerAccountsTab: React.FC = () => {
  const { success, error: toastError } = useAdminToast();
  const [rows, setRows] = useState<OwnerAccountAdminRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, {
    plan_tier: OwnerAccount['plan_tier'];
    status: OwnerAccount['status'];
    entitlements: OwnerEntitlements;
  }>>({});
  // Hesap güvenliği (e-posta/şifre) taslakları — satır başına.
  const [credDrafts, setCredDrafts] = useState<Record<string, { email: string; password: string; open: boolean }>>({});
  const [credBusy, setCredBusy] = useState<{ userId: string; action: OwnerCredentialAction } | null>(null);

  const setCredDraft = (userId: string, patch: Partial<{ email: string; password: string; open: boolean }>) =>
    setCredDrafts((prev) => ({
      ...prev,
      [userId]: { email: '', password: '', open: false, ...prev[userId], ...patch },
    }));

  const runCredAction = async (
    userId: string,
    action: OwnerCredentialAction,
    payload: { email?: string; password?: string },
    okMessage: string,
  ) => {
    setCredBusy({ userId, action });
    try {
      await manageOwnerCredentials({ userId, action, ...payload });
      success(okMessage);
      if (action === 'set_email') {
        setCredDraft(userId, { email: '' });
        await load();
      }
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setCredBusy(null);
    }
  };

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
      toastError(toTurkishAdminError(err));
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
      await updateOwnerAccountAdmin(userId, {
        plan_tier: draft.plan_tier,
        status: draft.status,
        entitlements: draft.entitlements,
      });
      success('SaaS hesabı güncellendi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
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
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
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
                    <p className="text-sm font-extrabold text-white">
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
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-extrabold rounded-xl hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Save size={14} />
                  {savingId === row.owner_user_id ? 'Kaydediliyor…' : 'Kaydet'}
                </button>

                {/* ── Hesap Güvenliği: e-posta değiştirme, şifre belirleme, sıfırlama kodu ── */}
                {(() => {
                  const cred = credDrafts[row.owner_user_id] ?? { email: '', password: '', open: false };
                  const busyFor = (a: OwnerCredentialAction) =>
                    credBusy?.userId === row.owner_user_id && credBusy.action === a;
                  const anyBusy = credBusy?.userId === row.owner_user_id;
                  return (
                    <div className="border-t border-white/5 pt-3">
                      <button
                        type="button"
                        onClick={() => setCredDraft(row.owner_user_id, { open: !cred.open })}
                        className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400 hover:text-white"
                      >
                        <KeyRound size={13} className="text-amber-400" />
                        Hesap Güvenliği (E-posta / Şifre)
                        <span className="text-gray-600">{cred.open ? '▾' : '▸'}</span>
                      </button>

                      {cred.open && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* E-posta değiştir */}
                          <div className="space-y-2 bg-[#0A0E14] border border-white/5 rounded-xl p-3">
                            <span className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1.5">
                              <Mail size={11} /> E-postayı Değiştir
                            </span>
                            <input
                              type="email"
                              value={cred.email}
                              onChange={(e) => setCredDraft(row.owner_user_id, { email: e.target.value })}
                              placeholder={row.owner_email ?? 'yeni@eposta.com'}
                              className="w-full bg-[#161B22] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                            />
                            <button
                              type="button"
                              disabled={anyBusy || !cred.email.trim()}
                              onClick={() =>
                                runCredAction(
                                  row.owner_user_id,
                                  'set_email',
                                  { email: cred.email.trim() },
                                  'E-posta güncellendi — yeni adres giriş için hemen geçerli',
                                )
                              }
                              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-extrabold rounded-lg disabled:opacity-40"
                            >
                              {busyFor('set_email') ? 'Güncelleniyor…' : 'E-postayı Güncelle'}
                            </button>
                          </div>

                          {/* Yeni şifre belirle */}
                          <div className="space-y-2 bg-[#0A0E14] border border-white/5 rounded-xl p-3">
                            <span className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1.5">
                              <KeyRound size={11} /> Yeni Şifre Belirle
                            </span>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={cred.password}
                                onChange={(e) => setCredDraft(row.owner_user_id, { password: e.target.value })}
                                placeholder="En az 8 karakter"
                                className="flex-1 min-w-0 bg-[#161B22] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono"
                              />
                              <button
                                type="button"
                                title="Rastgele şifre üret"
                                onClick={() => setCredDraft(row.owner_user_id, { password: generateTempPassword() })}
                                className="shrink-0 px-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                              >
                                <Dices size={14} />
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={anyBusy || cred.password.length < 8}
                              onClick={() =>
                                runCredAction(
                                  row.owner_user_id,
                                  'set_password',
                                  { password: cred.password },
                                  'Şifre güncellendi — yeni şifreyi tesise güvenli bir kanaldan iletin',
                                )
                              }
                              className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-extrabold rounded-lg disabled:opacity-40"
                            >
                              {busyFor('set_password') ? 'Kaydediliyor…' : 'Şifreyi Kaydet'}
                            </button>
                          </div>

                          {/* Sıfırlama kodu gönder */}
                          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 bg-[#0A0E14] border border-white/5 rounded-xl p-3">
                            <p className="text-[11px] text-gray-500">
                              Ya da tesise kendi şifresini belirlemesi için <span className="text-gray-300 font-bold">{row.owner_email ?? 'kayıtlı e-postasına'}</span> sıfırlama kodu gönderin.
                            </p>
                            <button
                              type="button"
                              disabled={anyBusy || !row.owner_email}
                              onClick={() =>
                                runCredAction(
                                  row.owner_user_id,
                                  'send_reset_code',
                                  {},
                                  'Sıfırlama kodu e-postaya gönderildi',
                                )
                              }
                              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[11px] font-extrabold rounded-lg disabled:opacity-40"
                            >
                              <Send size={12} />
                              {busyFor('send_reset_code') ? 'Gönderiliyor…' : 'Sıfırlama Kodu Gönder'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OwnerAccountsTab;
