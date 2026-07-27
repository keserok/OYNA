import React, { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRole, AppView, MatchListing, Goalkeeper, Referee, Match } from './types';
import { auth, onAuthStateChanged, logout, handleAuthCallbackUrl } from './supabaseAuth';
import { supabase } from './supabaseClient';
import { useAppStore } from './store';
import { roleToLandingView, pickLandingRole, hasMultipleSwitchableRoles, normalizeRole } from './shared/roles';
import { setActiveRole } from './services/userService';
import { initPushNotifications, subscribeToInAppNotifications, clearPushToken, handleDeepLink } from './notifications/pushService';
import { Capacitor } from '@capacitor/core';
import { fetchNotificationPreferences } from './notifications/notificationPreferences';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from './services/socialService';
import { initKeyboardManager } from './services/keyboardManager';
import { identifyUser, resetUser, trackEvent, captureException } from './utils/observability';
import PendingVerificationView from './views/PendingVerificationView';
import { PAGE_TRANSITION } from './components/common/motion';
import OfflineBanner from './components/OfflineBanner';
import { GlobalToast, showToast } from './components/common/GlobalToast';
import SignupGate from './components/common/SignupGate';
import { Spinner } from './components/ui/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

// Eagerly loaded for immediate display (yalnız ilk boyanan ekranlar)
import SplashScreen from './views/SplashScreen';
import AuthScreen from './views/AuthScreen';
import { isOnboardingEnabled } from './views/onboarding/onboardingShared';
import { recordUserConsents } from './services/consentService';

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
// F4.2: MatchCalendar kaldırıldı — hiçbir navigasyon gitmiyordu; tüm işlevleri
// MyMatchesHub + MatchDiscovery + Dashboard'da zaten var (içinde sahte pravatar
// avatarları ve negatif sayaç kalıntısı da vardı).
const AdminPanel = lazy(() => import('./views/AdminPanel'));
// F4.2: TeamBuilder kaldırıldı — erişilemezdi; OVR-dengeleme çıktısı hiçbir
// yere yazılmıyordu (salt-görsel hesap makinesi).
const SocialView = lazy(() => import('./views/SocialView'));
const FriendAddView = lazy(() => import('./views/social/FriendAddView'));
const PostMatchEval = lazy(() => import('./views/PostMatchEval'));
const MatchCreate = lazy(() => import('./views/MatchCreate'));
const MyMatchesHub = lazy(() => import('./views/MyMatchesHub'));
const OwnerPanel = lazy(() => import('./views/OwnerPanel'));
const ServiceDashboard = lazy(() => import('./views/ServiceDashboard'));
const PartnerOnboarding = lazy(() => import('./views/PartnerOnboarding'));
const Onboarding = lazy(() => import('./views/Onboarding'));
const GuardianConsentChild = lazy(() => import('./views/GuardianConsentChild'));
const GuardianConsentForm = lazy(() => import('./views/GuardianConsentForm'));
const ServiceApplication = lazy(() => import('./views/ServiceApplication'));
const QRScannerView = lazy(() => import('./views/QRScannerView'));
const MatchesView = lazy(() => import('./views/MatchesView'));
const LegalScreen = lazy(() => import('./views/LegalScreen'));
const MessagesView = lazy(() => import('./views/MessagesView'));
import { BottomNav } from './components/BottomNav';
const RoleSwitcher = lazy(() => import('./components/RoleSwitcher'));

// Loading fallback component
const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0A0E14]">
    <Spinner size={48} thickness={4} />
  </div>
);

const App: React.FC = () => {
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [verificationNote, setVerificationNote] = React.useState<string | null>(null);
  // Oturum geri yüklemesi ilk kez çözüldü mü? (Splash otomatik geçişi bunu bekler)
  const [authResolved, setAuthResolved] = React.useState(false);
  // Alt bar kaydırmaya duyarlı: aşağı kaydırınca gizlenir, yukarı kaydırınca
  // veya listenin başına dönünce geri gelir. Kaydırma iç içe konteynerlerde
  // olabildiğinden (scroll olayları kabarcıklanmaz) capture fazında dinlenir;
  // son konumlar eleman başına tutulur.
  const [navHidden, setNavHidden] = React.useState(false);
  const navScrollMemo = React.useRef(new WeakMap<Element, number>());
  const handleNavScrollCapture = React.useCallback((e: React.UIEvent<HTMLElement>) => {
    const t = e.target as Element | null;
    if (!(t instanceof HTMLElement)) return;
    // Yatay şeritleri ve kaydırılamayan elemanları atla
    if (t.scrollHeight - t.clientHeight < 60) return;
    const y = t.scrollTop;
    const prev = navScrollMemo.current.get(t) ?? y;
    navScrollMemo.current.set(t, y);
    const delta = y - prev;
    if (y <= 32) { setNavHidden(false); return; }
    if (delta > 8) setNavHidden(true);
    else if (delta < -8) setNavHidden(false);
  }, []);
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
    navOverlayOpen,
  } = useAppStore();

  // Görünüm değişince alt bar her zaman görünür başlasın; kalmış overlay
  // bayrağı da temizlensin (asıl temizlik görünümün kendi unmount'unda).
  React.useEffect(() => {
    setNavHidden(false);
    useAppStore.getState().setNavOverlayOpen(false);
  }, [view]);

  useEffect(() => {
    // Normal akış: her zaman SPLASH'ten başla, auth state'e göre yönlendir.
    resetNavigation('SPLASH');
  }, []);

  const initApp = useAppStore(s => s.initApp);
  const isHydrated = useAppStore(s => s.isHydrated);
  const loadDegraded = useAppStore(s => s.loadDegraded);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // MOB-S2: native klavye yöneticisi — alanlar klavye arkasında kalmaz.
  useEffect(() => initKeyboardManager(), []);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // Gerçek oturum açıldı → misafir modu biter
          useAppStore.getState().setIsGuest(false);
          const selectProfile = () => supabase
            .from('profiles')
            .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email, full_name, avatar_url')
            .eq('id', user.uid)
            .single();
          let { data: profile, error: profileErr } = await selectProfile();
          // A2: geçici okuma hatasını (ağ/timeout/RLS) "kayıt yok" ile KARIŞTIRMA.
          // Gerçek "satır yok" yalnız PGRST116; diğer hatalarda bir kez daha dene.
          if (!profile && profileErr && profileErr.code !== 'PGRST116') {
            await new Promise((r) => setTimeout(r, 800));
            ({ data: profile, error: profileErr } = await selectProfile());
          }

          // KA-4 (mevcut-kullanıcı koruması): `.single()` geçici/boş yanıtta PGRST116
          // ("satır yok") üretebilir → mevcut sağlayıcı yanlışlıkla "yeni kullanıcı"
          // sanılıp PLAYER'a düşürülür (role + roles sıfırlanır = VERİ KAYBI). Satır-yok
          // sinyalinde, maybeSingle ile bir kez daha YETKİLİ bak (0 satırı temiz null
          // döndürür, PGRST116 üretmez). Satır varsa mevcut kullanıcıdır → downgrade yok.
          if (!profile && (!profileErr || profileErr.code === 'PGRST116')) {
            const { data: recheck } = await supabase
              .from('profiles')
              .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email, full_name, avatar_url')
              .eq('id', user.uid)
              .maybeSingle();
            if (recheck) profile = recheck;
          }

          if (!profile && profileErr && profileErr.code !== 'PGRST116') {
            // Hâlâ hata → mevcut kullanıcıyı ASLA "yeni kayıt" sanıp PLAYER'a
            // düşürme/onboarding'e atma. Oturumu koru, açıkla, çık.
            captureException(profileErr, { where: 'onAuthStateChanged.profileFetch' });
            showToast('Profil bilgilerin şu an yüklenemedi. Bağlantını kontrol edip tekrar dene.');
          } else if (!profile) {
            // ─── YENİ KULLANICI (kayıt) — ama önce KESİN doğrula ──────────────
            // Yeni model: KAYIT OLAN HERKES OYUNCU. Kaleci/Hakem/Tesis rolleri
            // sonradan Profil'den opt-in başvuru + admin onayı ile eklenir; kayıt
            // öncesinde rol seçimi yoktur.
            const fallbackName = user.displayName
              || (user.email ? user.email.split('@')[0] : '')
              || (user.phone ? user.phone : '');
            // KA-4: `.insert()` hata FIRLATMAZ, `{error}` döndürür (eski try/catch
            // etkisizdi). Sonuç, "yeni mi mevcut mu" sorusunun KESİN kaynağıdır:
            // başarılı insert = gerçekten yeni; çakışma (23505) = satır ZATEN VAR =
            // MEVCUT kullanıcı (yukarıdaki okumalar geçici boş dönmüş) → PLAYER'a
            // DÜŞÜRME (role+roles sıfırlama = veri kaybı), mevcut olarak yönlendir.
            const { error: insertError } = await supabase.from('profiles').insert({
              id: user.uid,
              email: user.email ?? null,
              phone: user.phone ?? null,
              full_name: fallbackName,
              role: UserRole.PLAYER,
              roles: [UserRole.PLAYER],
              verification_status: 'approved',
              last_active_at: new Date().toISOString(),
            });
            const isConflict = !!insertError && (insertError.code === '23505'
              || /duplicate key|already exists/i.test(insertError.message || ''));
            if (isConflict) {
              // 23505 = satır KESİN var → kullanıcı mevcut. Profili çek; okuma da
              // başarısız olsa bile ASLA yeni-kullanıcı downgrade'ine düşme.
              const { data: after } = await selectProfile();
              if (after) profile = after; // aşağıdaki MEVCUT-kullanıcı bloğuna düşer
            } else if (insertError) {
              console.error('[App] Error creating user profile:', insertError);
              showToast('Profilin oluşturulurken bir sorun oluştu. Lütfen tekrar giriş yapmayı dene.');
            }

            if (!profile && isConflict) {
              // Mevcut kullanıcı ama profil şu an okunamadı (ağ) → downgrade YOK;
              // oturumu koru, açıkla. Bir sonraki auth olayı/yenileme düzeltir.
              showToast('Profil bilgilerin şu an yüklenemedi. Bağlantını kontrol edip tekrar dene.');
            } else if (!profile) {
              // ── GERÇEKTEN yeni kullanıcı (insert başarılı) ──
              // KVKK Aydınlatma + Kullanıcı Sözleşmesi kabulünü sunucuya
              // denetlenebilir şekilde kaydet — TÜM kayıt yolları (e-posta +
              // Google/Apple) buradan geçer. best-effort: akışı bloke etmez.
              recordUserConsents(['KVKK', 'TERMS']).catch(() => {});
              setRole(UserRole.PLAYER);
              useAppStore.getState().setMyRoles([UserRole.PLAYER]);
              identifyUser(user.uid, { role: UserRole.PLAYER, is_admin: false });
              trackEvent('user_registered', { role: UserRole.PLAYER });
              // Yeni kayıt → oyuncu onboarding'i (kayıt SONRASI, kullanıcı
              // girişliyken): ad soyad ön-dolu gelir, veriler doğrudan DB'ye
              // yazılır. Onboarding kendi konum adımını içerdiğinden ayrı
              // LOCATION_PROMPT'a gerek yok. Kill-switch kapalıysa eski
              // bağlamsal konum istemine düşülür.
              resetNavigation(isOnboardingEnabled() ? 'ONBOARDING' : 'LOCATION_PROMPT');
            }
          }

          if (profile) {
            // ─── MEVCUT KULLANICI (giriş) — çakışma-kurtarması da buraya düşer ─
            const primaryRole = (profile.role as UserRole) || UserRole.PLAYER;
            // FAZ 7.5: sahip olunan roller — çoklu rol geçişi + açılış rolü seçimi.
            // Güvenlik payı: roles ∪ aktif rol. Eski owner hesaplarında profiles.roles
            // 'OWNER'ı içermeyebilir; birleşim sayesinde açılış yine doğru panele düşer.
            const ownedRoles = Array.from(new Set<string>([
              ...(Array.isArray(profile.roles) ? (profile.roles as string[]) : []),
              primaryRole,
            ]));
            useAppStore.getState().setMyRoles(ownedRoles);

            // KN-2: giriş yapan oyuncunun gerçek kimliğini store'a yaz — maç
            // akışları admin-only adminUsers yerine bunu kullanır ("Oyuncu" +
            // rastgele pravatar fallback'i ortadan kalkar).
            useAppStore.getState().setCurrentUserProfile({
              id: user.uid,
              name: (profile.full_name as string) || user.displayName || 'Oyuncu',
              avatar: (profile.avatar_url as string) || user.photoURL || '',
              rating: 0, // puan ayrı kaynaktan; burada kritik değil (join fallback'i 4.5)
            });

            // onAuthStateChanged HER auth olayında tetiklenir (SIGNED_IN +
            // TOKEN_REFRESHED + yeniden INITIAL_SESSION…). Açılış-rolü OVERRIDE'ı
            // YALNIZ uygulamaya giriş anında (splash/auth/…) uygulanır. Aksi halde
            // arka plan token yenilemesi (≈saatlik / sekme odağı), kullanıcının
            // uygulama-içi "Rol Değiştir" ile geçtiği rolü sessizce geri alırdı.
            const currentView = useAppStore.getState().view;
            const isEntering = ['SPLASH', 'AUTH', 'ROLE_SELECTION', 'PENDING_VERIFICATION'].includes(currentView);
            // Admin koruması: aktif rol GEÇİLEBİLİR bir rol değilse (ADMIN/SUPER_ADMIN
            // → normalizeRole null döner), açılış-rolü override'ı UYGULANMAZ. Aksi
            // halde pickLandingRole PLAYER'a düşer ve setActiveRole admin rolünü
            // PLAYER'a yazarak yetki kaybına yol açardı. Bu roller admin panelinden yönetilir.
            const canOverride = isEntering && normalizeRole(primaryRole) !== null;
            // 1A — "her zaman kendi paneli": GİRİŞTE sağlayıcı/tesis rolü varsa aktif
            // rol otomatik ona alınır (öncelik OWNER>REF>GK>PLAYER). Oturum içindeki
            // yenilemede (ve admin rolünde) aktif rol DB'dekiyle senkron kalır — override yok.
            const landingRole = canOverride ? pickLandingRole(ownedRoles, primaryRole) : primaryRole;
            setRole(landingRole);
            // FAZ 7.4: analitik + hata bağlamına kullanıcıyı bağla (env yoksa no-op)
            identifyUser(user.uid, { role: landingRole, is_admin: !!profile.is_admin });

            // Aktif rol (profiles.role) açılış rolünden farklıysa (yalnız girişte, admin
            // hariç) sunucuda da eşitle → rol-bazlı sorgu/segment/RLS tutarlı kalır.
            // landingRole daima roles[] içindedir, RPC güvenle geçer. En iyi çaba:
            // hata olsa bile bu oturumun yönlendirmesini BLOKLAMAZ.
            if (canOverride && landingRole !== primaryRole) {
              setActiveRole(landingRole).catch((e) =>
                console.warn('[App] Açılış rolü kalıcılaştırılamadı:', e));
            }

            // Presence heartbeat (Spec F34): ön planda ~2,5 dk'da bir +
            // görünürlüğe dönüşte last_active_at yazılır; arka planda durur.
            // (Tek seferlik girişte-yazma modelinin halefi — gösterge dürüstleşir.)
            startPresenceHeartbeat(user.uid);

            // Oturum kalıcı → tekrar giriş YOK. Yalnız girişte yönlendir; oturum
            // içindeki token yenilemesi kullanıcıyı bulunduğu ekrandan KOPARMAZ.
            if (isEntering) {
              // ─── GHOST MODE DEEP-LINK YETKİLENDİRME KONTROLÜ ─────────────────
              // Sadece profiles.is_admin=true veya SUPER_ADMIN yetkisine sahip kullanıcılar
              // başka kullanıcıları taklit edebilir. Yetkisiz girişler engellenir.
              const params = new URLSearchParams(window.location.search);
              const ghostId = params.get('ghost');
              if (ghostId) {
                const isAdmin = profile.is_admin === true ||
                                primaryRole === UserRole.SUPER_ADMIN ||
                                (Array.isArray(profile.roles) && profile.roles.includes(UserRole.SUPER_ADMIN));
                if (isAdmin) {
                  const ghostName = params.get('name') || 'Kullanıcı';
                  void (async () => {
                    const { fetchProfileById, logImpersonation } = await import('./admin-panel/services/adminService');
                    try {
                      await logImpersonation(ghostId);
                    } catch (e) {
                      console.error('[Ghost Mode] Impersonation audit log failed:', e);
                    }
                    const ghostProfile = await fetchProfileById(ghostId);
                    setOriginalRole(landingRole);
                    setImpersonatedUser(ghostProfile ?? {
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
                  return; // Normal yönlendirme zincirini atla
                } else {
                  console.warn('[Security Warning] Normal user tried to access ghost mode:', user.uid);
                  showToast('Ghost Mode için admin yetkiniz bulunmamaktadır.');
                  window.history.replaceState({}, '', window.location.pathname);
                }
              }

              // KA-1/KA-2: Sağlayıcı (kaleci/hakem) rolü ONAYLANMADIYSA panele
              // DEĞİL bekleme/red ekranına yönlendir. verification_status SELECT
              // ediliyordu ama landing'de hiç okunmuyordu → onaysız/red sağlayıcı
              // doğrudan SERVICE_DASHBOARD'a düşüp red notunu/"Tekrar Başvur"u hiç
              // görmüyordu (takılı kalırdı). Bu kapı token yenilemesinde de çalışır
              // (isEntering PENDING_VERIFICATION'ı içerir) → ~1 saat sonra gelen
              // arka-plan yenilemesi onaysız kullanıcıyı panele bounce edemez.
              const providerRole = landingRole === UserRole.GOALKEEPER || landingRole === UserRole.REFEREE;
              const vstatus = (profile.verification_status as string | null) ?? null;
              if (providerRole && (vstatus === 'pending' || vstatus === 'rejected')) {
                // Tekrar-başvuru akışının doğru rolü hedeflemesi için serviceAppRole'ü kur.
                useAppStore.getState().setServiceAppRole(landingRole);
                resetNavigation('PENDING_VERIFICATION');
              } else {
                resetNavigation(navigateBasedOnRole(landingRole));
              }
            }
          }
        } else {
          const prevView = useAppStore.getState().view;
          setRole(UserRole.PLAYER);
          // İlk açılış (oturum yok) SPLASH'te kalır; bir panelden ÇIKIŞ yapıldıysa
          // doğrudan giriş (AUTH) ekranına düşülür.
          resetNavigation(prevView === 'SPLASH' ? 'SPLASH' : 'AUTH');
          resetUser(); // FAZ 7.4: çıkışta analitik/hata kullanıcı bağlamını temizle
          useAppStore.getState().setCurrentUserProfile(null); // KN-2: kimlik temizlenir
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
    let setupForUid: string | null = null;

    const setupPush = async (uid: string) => {
      // 1. Kullanıcı tercihlerini Supabase'den çek
      const prefs = await fetchNotificationPreferences(uid);
      setNotificationPreferences(prefs);

      // 2. Capacitor Push başlat (native platformda)
      // F3f: rozet sayacını gerçek okunmamış sayısıyla tohumla (oturum-yerel
      // sayaç yalnız Bildirimler ekranı açıkken artıyordu — rozetler yalan
      // söylüyordu: ya hep yanık ya hep sönük).
      import('./services/notificationService')
        .then(m => m.fetchUnreadCount())
        .then(n => useAppStore.getState().setUnreadNotificationsCount(n))
        .catch(() => {});

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
          // Per-uid kurulum yalnız BİR kez — TOKEN_REFRESHED / tab-focus'ta
          // initPushNotifications + realtime kanalı tekrar kurulmasın (leak).
          if (setupForUid === user.uid) return;
          setupForUid = user.uid;
          if (unsubscribeRealtime) unsubscribeRealtime(); // varsa eski kanalı kapat
          setupPush(user.uid);
          useAppStore.getState().loadMyTeams();
        } else {
          // Çıkış yapılınca token’ı temizle
          setupForUid = null;
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
        void (async () => {
          // OAuth dönüşü (oyna://auth-callback?code=...) — kodu oturuma bozdur;
          // navigasyonu onAuthStateChanged üstlenir. Diğer deep link'lere gitmez.
          if (await handleAuthCallbackUrl(url)) return;
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
        })();
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
  // Aktif role göre açılış ekranı — tek kaynak (shared/roles.roleToLandingView).
  // PLAYER→Dashboard, GK/REF→ServiceDashboard, OWNER→OwnerPanel.
  const navigateBasedOnRole = (currentRole: UserRole | null): AppView =>
    roleToLandingView(currentRole);

  // Merkezi çıkış: gerçekten oturumu kapatır; onAuthStateChanged(null) tetiklenir ve
  // kullanıcı giriş (AUTH) ekranına düşer. Tüm arayüzlerdeki 'Çıkış Yap' buna bağlanır.
  const handleLogout = React.useCallback(async () => {
    try {
      await logout();
    } catch (e) {
      console.error('[App] Çıkış hatası:', e);
    }
    resetNavigation('AUTH');
  }, [resetNavigation]);

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
          // Yeni model: onboarding artık kayıt SONRASINDA. Oturum yoksa
          // doğrudan Giriş/Kayıt ekranına; oturum varsa role göre panele.
          // Rolü store'dan TAZE oku (kapanıştaki `role` eski/PLAYER olabilir).
          if (!auth.currentUser) {
            resetNavigation('AUTH');
            return;
          }
          resetNavigation(navigateBasedOnRole(useAppStore.getState().role));
        }} />;
      case 'ONBOARDING':
        // Kayıt sonrası (girişli) onboarding. Bitince (tamamlandı VEYA atlandı)
        // goBack: profil "Tamamla" ile gelindiyse profile döner; yeni kayıt
        // akışında yığın boş → role göre panele (Dashboard) düşer.
        return <Onboarding
          onComplete={() => goBack(navigateBasedOnRole(useAppStore.getState().role))}
        />;
      case 'AUTH':
        return <AuthScreen role={role} onSuccess={() => resetNavigation(navigateBasedOnRole(role))} onBack={() => goBack('SPLASH')} />;
      case 'GUARDIAN_CHILD':
        return <GuardianConsentChild onBack={() => goBack('SETTINGS')} onGoVeliForm={() => navigateTo('GUARDIAN_FORM')} />;
      case 'GUARDIAN_FORM':
        return <GuardianConsentForm onBack={() => goBack('SETTINGS')} />;
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
          onApproved={async () => {
            // KA-3 + main birleşimi: onay geldiğinde DOĞRU panele git. In-session
            // başvuruda store.role hâlâ PLAYER olabilir (serviceAppRole onaylanan
            // sağlayıcı rolünü taşır). Rol listesine ekle + sunucuda da kalıcılaştır
            // (setActiveRole) ki RoleSwitcher/segment/RLS tutarlı kalsın.
            const approvedRole = serviceAppRole || role;
            setRole(approvedRole);
            useAppStore.getState().setMyRoles(
              Array.from(new Set([...(myRoles || []), approvedRole]))
            );
            try { await setActiveRole(approvedRole); } catch { /* yine de yönlendir */ }
            resetNavigation(navigateBasedOnRole(approvedRole));
          }}
          onLogout={() => resetNavigation('AUTH')}
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
            onLogout={handleLogout}
          />
        );
      case 'SERVICE_DASHBOARD':
        return <ServiceDashboard role={role!} onBack={() => goBack(navigateBasedOnRole(role))} onNavigate={(v) => navigateTo(v)} onLogout={handleLogout} />;
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
          pitchId={useAppStore.getState().ownerActivePitchId}
          onResult={(res) => {
            setMatches(prev => [res, ...prev]);
          }}
        />;
      case 'MATCHES':
        return <MatchesView onBack={() => goBack('OWNER_PANEL')} matches={matches} />;
      case 'MY_MATCHES':
        return <MyMatchesHub onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      case 'DASHBOARD':
        return <Dashboard
          onNavigate={(newView) => navigateTo(newView)}
          onBack={() => goBack(navigateBasedOnRole(role))}
        />;
      case 'PITCH_DISCOVERY':
        return <PitchDiscovery
          onBack={() => goBack('DASHBOARD')}
          onNavigate={(v) => navigateTo(v as AppView)}
        />;
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
          onCreateMatch={() => navigateTo('MATCH_CREATE')}
        />;
      case 'MARKETPLACE_REF':
        return <Marketplace
          type="REF"
          onBack={() => goBack('DASHBOARD')}
          onSelect={(ref) => {
            setSelectedRef(ref as Referee);
            goBack('DASHBOARD');
          }}
          onCreateMatch={() => navigateTo('MATCH_CREATE')}
        />;
      case 'PAYMENT':
        return <PaymentScreen onBack={() => goBack('DASHBOARD')} />;
      case 'MY_TEAM':
        // Birleşik Takım Detayı — kimlik store.selectedTeamId ile taşınır (Spec §3.8)
        return <TeamDetailView onBack={() => goBack('SOCIAL')} onNavigate={(v) => navigateTo(v)} />;
      case 'STUDIO':
        return (
          <ErrorBoundary
            onBack={() => goBack('DASHBOARD')}
            title="Taktik stüdyoda bir sorun oluştu."
            message="Çalışman kaydedilmemiş olabilir. Ana sayfaya dönüp tekrar deneyebilirsin."
            backLabel="Ana Sayfaya Dön"
          >
            <Studio onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />
          </ErrorBoundary>
        );
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
            useAppStore.getState().setLobbyMode('DISCOVER');
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
        {/* F4.1: bilet artık Maçlarım'daki rezervasyon kartından açılıyor */}
        return <MatchTicket onBack={() => goBack('MY_MATCHES')} />;
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
        {/* F2.1: ekran artık Maçlarım'dan (ve eval deep-link'inden) açılıyor;
            eski SOCIAL dönüşü yanlış bağlamdı. */}
        return <PostMatchEval onBack={() => goBack('MY_MATCHES')} onComplete={() => goBack('MY_MATCHES')} />;
      case 'MATCH_CREATE':
        return <MatchCreate onBack={() => goBack('DASHBOARD')} onNavigate={(v) => navigateTo(v)} />;
      default:
        return <SplashScreen ready={authResolved} onStart={() => navigateTo('AUTH')} />;
    }
  };

  const showBottomNav = ['DASHBOARD', 'MATCH_DISCOVERY', 'SOCIAL', 'STUDIO', 'PITCH_DISCOVERY', 'PROFILE', 'MY_MATCHES'].includes(view);

  return (
    <div className="h-full bg-[#0A0E14] text-white font-['Inter'] relative overflow-hidden">
      <OfflineBanner />
      {loadDegraded && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500/90 backdrop-blur-sm text-[#0A0E14] text-[12px] font-bold px-4 py-2 pt-safe-2 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate">Bağlantı zayıf — bazı veriler yüklenemedi.</span>
          <button
            onClick={() => useAppStore.getState().retryInitialLoad()}
            className="shrink-0 bg-[#0A0E14]/85 text-white rounded-md px-2.5 py-1 font-extrabold active:scale-95 transition-transform"
          >
            Yeniden dene
          </button>
        </div>
      )}
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
          onScrollCapture={showBottomNav ? handleNavScrollCapture : undefined}
          className={`w-full h-full absolute inset-0 overflow-y-auto overscroll-contain custom-scrollbar ${
            // MY_MATCHES kendi içinde kaydırır ve bar payını kendisi ayırır →
            // dış dolgu ölü bant yaratmasın, kartlar barın altından aksın.
            view === 'MY_MATCHES' ? '' : showBottomNav ? 'pb-safe-nav' : 'pb-safe'
          }`}
        >
          {/* A5: Görünüm-seviyesi hata sınırı. Bir görünüm çökse de (ör. lazy
              chunk ağ hatası, render exception) uygulama kabuğu + alt menü ayakta
              kalır; kullanıcı beyaz ekranda kilitlenmez. fullScreen={false} → yalnız
              içerik alanını kaplar. Üst motion.div key={view} olduğundan sınır her
              görünüm değişiminde yeniden kurulur (otomatik sıfırlama). "Geri Dön":
              yığında önceki görünüm varsa oraya döner (taze sınır kurulur). AÇILIŞ
              görünümü çöktüyse (yığın boş → goBack aynı yere döner) React.lazy reddi
              önbellekte olduğundan yeniden render kurtarmaz; ayrıca GK/hakem/tesis
              açılışları (SERVICE_DASHBOARD/OWNER_PANEL) alt menüsüzdür → başka çıkış
              yoktur. Bu durumda tam yeniden yükleme chunk'ı yeniden çeker + geçici
              bozuk store durumunu sıfırlar (gerçek kurtarma yolu). */}
          <ErrorBoundary
            fullScreen={false}
            title="Bu bölüm yüklenemedi"
            message="Bağlantı ya da geçici bir sorun olabilir. Geri dönüp tekrar deneyebilirsin."
            onBack={() => {
              // Yığın boşsa (açılış görünümü) geri gidilecek ekran yok ve chunk
              // reddi önbellektedir → yeniden yükleme tek gerçek kurtarma.
              if (useAppStore.getState().navigationStack.length === 0) {
                if (typeof window !== 'undefined') window.location.reload();
                return;
              }
              goBack(navigateBasedOnRole(role));
            }}
          >
            <Suspense fallback={<ViewLoader />}>
              {renderView()}
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showBottomNav && (
          <BottomNav currentView={view} onNavigate={resetNavigation} hidden={navHidden || navOverlayOpen} />
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
        {isRoleSwitcherOpen && hasMultipleSwitchableRoles(myRoles) && (
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
