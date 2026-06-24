import React, { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRole, AppView, MatchListing, Goalkeeper, Referee, Match } from './types';
import { auth, onAuthStateChanged, logout } from './supabaseAuth';
import { supabase } from './supabaseClient';
import { useAppStore } from './store';
import { initPushNotifications, subscribeToInAppNotifications, clearPushToken } from './notifications/pushService';
import { fetchNotificationPreferences } from './notifications/notificationPreferences';
import PendingVerificationView from './views/PendingVerificationView';
import { PAGE_TRANSITION } from './components/common/motion';

// Eagerly loaded for immediate display
import SplashScreen from './views/SplashScreen';
import AuthScreen from './views/AuthScreen';
import Dashboard from './views/Dashboard';
import MatchDiscovery from './views/MatchDiscovery';
import MatchJoin from './views/MatchJoin';
import LocationPrompt from './views/LocationPrompt';

// Lazy loaded views to reduce initial bundle size
const RoleSelection = lazy(() => import('./views/RoleSelection'));
const PitchDiscovery = lazy(() => import('./views/PitchDiscovery'));
const PaymentScreen = lazy(() => import('./views/PaymentScreen'));
const MyTeam = lazy(() => import('./views/MyTeam'));
const Marketplace = lazy(() => import('./views/Marketplace'));
const MyListings = lazy(() => import('./views/MyListings'));
const ListingDetails = lazy(() => import('./views/ListingDetails'));
const ProfileScreen = lazy(() => import('./views/ProfileScreen'));
const Notifications = lazy(() => import('./views/Notifications'));
const SettingsScreen = lazy(() => import('./views/SettingsScreen'));
const VotingScreen = lazy(() => import('./views/VotingScreen'));
const MotmReveal = lazy(() => import('./views/MotmReveal'));
const OynaTv = lazy(() => import('./views/OynaTv'));
const PremiumScreen = lazy(() => import('./views/PremiumScreen'));
const ChatScreen = lazy(() => import('./views/ChatScreen'));
const MatchTicket = lazy(() => import('./views/MatchTicket'));
const ScoutDashboard = lazy(() => import('./views/ScoutDashboard'));
const PostMatchReport = lazy(() => import('./views/PostMatchReport'));
const MatchDiaryDetail = lazy(() => import('./views/MatchDiaryDetail'));
const Studio = lazy(() => import('./views/Studio'));
const WalletScreen = lazy(() => import('./views/WalletScreen'));
// MatchLobby kaldırıldı — MatchJoin artık tek ekran
const OpponentFinder = lazy(() => import('./views/OpponentFinder'));
const MatchCalendar = lazy(() => import('./views/MatchCalendar'));
const AdminPanel = lazy(() => import('./views/AdminPanel'));
const TeamBuilder = lazy(() => import('./views/TeamBuilder').then(module => ({ default: module.TeamBuilder })));
const CommunityView = lazy(() => import('./views/CommunityView'));
const TeamCreator = lazy(() => import('./views/TeamCreator'));
const TransferCenter = lazy(() => import('./views/TransferCenter'));
const Leaderboards = lazy(() => import('./views/Leaderboards'));
const PostMatchEval = lazy(() => import('./views/PostMatchEval'));
const TournamentBracket = lazy(() => import('./views/TournamentBracket'));
const CommunityAdminDashboard = lazy(() => import('./views/CommunityAdminDashboard'));
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
import { BottomNav } from './components/BottomNav';
import { RookieShowcase } from './views/RookieShowcase';

// Loading fallback component
const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0A0E14]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#39FF14]"></div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// 🛠️  GELİŞTİRME MODU
// VITE_DEV_MODE=true  → direkt Dashboard
// .env boşsa          → otomatik dev mod (Supabase yokken takılmayı önler)
// import.meta.env.PROD === true ise dev mod hiçbir zaman aktif olmaz
// ─────────────────────────────────────────────────────────────────────────────
const DEV_MODE =
  import.meta.env.PROD !== true &&
  (import.meta.env.VITE_DEV_MODE === 'true' || !import.meta.env.VITE_SUPABASE_URL);

const App: React.FC = () => {
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [verificationNote, setVerificationNote] = React.useState<string | null>(null);
  const {
    view,
    role,
    isAuthReady,
    hasMotmCoupon,
    selectedMatch,
    isUserPro,
    selectedDiaryId,
    selectedGk,
    selectedRef,
    navigateTo,
    goBack,
    resetNavigation,
    setRole,
    setIsAuthReady,
    setHasMotmCoupon,
    setSelectedMatch,
    setIsUserPro,
    setSelectedDiaryId,
    setSelectedGk,
    setSelectedRef,
    impersonatedUser,
    setImpersonatedUser,
    originalRole,
    setOriginalRole,
    chatTarget,
    isNotificationsOpen,
    setIsNotificationsOpen,
    addUserNotification,
    setNotificationPreferences,
    updateSingleNotificationPref,
  } = useAppStore();

  useEffect(() => {
    if (DEV_MODE) {
      // 🛠️ Geliştirme: direkt Dashboard — login yok
      setRole(UserRole.CAPTAIN);
      setIsAuthReady(true);
      resetNavigation('DASHBOARD');
    } else {
      // 🚀 Prodüksiyon: normal akış
      resetNavigation('SPLASH');
    }
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
        isPro: false,
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
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email')
            .eq('id', user.uid)
            .single();

          if (!profile) {
            // ─── YENİ KULLANICI (kayıt) ───────────────────────────────────────
            const currentRole = useAppStore.getState().role ?? UserRole.PLAYER;
            const fallbackName = user.displayName
              || (user.email ? user.email.split('@')[0] : '')
              || (user.phone ? user.phone : '');
            try {
              await supabase.from('profiles').insert({
                id: user.uid,
                email: user.email ?? null,
                phone: user.phone ?? null,
                full_name: fallbackName,
                role: currentRole,
                roles: [currentRole],
                verification_status: (currentRole === UserRole.OWNER || currentRole === UserRole.GOALKEEPER || currentRole === UserRole.REFEREE) ? 'pending' : 'approved',
                last_active_at: new Date().toISOString(),
              });
            } catch (insertError) {
              console.error('[App] Error creating user profile:', insertError);
            }
            setRole(currentRole);
            // Kaleci/Hakem → detaylı başvuru formu; Tesis → owner panel; diğer → konum
            if (currentRole === UserRole.GOALKEEPER || currentRole === UserRole.REFEREE) {
              resetNavigation('SERVICE_APPLICATION');
            } else if (currentRole === UserRole.OWNER) {
              resetNavigation('OWNER_PANEL');
            } else {
              resetNavigation('LOCATION_PROMPT');
            }
          } else {
            // ─── MEVCUT KULLANICI (giriş) ─────────────────────────────────────
            const primaryRole = (profile.role as UserRole) || UserRole.PLAYER;
            setRole(primaryRole);

            // last_active_at background güncelleme
            supabase
              .from('profiles')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', user.uid);

            const currentView = useAppStore.getState().view;
            if (['SPLASH', 'AUTH', 'ROLE_SELECTION', 'LOCATION_PROMPT'].includes(currentView)) {
              const isProvider = primaryRole === UserRole.GOALKEEPER || primaryRole === UserRole.REFEREE;

              if (isProvider) {
                // Kaleci/Hakem: başvuru tamamlandı mı + onay durumu birlikte değerlendirilir
                const providerTable = primaryRole === UserRole.GOALKEEPER ? 'goalkeepers' : 'referees';
                const { data: providerRow } = await supabase
                  .from(providerTable)
                  .select('id')
                  .eq('id', user.uid)
                  .maybeSingle();
                const hasApplication = !!providerRow;

                if (profile.verification_status === 'rejected') {
                  setVerificationNote(profile.verification_notes ?? null);
                  resetNavigation('SERVICE_APPLICATION');
                } else if (!hasApplication) {
                  setVerificationNote(null);
                  resetNavigation('SERVICE_APPLICATION');
                } else if (profile.verification_status === 'pending') {
                  resetNavigation('PENDING_VERIFICATION');
                } else {
                  resetNavigation('SERVICE_DASHBOARD');
                }
              } else if (profile.verification_status === 'pending' && primaryRole !== UserRole.OWNER) {
                resetNavigation('PENDING_VERIFICATION');
              } else if (primaryRole === UserRole.OWNER) {
                resetNavigation('OWNER_PANEL');
              } else {
                resetNavigation('LOCATION_PROMPT');
              }
            }
          }
        } else {
          setRole(UserRole.PLAYER);
          resetNavigation('SPLASH');
        }
      } catch (error: any) {
        console.error('[App] Auth state error:', error);
        if (error?.message?.includes('JWT') || error?.message?.includes('Auth') || error?.code === 'PGRST301') {
          logout().catch(e => console.error('[App] Sign out error on invalid session:', e));
          resetNavigation('ROLE_SELECTION');
        }
      } finally {
        setIsAuthReady(true);
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
        // Deep link handler
        (deepLink) => {
          if (!deepLink) return;
          const parts = deepLink.replace('oyna://', '').split('/');
          if (parts[0] === 'match' && parts[1]) {
            supabase.from('matches').select('*').eq('id', parts[1]).single().then(({ data }) => {
              if (data) {
                useAppStore.getState().setSelectedMatch(data as any);
                useAppStore.getState().navigateTo('MATCH_JOIN');
              }
            });
          }
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
  const navigateBasedOnRole = (currentRole: UserRole | null): AppView => {
    if (currentRole === UserRole.OWNER) return 'OWNER_PANEL';
    if (currentRole === UserRole.REFEREE || currentRole === UserRole.GOALKEEPER) return 'SERVICE_DASHBOARD';
    if (currentRole) return 'DASHBOARD';
    return 'ROLE_SELECTION';
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
      }
      resetNavigation(navigateBasedOnRole(selectedRole));
    } else {
      navigateTo('AUTH');
    }
  };

  const renderView = () => {
    switch (view) {
      case 'SPLASH':
        return <SplashScreen onStart={() => {
          if (!auth.currentUser) {
            resetNavigation('ROLE_SELECTION');
            return;
          }
          resetNavigation(navigateBasedOnRole(role));
        }} />;
      case 'AUTH':
        return <AuthScreen role={role} onSuccess={() => resetNavigation(navigateBasedOnRole(role))} onBack={() => goBack('ROLE_SELECTION')} />;
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
        return <AdminPanel onBack={() => goBack('ROLE_SELECTION')} />;
      case 'OWNER_PANEL':
        return (
          <OwnerPanel
            onBack={() => goBack('ROLE_SELECTION')}
            onNavigate={(v) => navigateTo(v as AppView)}
            onNeedOnboarding={() => navigateTo('PARTNER_ONBOARDING')}
          />
        );
      case 'SERVICE_DASHBOARD':
        return <ServiceDashboard role={role!} onBack={() => goBack('ROLE_SELECTION')} onNavigate={(v) => navigateTo(v)} />;
      case 'PARTNER_ONBOARDING':
        return <PartnerOnboarding
          onComplete={() => resetNavigation('OWNER_PANEL')}
          onClose={() => goBack('ROLE_SELECTION')}
        />;
      case 'SERVICE_APPLICATION':
        return <ServiceApplication
          role={(role === UserRole.REFEREE ? UserRole.REFEREE : UserRole.GOALKEEPER)}
          rejectionNote={verificationNote}
          onSubmitted={() => { setVerificationNote(null); resetNavigation('PENDING_VERIFICATION'); }}
          onBack={() => { setVerificationNote(null); goBack('ROLE_SELECTION'); }}
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
          onBack={() => goBack('ROLE_SELECTION')}
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
      case 'MY_LISTINGS':
        return <MyListings onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'LISTING_DETAILS':
        return <ListingDetails onBack={() => goBack('MY_LISTINGS')} />;
      case 'PAYMENT':
        return <PaymentScreen
          hasMotmCoupon={hasMotmCoupon}
          onBack={() => goBack('OPPONENT_FINDER')}
          onUpgradeRequest={() => navigateTo('PREMIUM')}
          onViewTicket={() => resetNavigation('MATCH_TICKET')}
        />;
      case 'MY_TEAM':
        return <MyTeam onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
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
          isPro={isUserPro}
        />;
      case 'WALLET':
        return <WalletScreen
          onBack={() => {
            useAppStore.getState().setWalletInitialTab('MAIN');
            goBack('DASHBOARD');
          }}
        />;
      // MATCH_LOBBY kaldırıldı — tüm işlemler MatchJoin'de yapılıyor
      case 'OPPONENT_FINDER':
        return <OpponentFinder onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'MATCH_CALENDAR':
        return <MatchCalendar onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'MATCH_DIARY_DETAIL':
        return <MatchDiaryDetail
          diaryId={selectedDiaryId}
          onBack={() => goBack('PROFILE')}
        />;

      case 'SETTINGS':
        return <SettingsScreen onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'VOTING':
        return <VotingScreen onBack={() => goBack('DASHBOARD')} onComplete={() => navigateTo('MOTM_REVEAL')} />;
      case 'MOTM_REVEAL':
        return <MotmReveal
          onClaim={() => {
            setHasMotmCoupon(true);
            resetNavigation('DASHBOARD');
          }}
          onBack={() => goBack('DASHBOARD')}
        />;
      case 'OYNA_TV':
        return <OynaTv onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
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
      case 'PREMIUM':
        return <PremiumScreen
          onBack={() => goBack('DASHBOARD')}
          onUpgrade={() => {
            setIsUserPro(true);
            navigateTo('PROFILE');
          }}
        />;
      case 'CHAT':
        return <ChatScreen
          targetName={chatTarget?.name}
          targetRole={chatTarget?.role}
          targetAvatar={chatTarget?.avatar}
          onBack={() => goBack('MATCH_DISCOVERY')}
        />;
      case 'MATCH_TICKET':
        return <MatchTicket onBack={() => goBack('DASHBOARD')} />;
      case 'SCOUT_DASHBOARD':
        return <ScoutDashboard onBack={() => goBack('PROFILE')} />;
      case 'POST_MATCH':
        return <PostMatchReport onBack={() => goBack('PROFILE')} />;
      case 'TEAM_BUILDER':
        return <TeamBuilder onBack={() => goBack('PROFILE')} />;
      case 'COMMUNITY_VIEW':
        return <CommunityView
          onBack={() => goBack('DASHBOARD')}
          onNavigate={(v) => navigateTo(v)}
          community={{ id: 'c1', name: 'Boğaziçi Üniversitesi', domain: '@boun.edu.tr', memberCount: 1250, activeMatches: 12, isVerified: true }}
          currentUser={{ id: auth.currentUser?.uid || '', name: auth.currentUser?.displayName || 'Oyuncu', email: auth.currentUser?.email || '', avatar: auth.currentUser?.photoURL || undefined, roles: [], communities: [], fairPlayScore: 100 }}
        />;
      case 'TEAM_CREATOR':
        return <TeamCreator
          onBack={() => goBack('PROFILE')}
          onComplete={async (teamData) => {
            try {
              await useAppStore.getState().createTeam(teamData);
              navigateTo('MY_TEAM');
            } catch (error) {
              console.error('Takım oluşturulamadı:', error);
              goBack('PROFILE');
            }
          }}
          communities={[{ id: 'c1', name: 'Boğaziçi Üniversitesi', domain: '@boun.edu.tr', memberCount: 1250, activeMatches: 12, isVerified: true }]}
        />;
      case 'TRANSFER_CENTER':
        return <TransferCenter onBack={() => goBack('COMMUNITY_VIEW')} />;
      case 'LEADERBOARDS':
        return <Leaderboards onBack={() => goBack('COMMUNITY_VIEW')} />;
      case 'POST_MATCH_EVAL':
        return <PostMatchEval onBack={() => goBack('COMMUNITY_VIEW')} onComplete={() => goBack('COMMUNITY_VIEW')} />;
      case 'TOURNAMENT_BRACKET':
        return <TournamentBracket onBack={() => goBack('COMMUNITY_VIEW')} />;
      case 'COMMUNITY_ADMIN_DASHBOARD':
        return <CommunityAdminDashboard onBack={() => goBack('COMMUNITY_VIEW')} />;
      case 'MATCH_CREATE':
        return <MatchCreate onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      default:
        return <SplashScreen onStart={() => navigateTo('AUTH')} />;
    }
  };

  const showBottomNav = ['DASHBOARD', 'MATCH_DISCOVERY', 'COMMUNITY_VIEW', 'STUDIO', 'PITCH_DISCOVERY', 'PROFILE'].includes(view);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-['Inter'] relative overflow-hidden">
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
          className={`w-full h-full absolute inset-0 overflow-y-auto custom-scrollbar ${showBottomNav ? 'pb-safe-nav' : ''}`}
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
