import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Check, X, ShieldCheck, LogOut, Mail } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { toTurkishError } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { useConfirmSheet } from '../components/useConfirmSheet';
import { OwnerCenteredModal } from './OwnerModalFrame';

interface Props {
  onClose: () => void;
}

interface PolicyCheck {
  label: string;
  ok: boolean;
}

function evaluatePassword(pw: string): PolicyCheck[] {
  return [
    { label: 'En az 8 karakter', ok: pw.length >= 8 },
    { label: 'En az bir harf', ok: /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(pw) },
    { label: 'En az bir rakam', ok: /\d/.test(pw) },
    { label: 'En az bir büyük harf', ok: /[A-ZÇĞİÖŞÜ]/.test(pw) },
  ];
}

export const OwnerSecurityModal: React.FC<Props> = ({ onClose }) => {
  const notify = useOwnerToast();
  const { confirm: askConfirm, confirmElement } = useConfirmSheet();
  const [email, setEmail] = useState<string>('');
  const [lastSignIn, setLastSignIn] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '');
      const last = data.user?.last_sign_in_at;
      if (last) {
        setLastSignIn(
          new Date(last).toLocaleString('tr-TR', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      }
    });
  }, []);

  const checks = useMemo(() => evaluatePassword(password), [password]);
  const policyOk = checks.every((c) => c.ok);
  const matchOk = password.length > 0 && password === confirm;

  const handleSave = async () => {
    if (!currentPassword) {
      notify('Mevcut şifrenizi girin.', 'error');
      return;
    }
    if (!policyOk) {
      notify('Yeni şifre güvenlik kurallarını karşılamıyor.', 'error');
      return;
    }
    if (!matchOk) {
      notify('Yeni şifreler eşleşmiyor.', 'error');
      return;
    }
    if (!email) {
      notify('Hesap bilgisi okunamadı, tekrar deneyin.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      // 1) Mevcut şifreyi doğrula (oturumu ele geçiren biri eski şifreyi bilmeden değiştiremesin).
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyErr) {
        notify('Mevcut şifre yanlış.', 'error');
        return;
      }
      // 2) Yeni şifreyi uygula.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      notify('Şifreniz güncellendi.', 'success');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOutAll = async () => {
    if (!(await askConfirm({ title: 'Tüm oturumları kapat?', message: 'Tüm cihazlardaki oturumlar kapatılacak; yeniden giriş yapmanız gerekir.', confirmLabel: 'Kapat', destructive: true }))) return;
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      notify('Tüm cihazlardan çıkış yapıldı.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setSigningOutAll(false);
    }
  };

  return (
    <OwnerCenteredModal title="Güvenlik & Şifre" onClose={onClose}>
      <div className="space-y-5">
        {/* Hesap / oturum bilgisi */}
        <div className="p-4 bg-[#0A0E14] rounded-2xl border border-white/5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <Mail size={15} className="text-blue-400" />
            <span className="font-bold truncate">{email || '—'}</span>
          </div>
          {lastSignIn && (
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Son giriş: {lastSignIn}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Mevcut Şifre</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40"
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Yeni Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40"
            placeholder="••••••••"
          />
          {password.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {checks.map((c) => (
                <div key={c.label} className={`flex items-center gap-1.5 text-[10px] font-bold ${c.ok ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {c.ok ? <Check size={12} /> : <X size={12} />}
                  {c.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Yeni Şifre (Tekrar)</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={`w-full bg-[#0A0E14] border rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/40 ${
              confirm.length > 0 && !matchOk ? 'border-red-500/40' : 'border-white/5'
            }`}
            placeholder="••••••••"
          />
          {confirm.length > 0 && !matchOk && (
            <p className="text-[10px] font-bold text-red-400">Şifreler eşleşmiyor.</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !currentPassword || !policyOk || !matchOk}
          className="w-full py-4 bg-blue-600 text-white font-extrabold rounded-2xl hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Lock size={18} /> {isSaving ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
        </button>

        <div className="pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleSignOutAll}
            disabled={signingOutAll}
            className="w-full py-3 bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm rounded-2xl hover:bg-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> {signingOutAll ? 'Çıkış yapılıyor…' : 'Tüm Cihazlardan Çıkış Yap'}
          </button>
          <p className="text-[10px] text-gray-500 mt-2 text-center">
            Şüpheli bir giriş fark ettiyseniz tüm oturumları kapatın.
          </p>
        </div>
      </div>
      {confirmElement}
    </OwnerCenteredModal>
  );
};
