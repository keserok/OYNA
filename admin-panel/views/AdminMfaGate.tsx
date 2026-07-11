import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, KeyRound, Copy, Check, ArrowLeft } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';
import {
  enrollAdminTotp,
  verifyAdminTotp,
  unenrollAdminTotp,
  type AdminSession,
} from '../services/adminService';

type Mode = 'challenge' | 'enroll';

interface Props {
  /** 'challenge' → kayıtlı faktör var, kod iste. 'enroll' → QR ile yeni faktör kur. */
  mode: Mode;
  session: AdminSession;
  /** Challenge modunda zorunlu: doğrulanacak faktör. */
  factorId?: string;
  /** aal2'ye ulaşıldığında çağrılır → panel açılır. */
  onVerified: (session: AdminSession) => void;
  /** Geri / çıkış (oturumu kapatır, giriş ekranına döner). */
  onCancel: () => void;
}

const CODE_LEN = 6;

const AdminMfaGate: React.FC<Props> = ({ mode, session, factorId, onVerified, onCancel }) => {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Enroll akışı durumu
  const [enrolling, setEnrolling] = useState(mode === 'enroll');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(factorId ?? null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // StrictMode çift mount'ta tekrar enroll edilmesini engelle.
  const enrollStarted = useRef(false);

  // Enroll modunda QR üret.
  useEffect(() => {
    if (mode !== 'enroll' || enrollStarted.current) return;
    enrollStarted.current = true;
    let stale = false;
    void (async () => {
      setEnrolling(true);
      setErr(null);
      try {
        const res = await enrollAdminTotp();
        if (stale) return;
        setQrCode(res.qrCode);
        setSecret(res.secret);
        setActiveFactorId(res.factorId);
      } catch (e) {
        if (!stale) setErr(e instanceof Error ? e.message : 'Kurulum başlatılamadı.');
      } finally {
        if (!stale) setEnrolling(false);
      }
    })();
    return () => { stale = true; };
  }, [mode]);

  useEffect(() => {
    if (!enrolling) inputRef.current?.focus();
  }, [enrolling]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const cleaned = code.replace(/\D/g, '');
    if (cleaned.length !== CODE_LEN) {
      setErr('6 haneli kodu gir.');
      return;
    }
    const targetFactor = activeFactorId ?? factorId;
    if (!targetFactor) {
      setErr('Faktör bulunamadı, tekrar dene.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      await verifyAdminTotp(targetFactor, cleaned);
      onVerified(session);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Kod hatalı, tekrar dene.');
      setCode('');
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    // Yarım kalmış enroll faktörünü temizle (yalnız enroll modunda kuruldu).
    if (mode === 'enroll' && activeFactorId) {
      await unenrollAdminTotp(activeFactorId);
    }
    onCancel();
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard opsiyonel */ }
  };

  const title = mode === 'enroll' ? 'İki Adımlı Doğrulama Kurulumu' : 'İki Adımlı Doğrulama';
  const subtitle =
    mode === 'enroll'
      ? 'Admin güvenliği için zorunlu'
      : 'Authenticator kodunu gir';

  return (
    <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-purple-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-[0.2em]">{title}</h1>
          <p className="text-xs text-red-400 font-mono tracking-widest mt-2 uppercase">{subtitle}</p>
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

        {mode === 'enroll' && (
          <div className="mb-5">
            <p className="text-[11px] text-gray-400 leading-relaxed mb-4">
              Google Authenticator, Authy veya benzeri bir uygulamayı aç ve aşağıdaki QR kodunu
              tarat. QR taranamazsa kurulum anahtarını elle girebilirsin.
            </p>
            <div className="flex flex-col items-center gap-4">
              {enrolling && (
                <div className="w-48 h-48 rounded-2xl bg-black/40 border-2 border-white/10 flex items-center justify-center">
                  <Spinner size={24} color="#ffffff" glow={false} />
                </div>
              )}
              {!enrolling && qrCode && (
                <div className="p-3 bg-white rounded-2xl shadow-lg">
                  {/* enroll'un döndürdüğü SVG data-URI doğrudan gösterilir */}
                  <img src={qrCode} alt="TOTP QR kodu" width={180} height={180} className="block" />
                </div>
              )}
              {secret && (
                <div className="w-full">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">
                    Kurulum anahtarı (manuel)
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-gray-200 bg-black/50 border-2 border-white/10 rounded-xl px-3 py-2.5 break-all select-all">
                      {secret}
                    </code>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border-2 border-white/10 bg-black/50 text-gray-400 hover:text-white transition-colors"
                      aria-label="Anahtarı kopyala"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="mfa-code" className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">
              {mode === 'enroll' ? 'Uygulamadaki 6 haneli kod' : 'Authenticator kodu'}
            </label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                ref={inputRef}
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LEN}
                value={code}
                onChange={(e) => {
                  setErr(null);
                  setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LEN));
                }}
                placeholder="••••••"
                disabled={enrolling}
                className="w-full h-14 bg-black/50 border-2 border-white/10 rounded-2xl pl-12 pr-4 text-white font-mono text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-red-500/50 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || enrolling || code.length !== CODE_LEN}
            className="w-full h-14 mt-2 bg-gradient-to-r from-red-600 to-purple-800 rounded-2xl text-white font-black text-sm tracking-widest uppercase hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Spinner size={16} color="#ffffff" glow={false} />
                Doğrulanıyor...
              </>
            ) : (
              <>Doğrula <ShieldCheck size={16} /></>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleCancel()}
          className="w-full mt-4 flex items-center justify-center gap-2 text-[11px] text-gray-500 hover:text-gray-300 font-medium tracking-wide transition-colors"
        >
          <ArrowLeft size={13} /> Giriş ekranına dön
        </button>

        <p className="text-center text-[10px] text-gray-600 font-mono mt-8 uppercase tracking-widest">
          Supabase Auth • TOTP • aal2
        </p>
      </motion.div>
    </div>
  );
};

export default AdminMfaGate;
