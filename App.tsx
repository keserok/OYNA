import React, { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRole, AppView, MatchListing, Goalkeeper, Referee, Match } from './types';
import { auth, onAuthStateChanged, logout } from './supabaseAuth';
import { supabase } from './supabaseClient';
import { useAppStore } from './store';
import { initPushNotifications, subscribeToInAppNotifications, clearPushToken, handleDeepLink } from './notifications/pushService';
import { Capacitor } from '@capacitor/core';
import { fetchNotificationPreferences } from './notifications/notificationPreferences';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from './services/socialService';
import { identifyUser, resetUser, trackEvent } from './utils/observability';
import PendingVerificationView from './views/PendingVerificationView';
import { PAGE_TRANSITION } from './components/common/motion';
import OfflineBanner from './components/OfflineBanner';
import { GlobalToast, showToast } from './components/common/GlobalToast';
import SignupGate from './components/common/SignupGate';

// Eagerly loaded for immediate display (yalnız ilk boyanan ekranlar)
import SplashScreen from './views/SplashScreen';
import AuthScreen from './views/AuthScreen';

// Lazy loaded views to reduce initial bundle size
const Dashboard = lazy(() => import('./views/Dashboard'));
const MatchDiscovery = lazy(() => import('./views/MatchDiscovery'));
const MatchJoin = lazy(() => import('./views/MatchJoin'));
const LocationPrompt = lazy(() => import('./views/LocationPrompt'));
const RoleSelection = lazy(() => import('./views/RoleSelection'));
const PitchDiscovery = lazy(() => import('./views/PitchDiscovery'));
const PaymentScreen = lazy(() => import('./views/PaymentScreen'));
const TeamDetailView = lazy(() => import('./views/social/TeamDetailView'));
const Marketplace = lazy(() => import('./views/Marketplace'));
const ProfileScreen = lazy(() => import('./views/ProfileScreen'));
const Notifications = lazy(() => import('./views/Notifications'));
const SettingsScreen = lazy(() => import('./views/SettingsScreen'));
const MatchTicket = lazy(() => import('./views/MatchTicket'));
const MatchDiaryDetail = lazy(() => import('./views/MatchDiaryDetail'));
const Studio = lazy(() => import('./views/Studio'));
const WalletScreen = lazy(() => import('./views/WalletScreen'));
// MatchLobby kaldırıldı — MatchJoin artık tek ekran
// OpponentFinder (Rakip Bul haritası) kaldırıldı — rakip yalnız maç oluştur'dan davet edilir
const MatchCalendar = lazy(() => import('./views/MatchCalendar'));
const AdminPanel = lazy(() => import('./views/AdminPanel'));
const TeamBuilder = lazy(() => import('./views/TeamBuilder').then(module => ({ default: module.TeamBuilder })));
const SocialView = lazy(() => import('./views/SocialView'));
const FriendAddView = lazy(() => import('./views/social/FriendAddView'));
const PostMatchEval = lazy(() => import('./views/PostMatchEval'));
const MatchCreate = lazy(() => import('./views/MatchCreate'));
const UpcomingMatchesView = lazy(() => import('./views/UpcomingMatchesView'));
const OwnerPanel = lazy(() => import('./views/OwnerPanel'));
const ServiceDashboard = lazy(() => import('./views/ServiceDashboard'));
const PartnerOnboarding = lazy(() => import('./views/PartnerOnboarding'));
const ServiceApplication = lazy(() => import('./views/ServiceApplication'));
const QRScannerView = lazy(() => import('./views/QRScannerView'));
const MatchesView = lazy(() => import('./views/MatchesView'));
const MyBookings = lazy(() => import('./views/MyBookings'));
const LegalScreen = lazy(() => import('./views/LegalScreen'));
const MessagesView = lazy(() => import('./views/MessagesView'));
import { BottomNav } from './components/BottomNav';
const RoleSwitcher = lazy(() => import('./components/RoleSwitcher'));

// Loading fallback component
const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0A0E14]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#39FF14]"></div>
  </div>
);

const App: React.FC = () => {
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [verificationNote, setVerificationNote] = React.useState<string | null>(null);
  // Oturum geri yüklemesi ilk kez çözüldü mü? (Splash otomatik geçişi bunu bekler)
  const [authResolved, setAuthResolved] = React.useState(false);
  const {
    view,
    role,
    isAuthReady,
    selectedMatch,
    selectedDiaryId,
    selectedConversationId,
    selectedTeamChatId,
    setSelectedTeamChatId,
    selectedGk,
    selectedRef,
    navigateTo,
    goBack,
    resetNavigation,
    setRole,
    serviceAppRole,
    setIsAuthReady,
    setSelectedMatch,
    setSelectedDiaryId,
    setSelectedConversationId,
    setSelectedGk,
    setSelectedRef,
    impersonatedUser,
    setImpersonatedUser,
    originalRole,
    setOriginalRole,
    isNotificationsOpen,
    setIsNotificationsOpen,
    isRoleSwitcherOpen,
    setIsRoleSwitcherOpen,
    myRoles,
    addUserNotification,
    setNotificationPreferences,
    updateSingleNotificationPref,
  } = useAppStore();

  useEffect(() => {
    // Normal akış: her zaman SPLASH'ten başla, auth state'e göre yönlendir.
    resetNavigation('SPLASH');
  }, []);

  const initApp = useAppStore(s => s.initApp);
  const isHydrated = useAppStore(s => s.isHydrated);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // Godview standalone → consumer app ghost deep-link (?ghost=userId&name=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ghostId = params.get('ghost');
    if (!ghostId) return;

    const ghostName = params.get('name') || 'Kullanıcı';

    void (async () => {
      const { fetchProfileById, logImpersonation } = await import('./admin-panel/services/adminService');
      try { await logImpersonation(ghostId); } catch { /* audit optional if not admin session */ }
      const profile = await fetchProfileById(ghostId);
      setOriginalRole(role);
      setImpersonatedUser(profile ?? {
        id: ghostId,
        name: ghostName,
        email: '',
        avatar: '',
        role: UserRole.PLAYER,
        rating: 5,
        isVerified: false,
        isBanned: false,
        joinDate: new Date().toISOString(),
        matchCount: 0,
      });
      resetNavigation('DASHBOARD');
      window.history.replaceState({}, '', window.location.pathname);
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // Gerçek oturum açıldı → misafir modu biter
          useAppStore.getState().setIsGuest(false);
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email')
            .eq('id', user.uid)
            .single();

          if (!profile) {
            // ─── YENİ KULLANICI (kayıt) ───────────────────────────────────────
            // Yeni model: KAYIT OLAN HERKES OYUNCU. Kaleci/Hakem/Tesis rolleri
            // sonradan Profil'den opt-in başvuru + admin onayı ile eklenir; kayıt
            // öncesinde rol seçimi yoktur.
            const fallbackName = user.displayName
              || (user.email ? user.email.split('@')[0] : '')
              || (user.phone ? user.phone : '');
            try {
              await supabase.from('profiles').insert({
                id: user.uid,
                email: user.email ?? null,
                phone: user.phone ?? null,
                full_name: fallbackName,
                role: UserRole.PLAYER,
                roles: [UserRole.PLAYER],
                verification_status: 'approved',
                last_active_at: new Date().toISOString(),
              });
            } catch (insertError) {
              console.error('[App] Error creating user profile:', insertError);
              showToast('Profilin oluşturulurken bir sorun oluştu. Lütfen tekrar giriş yapmayı dene.');
            }
            setRole(UserRole.PLAYER);
            useAppStore.getState().setMyRoles([UserRole.PLAYER]);
            identifyUser(user.uid, { role: UserRole.PLAYER, is_admin: false });
            trackEvent('user_registered', { role: UserRole.PLAYER });
            // Yeni kayıtta bir kez bağlamsal konum izni sor ("yakınındaki
            // sahaları görebilmen için") — atlanabilir, sonra Dashboard.
            resetNavigation('LOCATION_PROMPT');
          } else {
            // ─── MEVCUT KULLANICI (giriş) ─────────────────────────────────────
            const primaryRole = (profile.role as UserRole) || UserRole.PLAYER;
            setRole(primaryRole);
            // FAZ 7.4: analitik + hata bağlamına kullanıcıyı bağla (env yoksa no-op)
            identifyUser(user.uid, { role: primaryRole, is_admin: !!profile.is_admin });
            // FAZ 7.5: çoklu rol geçişi için kullanıcının rollerini sakla
            useAppStore.getState().setMyRoles(
              Array.isArray(profile.roles) ? (profile.roles as string[]) : [primaryRole]
            );

            // Presence heartbeat (Spec F34): ön planda ~2,5 dk'da bir +
            // görünürlüğe dönüşte last_active_at yazılır; arka planda durur.
            // (Tek seferlik girişte-yazma modelinin halefi — gösterge dürüstleşir.)
            startPresenceHeartbeat(user.uid);

            // Yeni model: AÇILIŞ YÖNLENDİRMESİ tek kaynağa (aktif rol) dayanır.
            // Oturum kalıcı → tekrar giriş YOK. Aktif rol oyuncu → Dashboard;
            // onaylı kaleci/hakem → ServiceDashboard; onaylı tesis → OwnerPanel.
            // Aktif rol yalnızca admin onayından sonra sağlayıcı role çevrilir
            // (set_active_role), bu yüzden bekleyen başvuru oyuncuyu KİLİTLEMEZ.
            const currentView = useAppStore.getState().view;
            // LOCATION_PROMPT listede DEĞİL: yeni kayıt konum ekranındayken
            // token yenilenmesi kullanıcıyı ekrandan koparmasın.
            if (['SPLASH', 'AUTH', 'ROLE_SELECTION', 'PENDING_VERIFICATION'].includes(currentView)) {
              resetNavigation(navigateBasedOnRole(primaryRole));
            }
          }
        } else {
          setRole(UserRole.PLAYER);
          resetNavigation('SPLASH');
          resetUser(); // FAZ 7.4: çıkışta analitik/hata kullanıcı bağlamını temizle
          stopPresenceHeartbeat(); // çıkışta heartbeat durur (Spec F34)
        }
      } catch (error: any) {
        console.error('[App] Auth state error:', error);
        if (error?.message?.includes('JWT') || error?.message?.includes('Auth') || error?.code === 'PGRST301') {
          logout().catch(e => console.error('[App] Sign out error on invalid session:', e));
          resetNavigation('AUTH');
        }
      } finally {
        setIsAuthReady(true);
        setAuthResolved(true);
      }
    });
    return () => unsubscribe();
  }, [setRole, resetNavigation, setIsAuthReady]);

  // ─── Push Notification Entegrasyonu ────────────────────────────────────────
  useEffect(() => {
    let unsubscribeRealtime: (() => void) | undefined;

    const setupPush = async (uid: string) => {
      // 1. Kullanıcı tercihlerini Supabase'den çek
      const prefs = await fetchNotificationPreferences(uid);
      setNotificationPreferences(prefs);

      // 2. Capacitor Push başlat (native platformda)
      await initPushNotifications(
        uid,
        // Uygulama ön plandayken gelen bildirim → in-app toast
        (notification) => {
          addUserNotification({
            id: `push_${Date.now()}`,
            type: (notification.data?.type_key as string) || 'system',
            title: notification.title || 'Bildirim',
            desc: notification.body || '',
            time: 'Az önce',
            iconName: 'Bell',
            color: '#39FF14',
            textColor: '#fff',
            payload: notification.data?.match_id
              ? { matchId: notification.data.match_id, slotId: '' }
              : undefined,
          });
        },
        // Deep link handler — tüm oyna:// kaynakları tek yöneticiden (tek makine)
        (deepLink) => {
          const s = useAppStore.getState();
          handleDeepLink(deepLink, (v) => s.navigateTo(v as AppView), {
            setSelectedMatch: (m) => s.setSelectedMatch(m),
            setSelectedTeamId: s.setSelectedTeamId,
            setStudioContext: s.setStudioContext,
            setSocialTarget: s.setSocialTarget,
            setSelectedConversationId: s.setSelectedConversationId,
            setSelectedTeamChatId: s.setSelectedTeamChatId,
            setTeamInitialTab: s.setTeamInitialTab,
          });
        },
      );

      // 3. Supabase Realtime ile in-app bildirimleri dinle
      unsubscribeRealtime = subscribeToInAppNotifications(uid, (notif) => {
        addUserNotification({
          id: notif.id || `rt_${Date.now()}`,
          type: notif.type_key || 'system',
          title: notif.title,
          desc: notif.body,
          time: 'Az önce',
          iconName: 'Bell',
          color: '#39FF14',
          textColor: '#fff',
          payload: notif.match_id ? { matchId: notif.match_id, slotId: '' } : undefined,
        });
      });
    };

    const unsubscribeAuth = onAuthStateChanged(auth,
      (user: any) => {
        if (user?.uid) {
          setupPush(user.uid);
          useAppStore.getState().loadMyTeams();
        } else {
          // Çıkış yapılınca token’ı temizle
          if (unsubscribeRealtime) unsubscribeRealtime();
        }
      }
    );

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, []);

  // ─── Deep Link (oyna:// URL açılışları) ────────────────────────────────────
  // Push tıklaması dışındaki gerçek URL açılışları: @capacitor/app appUrlOpen.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', ({ url }) => {
        const s = useAppStore.getState();
        handleDeepLink(url, (v) => s.navigateTo(v as AppView), {
          setSelectedMatch: (m) => s.setSelectedMatch(m),
          setSelectedTeamId: s.setSelectedTeamId,
          setStudioContext: s.setStudioContext,
          setSocialTarget: s.setSocialTarget,
          setSelectedConversationId: s.setSelectedConversationId,
          setSelectedTeamChatId: s.setSelectedTeamChatId,
          setTeamInitialTab: s.setTeamInitialTab,
        });
      }).then((handle) => { remove = () => handle.remove(); });
    });
    return () => { if (remove) remove(); };
  }, []);

  // ─── Android donanım geri tuşu ─────────────────────────────────────────────
  // Yığında ekran varsa geri git; kök ekrandaysa uygulamayı arka plana al
  // (kapatmak yerine) — Play incelemesinin beklediği davranış.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', () => {
        const { navigationStack, goBack } = useAppStore.getState();
        if (navigationStack.length > 0) {
          goBack();
        } else {
          CapApp.minimizeApp();
        }
      }).then((handle) => { remove = () => handle.remove(); });
    });
    return () => { if (remove) remove(); };
  }, []);
  // Aktif role göre açılış ekranı. Oyuncu (ve varsayılan) → Dashboard.
  // Sağlayıcı/tesis rolleri yalnız admin onayından sonra aktif role atanır.
  const navigateBasedOnRole = (currentRole: UserRole | null): AppView => {
    if (currentRole === UserRole.OWNER) return 'OWNER_PANEL';
    if (currentRole === UserRole.REFEREE || currentRole === UserRole.GOALKEEPER) return 'SERVICE_DASHBOARD';
    return 'DASHBOARD';
  };

  const handleRoleSelect = async (selectedRole: UserRole, data?: any) => {
    setRole(selectedRole);
    if (auth.currentUser) {
      try {
        await supabase.from('profiles').update({
          role: selectedRole,
          ...data
        }).eq('id', auth.currentUser.uid);
      } catch (error) {
        console.error('Error saving role:', error);
        showToast('Rol kaydedilemedi. Lütfen tekrar dene.');
      }
      resetNavigation(navigateBasedOnRole(selectedRole));
    } else {
      navigateTo('AUTH');
    }
  };

  const renderView = () => {
    switch (view) {
      case 'SPLASH':
        return <SplashScreen ready={authResolved} onStart={() => {
          // Yeni model: rol seçimi yok. Oturum yoksa doğrudan Giriş;
          // oturum varsa role göre panel.
          if (!auth.currentUser) {
            resetNavigation('AUTH');
            return;
          }
          resetNavigation(navigateBasedOnRole(role));
        }} />;
      case 'AUTH':
        return <AuthScreen role={role} onSuccess={() => resetNavigation(navigateBasedOnRole(role))} onBack={() => goBack('SPLASH')} />;
      case 'LOCATION_PROMPT':
        return <LocationPrompt
          onPermissionGranted={() => resetNavigation(navigateBasedOnRole(role))}
          onSkip={() => resetNavigation(navigateBasedOnRole(role))}
        />;
      case 'ROLE_SELECTION':
        return <RoleSelection
          onSelect={handleRoleSelect}
          onBack={() => { }}
          onNavigate={(v) => navigateTo(v)}
        />;
      case 'PENDING_VERIFICATION':
        return <PendingVerificationView
          onApproved={() => resetNavigation(navigateBasedOnRole(role))}
          onLogout={() => resetNavigation('SPLASH')}
          onReapply={(note) => { setVerificationNote(note); navigateTo('SERVICE_APPLICATION'); }}
        />;
      case 'ADMIN_PANEL':
        return <AdminPanel onBack={() => goBack(navigateBasedOnRole(role))} />;
      case 'OWNER_PANEL':
        return (
          <OwnerPanel
            onBack={() => goBack(navigateBasedOnRole(role))}
            onNavigate={(v) => navigateTo(v as AppView)}
            onNeedOnboarding={() => navigateTo('PARTNER_ONBOARDING')}
          />
        );
      case 'SERVICE_DASHBOARD':
        return <ServiceDashboard role={role!} onBack={() => goBack(navigateBasedOnRole(role))} onNavigate={(v) => navigateTo(v)} />;
      case 'PARTNER_ONBOARDING':
        return <PartnerOnboarding
          onComplete={() => resetNavigation('OWNER_PANEL')}
          onClose={() => goBack(navigateBasedOnRole(role))}
        />;
      case 'SERVICE_APPLICATION':
        return <ServiceApplication
          role={(serviceAppRole === UserRole.REFEREE ? UserRole.REFEREE : UserRole.GOALKEEPER)}
          rejectionNote={verificationNote}
          onSubmitted={() => { setVerificationNote(null); resetNavigation('PENDING_VERIFICATION'); }}
          onBack={() => { setVerificationNote(null); goBack(navigateBasedOnRole(role)); }}
        />;
      case 'QR_SCANNER':
        return <QRScannerView
          onBack={() => goBack('OWNER_PANEL')}
          onResult={(res) => {
            setMatches(prev => [res, ...prev]);
          }}
        />;
      case 'MATCHES':
        return <MatchesView onBack={() => goBack('OWNER_PANEL')} matches={matches} />;
      case 'UPCOMING_MATCHES':
        return <UpcomingMatchesView onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'DASHBOARD':
        return <Dashboard
          onNavigate={(newView) => navigateTo(newView)}
          onBack={() => goBack(navigateBasedOnRole(role))}
          selectedGk={selectedGk}
          selectedRef={selectedRef}
        />;
      case 'PITCH_DISCOVERY':
        return <PitchDiscovery
          onBack={() => goBack('DASHBOARD')}
          onNavigate={(v) => navigateTo(v as AppView)}
        />;
      case 'MY_BOOKINGS':
        return <MyBookings onBack={() => goBack('DASHBOARD')} />;
      case 'LEGAL':
        return <LegalScreen onBack={() => goBack('SETTINGS')} />;
      case 'MARKETPLACE_GK':
        return <Marketplace
          type="GK"
          onBack={() => goBack('DASHBOARD')}
          onSelect={(gk) => {
            setSelectedGk(gk as Goalkeeper);
            goBack('DASHBOARD');
          }}
        />;
      case 'MARKETPLACE_REF':
        return <Marketplace
          type="REF"
          onBack={() => goBack('DASHBOARD')}
          onSelect={(ref) => {
            setSelectedRef(ref as Referee);
            goBack('DASHBOARD');
          }}
        />;
      case 'PAYMENT':
        return <PaymentScreen
          onBack={() => goBack('DASHBOARD')}
          onViewTicket={() => resetNavigation('MATCH_TICKET')}
        />;
      case 'MY_TEAM':
        // Birleşik Takım Detayı — kimlik store.selectedTeamId ile taşınır (Spec §3.8)
        return <TeamDetailView onBack={() => goBack('SOCIAL')} onNavigate={(v) => navigateTo(v)} />;
      case 'STUDIO':
        return <Studio onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'PROFILE':
        return <ProfileScreen
          role={role || UserRole.PLAYER}
          onBack={() => goBack('DASHBOARD')}
          onNavigate={(v) => navigateTo(v)}
          onOpenDiaryEntry={(id) => {
            setSelectedDiaryId(id);
            navigateTo('MATCH_DIARY_DETAIL');
          }}
        />;
      case 'WALLET':
        return <WalletScreen
          onBack={() => {
            useAppStore.getState().setWalletInitialTab('MAIN');
            goBack('DASHBOARD');
          }}
        />;
      // MATCH_LOBBY kaldırıldı — tüm işlemler MatchJoin'de yapılıyor
      // OPPONENT_FINDER kaldırıldı — rakip yalnız maç oluştur'dan davet edilir
      case 'MATCH_CALENDAR':
        return <MatchCalendar onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'MATCH_DIARY_DETAIL':
        return <MatchDiaryDetail
          diaryId={selectedDiaryId}
          onBack={() => goBack('PROFILE')}
        />;

      case 'SETTINGS':
        return <SettingsScreen onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'MATCH_DISCOVERY':
        return <MatchDiscovery
          onBack={() => goBack('DASHBOARD')}
          onSelect={(match) => {
            setSelectedMatch(match);
            navigateTo('MATCH_JOIN');
          }}
        />;
      case 'MATCH_JOIN':
        return <MatchJoin
          match={selectedMatch}
          onBack={() => goBack('MATCH_DISCOVERY')}
          onJoin={() => resetNavigation('DASHBOARD')} // Kadro kaydından sonra Dashboard'a dön
        />;
      case 'MATCH_TICKET':
        return <MatchTicket onBack={() => goBack('DASHBOARD')} />;
      case 'TEAM_BUILDER':
        return <TeamBuilder onBack={() => goBack('PROFILE')} />;
      case 'SOCIAL':
        return <SocialView onNavigate={(v) => navigateTo(v)} />;
      case 'FRIEND_ADD':
        return <FriendAddView onBack={() => goBack('SOCIAL')} onNavigate={(v) => navigateTo(v)} />;
      case 'MESSAGES':
        return <MessagesView
          initialConversationId={selectedConversationId}
          initialTeamChatId={selectedTeamChatId}
          onBack={() => {
            setSelectedConversationId(null);
            setSelectedTeamChatId(null);
            goBack('SOCIAL');
          }}
        />;
      case 'POST_MATCH_EVAL':
        return <PostMatchEval onBack={() => goBack('SOCIAL')} onComplete={() => goBack('SOCIAL')} />;
      case 'MATCH_CREATE':
        return <MatchCreate onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      default:
        return <SplashScreen ready={authResolved} onStart={() => navigateTo('AUTH')} />;
    }
  };

  const showBottomNav = ['DASHBOARD', 'MATCH_DISCOVERY', 'SOCIAL', 'STUDIO', 'PITCH_DISCOVERY', 'PROFILE'].includes(view);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-['Inter'] relative overflow-hidden">
      <OfflineBanner />
      <GlobalToast />
      <SignupGate />
      {/* Mesh Gradient Background */}
      <div className="mesh-bg">
        <div className="mesh-blob mesh-blob-1"></div>
        <div className="mesh-blob mesh-blob-2"></div>
        <div className="mesh-blob mesh-blob-3"></div>
      </div>

      <AnimatePresence mode="popLayout">
        <motion.div
          key={view}
          {...PAGE_TRANSITION}
          className={`w-full h-full absolute inset-0 overflow-y-auto custom-scrollbar ${showBottomNav ? 'pb-safe-nav' : 'pb-safe'}`}
        >
          <Suspense fallback={<ViewLoader />}>
            {renderView()}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showBottomNav && (
          <BottomNav currentView={view} onNavigate={resetNavigation} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNotificationsOpen && (
          <Notifications
            role={role}
            onBack={() => setIsNotificationsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* FAZ 7.5: Çoklu rol geçişi — rol değiştirici sheet (yalnızca >1 rol varsa açılabilir) */}
      <AnimatePresence>
        {isRoleSwitcherOpen && new Set(myRoles).size > 1 && (
          <Suspense fallback={null}>
            <RoleSwitcher
              roles={myRoles}
              onClose={() => setIsRoleSwitcherOpen(false)}
              onSwitched={(_newRole, landingView) => {
                setIsRoleSwitcherOpen(false);
                // Mevcut merkezi yönlendirmeyi yeniden kullan: ilgili açılış ekranına git
                resetNavigation(landingView);
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Impersonation Ghost Mode Banner */}
      <AnimatePresence>
        {impersonatedUser && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-xl border-2 border-red-500/40 rounded-full px-6 py-3.5 shadow-[0_0_30px_rgba(239,68,68,0.25)] z-50 flex items-center gap-4 shrink-0"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 absolute" />
              <p className="text-[11px] font-black uppercase tracking-wider text-white">
                GHOST MODE: <span className="text-red-400">{impersonatedUser.name}</span> TAKLİT EDİLİYOR
              </p>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={() => {
                if (originalRole) {
                  setRole(originalRole);
                }
                setImpersonatedUser(null);
                setOriginalRole(null);
                resetNavigation('ADMIN_PANEL');
              }}
              className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-black tracking-widest uppercase rounded-full transition-all"
            >
              Taklidi Bitir
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
