import React, { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRole, AppView, MatchListing, Goalkeeper, Referee, Match } from './types';
import { auth, onAuthStateChanged, logout } from './supabaseAuth';
import { supabase } from './supabaseClient';
import { useAppStore } from './store';
import { initPushNotifications, subscribeToInAppNotifications, clearPushToken } from './notifications/pushService';
import { fetchNotificationPreferences } from './notifications/notificationPreferences';
import PendingVerificationView from './views/PendingVerificationView';

// ─── Page transition wrapper ─────────────────────────────────────────────────
const PageTransition: React.FC<{ children: React.ReactNode; viewKey: string }> = ({ children, viewKey }) => (
  <motion.div
    key={viewKey}
    initial={{ opacity: 0, y: 12, scale: 0.99 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.995 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}
  >
    {children}
  </motion.div>
);

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
const BookingAddons = lazy(() => import('./views/BookingAddons'));
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
  const {
    view,
    role,
    isAuthReady,
    addOnTotal,
    hasMotmCoupon,
    selectedMatch,
    isUserPro,
    selectedDiaryId,
    selectedGk,
    selectedRef,
    marketplaceReturnView,
    matchJoinReturnView,
    setView,
    setRole,
    setIsAuthReady,
    setAddOnTotal,
    setHasMotmCoupon,
    setSelectedMatch,
    setIsUserPro,
    setSelectedDiaryId,
    setSelectedGk,
    setSelectedRef,
    setMarketplaceReturnView,
    setMatchJoinReturnView,
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
      setView('DASHBOARD');
    } else {
      // 🚀 Prodüksiyon: normal akış
      setView('SPLASH');
    }
  }, []);

  const initApp = useAppStore(s => s.initApp);
  const isHydrated = useAppStore(s => s.isHydrated);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, roles, verification_status, is_admin, wallet_balance, phone, email')
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
            if (currentRole === UserRole.OWNER || currentRole === UserRole.GOALKEEPER || currentRole === UserRole.REFEREE) {
              setView('PENDING_VERIFICATION');
            } else {
              setView('LOCATION_PROMPT');
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
              if (profile.verification_status === 'pending') {
                setView('PENDING_VERIFICATION');
              } else if (primaryRole === UserRole.OWNER) {
                setView('LOCATION_PROMPT');
              } else if (primaryRole === UserRole.GOALKEEPER || primaryRole === UserRole.REFEREE) {
                setView('SERVICE_DASHBOARD');
              } else {
                setView('LOCATION_PROMPT');
              }
            }
          }
        } else {
          setRole(UserRole.PLAYER);
          setView('SPLASH');
        }
      } catch (error: any) {
        console.error('[App] Auth state error:', error);
        if (error?.message?.includes('JWT') || error?.message?.includes('Auth') || error?.code === 'PGRST301') {
          logout().catch(e => console.error('[App] Sign out error on invalid session:', e));
          setView('ROLE_SELECTION');
        }
      } finally {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [setRole, setView, setIsAuthReady]);

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
                setView('MATCH_JOIN');
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
      setView(navigateBasedOnRole(selectedRole));
    } else {
      setView('AUTH');
    }
  };

  const renderView = () => {
    switch (view) {
      case 'SPLASH':
        return <SplashScreen onStart={() => setView(auth.currentUser ? 'LOCATION_PROMPT' : 'ROLE_SELECTION')} />;
      case 'AUTH':
        return <AuthScreen role={role} onSuccess={() => setView(navigateBasedOnRole(role))} onBack={() => setView('ROLE_SELECTION')} />;
      case 'LOCATION_PROMPT':
        return <LocationPrompt
          onPermissionGranted={() => setView(navigateBasedOnRole(role))}
          onSkip={() => setView(navigateBasedOnRole(role))}
        />;
      case 'ROLE_SELECTION':
        return <RoleSelection
          onSelect={handleRoleSelect}
          onBack={() => { }}
          onNavigate={(v) => setView(v)}
        />;
      case 'PENDING_VERIFICATION':
        return <PendingVerificationView
          onApproved={() => setView(navigateBasedOnRole(role))}
          onLogout={() => setView('SPLASH')}
        />;
      case 'ADMIN_PANEL':
        return <AdminPanel onBack={() => setView('ROLE_SELECTION')} />;
      case 'OWNER_PANEL':
        return (
          <OwnerPanel
            onBack={() => setView('ROLE_SELECTION')}
            onNavigate={(v) => setView(v as AppView)}
            onNeedOnboarding={() => setView('PARTNER_ONBOARDING')}
          />
        );
      case 'SERVICE_DASHBOARD':
        return <ServiceDashboard role={role!} onBack={() => setView('ROLE_SELECTION')} onNavigate={(v) => setView(v)} />;
      case 'PARTNER_ONBOARDING':
        return <PartnerOnboarding 
          onComplete={() => setView('OWNER_PANEL')} 
          onClose={() => setView('ROLE_SELECTION')}
        />;
      case 'QR_SCANNER':
        return <QRScannerView 
          onBack={() => setView('OWNER_PANEL')} 
          onResult={(res) => {
            setMatches(prev => [res, ...prev]);
          }} 
        />;
      case 'MATCHES':
        return <MatchesView onBack={() => setView('OWNER_PANEL')} matches={matches} />;
      case 'UPCOMING_MATCHES':
        return <UpcomingMatchesView onBack={() => setView('DASHBOARD')} onNavigate={(v) => {
          if (v === 'MATCH_JOIN') setMatchJoinReturnView('UPCOMING_MATCHES');
          setView(v);
        }} />;
      case 'DASHBOARD':
        return <Dashboard
          onNavigate={(newView) => {
            if (newView === 'MARKETPLACE_GK' || newView === 'MARKETPLACE_REF') {
              setMarketplaceReturnView('DASHBOARD');
            }
            setView(newView);
          }}
          onBack={() => setView('ROLE_SELECTION')}
          selectedGk={selectedGk}
          selectedRef={selectedRef}
        />;
      case 'PITCH_DISCOVERY':
        return <PitchDiscovery
          onBack={() => setView('DASHBOARD')}
          onBook={() => setView('BOOKING_ADDONS')}
          onNavigate={(v) => setView(v as AppView)}
        />;
      case 'MY_BOOKINGS':
        return <MyBookings onBack={() => setView('DASHBOARD')} />;
      case 'LEGAL':
        return <LegalScreen onBack={() => setView('SETTINGS')} />;
      case 'MARKETPLACE_GK':
        return <Marketplace
          type="GK"
          onBack={() => setView(marketplaceReturnView)}
          onSelect={(gk) => {
            setSelectedGk(gk as Goalkeeper);
            setView(marketplaceReturnView);
          }}
        />;
      case 'MARKETPLACE_REF':
        return <Marketplace
          type="REF"
          onBack={() => setView(marketplaceReturnView)}
          onSelect={(ref) => {
            setSelectedRef(ref as Referee);
            setView(marketplaceReturnView);
          }}
        />;
      case 'MY_LISTINGS':
        return <MyListings onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'LISTING_DETAILS':
        return <ListingDetails onBack={() => setView('MY_LISTINGS')} />;
      case 'BOOKING_ADDONS':
        return <BookingAddons
          onBack={() => setView('PITCH_DISCOVERY')}
          selectedGk={selectedGk}
          selectedRef={selectedRef}
          onRemoveGk={() => setSelectedGk(null)}
          onRemoveRef={() => setSelectedRef(null)}
          onNavigate={(newView) => {
            if (newView === 'MARKETPLACE_GK' || newView === 'MARKETPLACE_REF') {
              setMarketplaceReturnView('BOOKING_ADDONS');
            }
            setView(newView);
          }}
          onContinue={(total) => {
            setAddOnTotal(total);
            setView('PAYMENT');
          }}
        />;
      case 'PAYMENT':
        return <PaymentScreen
          extraFee={addOnTotal}
          hasMotmCoupon={hasMotmCoupon}
          onBack={() => setView('BOOKING_ADDONS')}
          onUpgradeRequest={() => setView('PREMIUM')}
          onViewTicket={() => setView('MATCH_TICKET')}
        />;
      case 'MY_TEAM':
        return <MyTeam onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'STUDIO':
        return <Studio onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'PROFILE':
        return <ProfileScreen
          role={role || UserRole.PLAYER}
          onBack={() => setView('DASHBOARD')}
          onNavigate={(v) => setView(v)}
          onOpenDiaryEntry={(id) => {
            setSelectedDiaryId(id);
            setView('MATCH_DIARY_DETAIL');
          }}
          isPro={isUserPro}
        />;
      case 'WALLET':
        return <WalletScreen
          onBack={() => {
            const ret = useAppStore.getState().walletReturnView;
            useAppStore.getState().setWalletInitialTab('MAIN');
            setView(ret ?? 'DASHBOARD');
          }}
        />;
      // MATCH_LOBBY kaldırıldı — tüm işlemler MatchJoin'de yapılıyor
      case 'OPPONENT_FINDER':
        return <OpponentFinder onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'MATCH_CALENDAR':
        return <MatchCalendar onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'MATCH_DIARY_DETAIL':
        return <MatchDiaryDetail
          diaryId={selectedDiaryId}
          onBack={() => setView('PROFILE')}
        />;

      case 'SETTINGS':
        return <SettingsScreen onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'VOTING':
        return <VotingScreen onBack={() => setView('DASHBOARD')} onComplete={() => setView('MOTM_REVEAL')} />;
      case 'MOTM_REVEAL':
        return <MotmReveal
          onClaim={() => {
            setHasMotmCoupon(true);
            setView('DASHBOARD');
          }}
          onBack={() => setView('DASHBOARD')}
        />;
      case 'OYNA_TV':
        return <OynaTv onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      case 'MATCH_DISCOVERY':
        return <MatchDiscovery
          onBack={() => setView('DASHBOARD')}
          onSelect={(match) => {
            setSelectedMatch(match);
            setMatchJoinReturnView('MATCH_DISCOVERY');
            setView('MATCH_JOIN');
          }}
        />;
      case 'MATCH_JOIN':
        return <MatchJoin
          match={selectedMatch}
          onBack={() => setView(matchJoinReturnView)}
          onJoin={() => setView('DASHBOARD')} // Kadro kaydından sonra Dashboard'a dön
        />;
      case 'PREMIUM':
        return <PremiumScreen
          onBack={() => setView('DASHBOARD')}
          onUpgrade={() => {
            setIsUserPro(true);
            setView('PROFILE');
          }}
        />;
      case 'CHAT':
        return <ChatScreen 
          targetName={chatTarget?.name} 
          targetRole={chatTarget?.role} 
          targetAvatar={chatTarget?.avatar} 
          onBack={() => setView('MATCH_DISCOVERY')} 
        />;
      case 'MATCH_TICKET':
        return <MatchTicket onBack={() => setView('DASHBOARD')} />;
      case 'SCOUT_DASHBOARD':
        return <ScoutDashboard onBack={() => setView('PROFILE')} />;
      case 'POST_MATCH':
        return <PostMatchReport onBack={() => setView('PROFILE')} />;
      case 'TEAM_BUILDER':
        return <TeamBuilder onBack={() => setView('PROFILE')} />;
      case 'COMMUNITY_VIEW':
        return <CommunityView
          onBack={() => setView('DASHBOARD')}
          onNavigate={(v) => setView(v)}
          community={{ id: 'c1', name: 'Boğaziçi Üniversitesi', domain: '@boun.edu.tr', memberCount: 1250, activeMatches: 12, isVerified: true }}
          currentUser={{ id: 'u1', name: 'Ahmet', email: 'ahmet@boun.edu.tr', roles: [], communities: ['c1'], fairPlayScore: 100 }}
        />;
      case 'TEAM_CREATOR':
        return <TeamCreator
          onBack={() => setView('PROFILE')}
          onComplete={async (teamData) => {
            try {
              await useAppStore.getState().createTeam(teamData);
              setView('MY_TEAM');
            } catch (error) {
              console.error('Takım oluşturulamadı:', error);
              setView('PROFILE');
            }
          }}
          communities={[{ id: 'c1', name: 'Boğaziçi Üniversitesi', domain: '@boun.edu.tr', memberCount: 1250, activeMatches: 12, isVerified: true }]}
        />;
      case 'TRANSFER_CENTER':
        return <TransferCenter onBack={() => setView('COMMUNITY_VIEW')} />;
      case 'LEADERBOARDS':
        return <Leaderboards onBack={() => setView('COMMUNITY_VIEW')} />;
      case 'POST_MATCH_EVAL':
        return <PostMatchEval onBack={() => setView('COMMUNITY_VIEW')} onComplete={() => setView('COMMUNITY_VIEW')} />;
      case 'TOURNAMENT_BRACKET':
        return <TournamentBracket onBack={() => setView('COMMUNITY_VIEW')} />;
      case 'COMMUNITY_ADMIN_DASHBOARD':
        return <CommunityAdminDashboard onBack={() => setView('COMMUNITY_VIEW')} />;
      case 'MATCH_CREATE':
        return <MatchCreate onBack={() => setView('DASHBOARD')} onNavigate={(v) => setView(v)} />;
      default:
        return <SplashScreen onStart={() => setView('AUTH')} />;
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
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.995 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`w-full h-full absolute inset-0 overflow-y-auto custom-scrollbar ${showBottomNav ? 'pb-safe-nav' : ''}`}
        >
          <Suspense fallback={<ViewLoader />}>
            {renderView()}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showBottomNav && (
          <BottomNav currentView={view} onNavigate={setView} />
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
                setView('ADMIN_PANEL');
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
