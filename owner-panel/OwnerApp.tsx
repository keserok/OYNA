import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Building2, LogOut, ShieldAlert } from 'lucide-react';
import AuthScreen from '../views/AuthScreen';
import OwnerPanel from '../views/OwnerPanel';
import { useAppStore } from '../store';
import { auth, onAuthStateChanged, logout, type OynaCurrentUser } from '../supabaseAuth';
import { UserRole } from '../types';

// Owner'a özel ikincil ekranlar — ilk yükü hafif tutmak için lazy.
const QRScannerView = lazy(() => import('../views/QRScannerView'));
const PartnerOnboarding = lazy(() => import('../views/PartnerOnboarding'));
const Notifications = lazy(() => import('../views/Notifications'));

type OwnerAppMode = 'panel' | 'onboarding' | 'qr';

/** Marka renkli yükleme ekranı. */
const OwnerSplash: React.FC<{ label?: string }> = ({ label = 'Tesis paneli yükleniyor…' }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#1A1F2C] text-slate-200">
    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
      <Building2 size={24} />
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
      <span className="w-4 h-4 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
      {label}
    </div>
  </div>
);

/** Tesis hesabı olmayan kullanıcı için bilgilendirme + çıkış. */
const NotOwnerGate: React.FC<{ user: OynaCurrentUser; onLogout: () => void }> = ({ user, onLogout }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A1F2C] text-slate-200 px-6 text-center">
    <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5">
      <ShieldAlert size={26} />
    </div>
    <h1 className="text-lg font-black text-white mb-2">Bu panel tesis sahipleri içindir</h1>
    <p className="text-sm text-slate-400 max-w-sm mb-1">
      <span className="text-slate-300 font-semibold">{user.email ?? user.phone ?? 'Bu hesap'}</span> bir tesis hesabı değil.
    </p>
    <p className="text-xs text-slate-500 max-w-sm mb-8">
      Tesis başvurusu için OYNA uygulamasını kullanın ya da tesis hesabınızla giriş yapın.
    </p>
    <button
      type="button"
      onClick={onLogout}
      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-slate-200 transition-all"
    >
      <LogOut size={16} />
      Çıkış yap & farklı hesapla gir
    </button>
  </div>
);

const OwnerApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<OynaCurrentUser | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState<OwnerAppMode>('panel');

  const isNotificationsOpen = useAppStore((s) => s.isNotificationsOpen);
  const setIsNotificationsOpen = useAppStore((s) => s.setIsNotificationsOpen);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) setMode('panel'); // çıkışta temiz başlangıç
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setMode('panel');
  };

  const handleNavigate = (view: string) => {
    if (view === 'QR_SCANNER') {
      setMode('qr');
      return;
    }
    // Diğer hedefler oyuncu uygulamasına ait — web panelde Faz 2'de ele alınacak.
    console.warn('[OwnerApp] Web panelde henüz desteklenmeyen yönlendirme:', view);
  };

  // ── İlk oturum çözümlenene kadar splash ──
  if (!authReady) {
    return <OwnerSplash />;
  }

  // ── Oturum yok → giriş ekranı (Tesis temasıyla) ──
  if (!currentUser) {
    return (
      <AuthScreen
        role={UserRole.OWNER}
        allowGuest={false}
        onSuccess={() => { /* onAuthStateChanged geçişi yönetir; misafir butonu yok */ }}
      />
    );
  }

  // ── Giriş var ama tesis/yönetici değil → bilgilendirme ──
  const isOwner = currentUser.roles?.includes('OWNER') || currentUser.isAdmin;
  if (!isOwner) {
    return <NotOwnerGate user={currentUser} onLogout={handleLogout} />;
  }

  // ── Tesis sahibi: QR / onboarding / panel ──
  if (mode === 'qr') {
    return (
      <Suspense fallback={<OwnerSplash label="QR tarayıcı açılıyor…" />}>
        <QRScannerView
          onBack={() => setMode('panel')}
          onResult={() => { /* bilet doğrulama QRScannerView içinde işlenir */ }}
        />
      </Suspense>
    );
  }

  if (mode === 'onboarding') {
    return (
      <Suspense fallback={<OwnerSplash label="Kurulum açılıyor…" />}>
        <PartnerOnboarding onComplete={() => setMode('panel')} onClose={() => setMode('panel')} />
      </Suspense>
    );
  }

  return (
    <>
      <OwnerPanel
        onBack={handleLogout}
        onNavigate={handleNavigate}
        onNeedOnboarding={() => setMode('onboarding')}
      />
      {isNotificationsOpen && (
        <Suspense fallback={null}>
          <Notifications role={UserRole.OWNER} onBack={() => setIsNotificationsOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default OwnerApp;
