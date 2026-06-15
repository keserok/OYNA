import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Terminal, ChevronLeft, Mail, AlertTriangle } from 'lucide-react';
import { signInAdmin, toTurkishAdminError, type AdminSession } from '../../services/adminService';

interface Props {
  onAuthenticated: (session: AdminSession) => void;
  bootError?: string | null;
}

const DEV_BYPASS = import.meta.env.VITE_ADMIN_DEV_BYPASS === 'true';

const AdminAuthGate: React.FC<Props> = ({ onAuthenticated, bootError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(bootError || null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const session = await signInAdmin(email.trim(), password);
      onAuthenticated(session);
    } catch (error) {
      setErr(toTurkishAdminError(error));
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-purple-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-[0.3em]">OYNA OS</h1>
          <p className="text-xs text-red-400 font-mono tracking-widest mt-2 uppercase">Platform Operasyon Merkezi</p>
        </div>

        {err && (
          <div className="mb-4 flex items-start gap-2 text-red-300 text-xs bg-red-900/30 border border-red-500/30 rounded-xl p-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Admin E-posta</label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@oyna.app"
                className="w-full h-14 bg-black/50 border-2 border-white/10 rounded-2xl pl-12 pr-4 text-white font-medium focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full h-14 bg-black/50 border-2 border-white/10 rounded-2xl px-4 text-white font-medium focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 mt-2 bg-gradient-to-r from-red-600 to-purple-800 rounded-2xl text-white font-black text-sm tracking-widest uppercase hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'DOĞRULANIYOR...' : <>SİSTEME GİRİŞ <Terminal size={16} /></>}
          </button>
        </form>

        <p className="text-center text-[10px] text-gray-600 font-mono mt-8 uppercase tracking-widest">
          Supabase Auth • Platform Admin Yetkisi Gerekli
        </p>
        {DEV_BYPASS && (
          <p className="text-center text-[9px] text-yellow-600/80 font-mono mt-2">
            Dev bypass aktif — gerçek admin hesabı kullanın
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default AdminAuthGate;
