import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Terminal, Mail, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';
import {
  signInAdmin,
  signOutAdmin,
  toTurkishAdminError,
  type AdminSession,
  type AdminSignInResult,
} from '../services/adminService';
import AdminMfaGate from './AdminMfaGate';

const EMAIL_KEY = 'oyna_admin_email';

interface Props {
  onAuthenticated: (session: AdminSession) => void;
  bootError?: string | null;
}

/** Şifre doğru ama henüz aal2'ye ulaşılmadı → MFA adımı için ara durum. */
interface MfaStep {
  mode: 'challenge' | 'enroll';
  session: AdminSession;
  factorId?: string;
}

const AdminAuthGate: React.FC<Props> = ({ onAuthenticated, bootError }) => {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => {
    try { return !!localStorage.getItem(EMAIL_KEY); } catch { return false; }
  });
  const [err, setErr] = useState<string | null>(bootError || null);
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState<MfaStep | null>(null);

  useEffect(() => {
    if (bootError) setErr(bootError);
  }, [bootError]);

  const persistEmail = () => {
    try {
      if (remember) localStorage.setItem(EMAIL_KEY, email.trim());
      else localStorage.removeItem(EMAIL_KEY);
    } catch { /* storage optional */ }
  };

  const handleSignInResult = (result: AdminSignInResult) => {
    if (result.status === 'authenticated') {
      persistEmail();
      onAuthenticated(result.session);
      return;
    }
    // aal2'ye ulaşılana kadar panel AÇILMAZ — MFA adımına geç.
    persistEmail();
    setMfaStep(
      result.status === 'mfa_challenge'
        ? { mode: 'challenge', session: result.session, factorId: result.factorId }
        : { mode: 'enroll', session: result.session },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const result = await signInAdmin(email.trim(), password);
      handleSignInResult(result);
    } catch (error) {
      setErr(toTurkishAdminError(error));
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } finally {
      setLoading(false);
    }
  };

  // MFA adımı aktifse doğrulama ekranını göster; aal2 olmadan panel açılmaz.
  if (mfaStep) {
    return (
      <AdminMfaGate
        mode={mfaStep.mode}
        session={mfaStep.session}
        factorId={mfaStep.factorId}
        onVerified={(session) => {
          setMfaStep(null);
          onAuthenticated(session);
        }}
        onCancel={() => {
          void signOutAdmin();
          setMfaStep(null);
          setPassword('');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-purple-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white uppercase tracking-[0.3em]">OYNA OS</h1>
          <p className="text-xs text-red-400 font-mono tracking-widest mt-2 uppercase">Platform Operasyon Merkezi</p>
        </div>

        {err && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 flex items-start gap-2 text-red-300 text-xs bg-red-900/30 border border-red-500/30 rounded-xl p-3"
            role="alert"
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{err}</span>
          </motion.div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 block">Admin E-posta</label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="admin@oyna.app"
                className="w-full h-14 bg-black/50 border-2 border-white/10 rounded-2xl pl-12 pr-4 text-white font-medium focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-password" className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 block">Şifre</label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full h-14 bg-black/50 border-2 border-white/10 rounded-2xl pl-4 pr-12 text-white font-medium focus:outline-none focus:border-red-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-white rounded-lg"
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-red-500/30"
            />
            E-postayı bu cihazda hatırla
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 mt-2 bg-gradient-to-r from-red-600 to-purple-800 rounded-2xl text-white font-extrabold text-sm tracking-widest uppercase hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Spinner size={16} color="#ffffff" glow={false} />
                Doğrulanıyor...
              </>
            ) : (
              <>Sisteme Giriş <Terminal size={16} /></>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-gray-600 font-mono mt-8 uppercase tracking-widest">
          Supabase Auth • Platform Admin Yetkisi Gerekli
        </p>
      </motion.div>
    </div>
  );
};

export default AdminAuthGate;
