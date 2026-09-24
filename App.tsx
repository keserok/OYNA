import React, { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { UserRole, AppView, MatchListing, Goalkeeper, Referee } from './types';
import { auth, onAuthStateChanged, logout, handleAuthCallbackUrl, cikisIstemliMiVeTuket } from './supabaseAuth';
import { supabase } from './supabaseClient';
import { useAppStore } from './store';
import { bolgeyiBildir } from './utils/olcum';
import { roleToLandingView, pickLandingRole, hasMultipleSwitchableRoles, normalizeRole } from './shared/roles';
import { setActiveRole } from './services/userService';
import { getMatchDetails } from './services/matchService';
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
import PushIzniModal from './components/common/PushIzniModal';
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
const RahatMatchLobby = lazy(() => import('./views/match/RahatMatchLobby'));
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
// MatchLobby kaldırıldı — MatchJoin artık tek ekran
// OpponentFinder (Rakip Bul haritası) kaldırıldı — rakip yalnız maç oluştur'dan davet edilir
// F4.2: MatchCalendar kaldırıldı — hiçbir navigasyon gitmiyordu; tüm işlevleri
// MyMatchesHub + MatchDiscovery + Dashboard'da zaten var (içinde sahte pravatar
// avatarları ve negatif sayaç kalıntısı da vardı).
// [PANEL-AYRIMI] Uygulama içi YÖNETİM PANELİ ROTASI KALDIRILDI.
// Panel yalnız kendi sayfasından (admin.html) açılır. Böylece uygulamayı
// indiren birinin paketinde panel ekranlarına ait TEK SATIR kod bulunmaz;
// açılacak bir rota da yoktur. Sunucu tarafı ayrıca kapalıdır.
// F4.2: TeamBuilder kaldırıldı — erişilemezdi; OVR-dengeleme çıktısı hiçbir
// yere yazılmıyordu (salt-görsel hesap makinesi).
const SocialView = lazy(() => import('./views/SocialView'));
const FriendAddView = lazy(() => import('./views/social/FriendAddView'));
const PostMatchEval = lazy(() => import('./views/PostMatchEval'));
const MatchCreate = lazy(() => import('./views/MatchCreate'));
const MyMatchesHub = lazy(() => import('./views/MyMatchesHub'));
const OwnerPanel = lazy(() => import('./views/OwnerPanel'));
const ServiceDashboard = lazy(() => import('./views/ServiceDashboard'));
const Onboarding = lazy(() => import('./views/Onboarding'));
const GuardianConsentChild = lazy(() => import('./views/GuardianConsentChild'));
const GuardianConsentForm = lazy(() => import('./views/GuardianConsentForm'));
const ServiceApplication = lazy(() => import('./views/ServiceApplication'));
const QRScannerView = lazy(() => import('./views/QRScannerView'));
const LegalScreen = lazy(() => import('./views/LegalScreen'));
const MessagesView = lazy(() => import('./views/MessagesView'));
// Numara bağlama — yalnız Google/Apple ile girenler görür (tembel yüklenir).
import { BottomNav, TAB_IDS } from './components/BottomNav';
const RoleSwitcher = lazy(() => import('./components/RoleSwitcher'));

/**
 * IP-15 — misafirken başlanan işe geri dön.
 *
 * Yalnız OYUNCU açılışında uygulanır: tesis/hakem/kaleci hesabıyla giren biri
 * oyuncu maç lobisine bırakılmaz. Niyet yoksa `null` döner, çağıran normal
 * yönlendirmesini yapar.
 */
const niyetiTuket = async (
  landingRole: UserRole,
): Promise<{ view: AppView; matchId?: string } | null> => {
  if (landingRole !== UserRole.PLAYER) return null;
  const intent = useAppStore.getState().consumePendingIntent();
  if (!intent) return null;
  // Maç lobisine dönülüyorsa maç mağazada olmayabilir (sayfa yenilenmiş olabilir).
  if (intent.view === 'MATCH_JOIN' && intent.matchId && !useAppStore.getState().selectedMatch) {
    try {
      const m = await getMatchDetails(intent.matchId);
      if (m) useAppStore.getState().setSelectedMatch(m);
      else return null;   // maç silinmiş/erişilemez → normal yönlendirme
    } catch { return null; }
  }
  return intent;
};

// Bekleme ekranı. IP-11: tek başına dönen halka "bir şey oluyor" demiyordu;
// ne beklendiği yazılır ve 4 saniyeyi aşarsa sebebi söylenir. Ekran okuyucu
// için canlı bölge — yoksa görme engelli kullanıcı sessiz bir ekranda kalıyordu.
const ViewLoader = () => {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-screen bg-[#0A0E14]"
    >
      <Spinner size={48} thickness={4} />
      <p className="mt-4 text-[0.8125rem] font-bold text-white/60">Yükleniyor…</p>
      {slow && <p className="mt-1 text-[0.6875rem] text-white/50">Bağlantın yavaş olabilir.</p>}
    </div>
  );
};

const App: React.FC = () => {
  // D2: bildirim izni doğru anda istenir. setupPush kendini buraya kaydeder;
  // PushIzniModal onay verilince onu izinIste=true ile çağırır.
  const pushKurulumRef = React.useRef<((izinIste: boolean) => void) | null>(null);
  const [verificationNote, setVerificationNote] = React.useState<string | null>(null);
  // Oturum geri yüklemesi ilk kez çözüldü mü? (Splash otomatik geçişi bunu bekler)
  const [authResolved, setAuthResolved] = React.useState(false);
  // Alt bar kaydırmaya duyarlı: aşağı kaydırınca gizlenir, yukarı kaydırınca
  // veya listenin başına dönünce geri gelir. Kaydırma iç içe konteynerlerde
  // olabildiğinden (scroll olayları kabarcıklanmaz) capture fazında dinlenir;
  // son konumlar eleman başına tutulur.
  const [navHidden, setNavHidden] = React.useState(false);
  const navScrollMemo = React.useRef(new WeakMap<Element, number>());
  // Boş gün tuzağı (kurucu bildirimi, 26 Ağu 2026): kullanıcı dolu bir günde
  // aşağı kaydırıp barı gizliyor, sonra MAÇI OLMAYAN bir güne geçiyor. Boş
  // durum ekranı kaydırılamadığı için scroll olayı hiç doğmuyor ve bar
  // sonsuza dek gizli kalıyor — başka sekmeye geçilemiyor. Çözüm scroll'a
  // değil DOKUNUŞA bakar: bar gizliyken, kaydırılamayan bir yüzeyde dikeyde
  // belirgin bir parmak hareketi barı geri getirir. Kaydırılabilir yüzeyler
  // bilerek dışarıda — orada karar scroll dinleyicisinin, ikisi çelişmesin.
  const navTouchBasi = React.useRef<number | null>(null);
  const handleNavTouchStart = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    navTouchBasi.current = e.touches[0]?.clientY ?? null;
  }, []);
  const handleNavTouchMove = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!navHidden || navTouchBasi.current == null) return;
    const y = e.touches[0]?.clientY;
    if (y == null || Math.abs(y - navTouchBasi.current) < 24) return;
    // Dokunulan noktadan yukarı çık: kaydırılabilir bir ata var mı?
    let el = e.target as HTMLElement | null;
    let kaydirilabilir = false;
    while (el && el !== e.currentTarget) {
      if (el.scrollHeight - el.clientHeight >= 60) { kaydirilabilir = true; break; }
      el = el.parentElement;
    }
    if (!kaydirilabilir) { setNavHidden(false); navTouchBasi.current = null; }
  }, [navHidden]);
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

  // ÖLÇÜM · bölge etiketi. Huni "ilçeye göre" okunabilsin diye (prensip
  // 1.2/1.3 — ilçe bazlı doygunluk) her olay kullanıcının baktığı bölgeyle
  // işaretlenir. Ölçüm modülü store'u DOĞRUDAN okumaz (döngüsel bağımlılık
  // olurdu); bölge buradan bir kez bildirilir.
  useEffect(() => {
    const uygula = (b: { city?: string; district?: string | null } | null) =>
      bolgeyiBildir(b?.city ?? null, b?.district ?? null);
    uygula(useAppStore.getState().activeRegion);
    return useAppStore.subscribe((st, onceki) => {
      if (st.activeRegion !== onceki.activeRegion) uygula(st.activeRegion);
    });
  }, []);


  useEffect(() => {
    /**
     * AYNI OTURUM İÇİN İKİ KEZ KOŞMA (23 Ağustos 2026).
     *
     * SIGNED_IN artık İKİ kaynaktan gelebiliyor: supabase-js'in kendi olayı ve
     * bizim `oturumuDuyur()` duyurumuz (açılır pencere oturumu yazdığında
     * kütüphanenin sekmeler arası olayı gelmeyebiliyor — bkz. supabaseAuth).
     * İkisi birden gelirse aşağıdaki profil açılışı EŞ ZAMANLI iki kez koşar:
     * iki `insert`, iki yönlendirme kararı. Yarışı biri ONBOARDING'e, öteki
     * ana sayfaya götürebilir ve kullanıcı ekranın "zıpladığını" görür.
     *
     * Kilit uid başına: aynı kullanıcı için bir açılış koşarken ikincisi
     * sessizce düşer. Farklı kullanıcı (hesap değişimi) engellenmez.
     */
    let acilisKoşuyor: string | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (user, olay) => {
      if (user && acilisKoşuyor === user.uid) return;
      if (user) acilisKoşuyor = user.uid;
      try {
        if (user) {
          // Gerçek oturum açıldı → misafir modu biter
          useAppStore.getState().setIsGuest(false);
          // ─── GİRİŞ ANI ÖLÇÜSÜ, AĞ BEKLEMELERİNDEN ÖNCE ALINIR ───────────
          // Bu değer aşağıda "açılış rolü override'ı uygulansın mı" kararında
          // kullanılıyordu ve profil sorgusundan SONRA okunuyordu. Arada 2-4
          // ağ gidiş-dönüşü var; o sırada açılış ekranı kendi zamanlayıcısıyla
          // görünümü değiştirebiliyor ve ölçüm 'SPLASH' yerine başka bir şey
          // görüp giriş-sonrası yönlendirmeyi iptal ediyordu. Kullanıcı
          // oturumu açılmış hâlde giriş ekranında kalıyordu.
          const girisAninkiGorunum = useAppStore.getState().view;

          /**
           * GEÇERLİ OTURUM KAPININ DIŞINDA BIRAKILMAZ (22 Ağustos 2026).
           *
           * Bu geri çağrının başarı yolunda üç dal, profil okunamadığında
           * yalnız bir uyarı basıp çıkıyordu — hiçbir yönlendirme yapmadan.
           * Kullanıcı Google/Apple düğmesine GİRİŞ EKRANINDAN bastığı için
           * görünüm hâlâ 'AUTH'tı ve orada kalıyordu: sağlayıcı hesabı
           * onaylanmış, oturum açılmış, ama uygulama giriş ekranında duruyor.
           * Kurucunun ekran görüntüsüyle bildirdiği durum buydu.
           *
           * Kural: oturum geçerliyse kullanıcı İÇERİ ALINIR. Profil eksikse
           * varsayılan rolle girer ve bir sonraki auth olayında tazelenir;
           * onu dışarıda tutmak hiçbir hata için doğru cevap değildir.
           *
           * Kullanıcı zaten uygulamanın içindeyse (arka planda jeton
           * yenilemesi) hiçbir şey yapılmaz — o ekranı çalmak olurdu.
           */
          const icerideBirak = (): void => {
            const st = useAppStore.getState();
            const disarida = ['SPLASH', 'AUTH', 'ROLE_SELECTION'].includes(st.view);
            if (!disarida) return;
            resetNavigation(navigateBasedOnRole(st.role || UserRole.PLAYER));
          };
          const selectProfile = () => supabase
            .from('profiles')
            .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email, full_name, avatar_url, has_completed_onboarding')
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
              .select('role, roles, verification_status, verification_notes, is_admin, wallet_balance, phone, email, full_name, avatar_url, has_completed_onboarding')
              .eq('id', user.uid)
              .maybeSingle();
            if (recheck) profile = recheck;
          }

          if (!profile && profileErr && profileErr.code !== 'PGRST116') {
            // Hâlâ hata → mevcut kullanıcıyı ASLA "yeni kayıt" sanıp PLAYER'a
            // düşürme/onboarding'e atma. Oturumu koru, açıkla — VE İÇERİ AL.
            //
            // Bu dal eskiden yalnız uyarı basıp çıkıyordu: hiçbir yönlendirme
            // yapılmıyordu. Kullanıcı Google/Apple düğmesine GİRİŞ EKRANINDAN
            // bastığı için görünüm hâlâ 'AUTH'tı ve orada kalıyordu. Sağlayıcı
            // hesabı onaylanmış, oturum gerçekten açılmış, ama uygulama giriş
            // ekranında öylece duruyordu — kurucunun ekran görüntüsündeki
            // durumun ta kendisi. Geçerli oturumu kapının dışında bırakmak
            // hiçbir hata için doğru cevap değildir.
            captureException(profileErr, { where: 'onAuthStateChanged.profileFetch' });
            showToast('Profil bilgilerin şu an yüklenemedi. Bağlantını kontrol edip tekrar dene.');
            icerideBirak();
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
              // `name` ŞEMADA NOT NULL (eski kolon). Gönderilmediğinde insert
              // 23502 ile düşüyordu — 23505 DEĞİL. Böyle olunca aşağıdaki
              // çakışma dalı çalışmıyor, akış "gerçekten yeni kullanıcı"
              // sanıp profilsiz hâlde onboarding'e gidiyordu. Apple kimlik
              // jetonu ad İÇERMEZ (yalnız ilk girişte verir), yani bu yol
              // Apple ile girenler için kuraldı, istisna değil.
              name: fallbackName || 'Oyuncu',
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
              // Mevcut kullanıcı ama profil şu an okunamadı (ağ). Downgrade YOK
              // — ama kullanıcıyı GİRİŞ EKRANINDA DA BIRAKMA. Oturum geçerli;
              // onu dışarıda tutmak, "hesabımı onayladım ama uygulama beni
              // içeri almadı" demektir. Varsayılan rolle içeri al, profil
              // sonraki auth olayında tazelenir.
              showToast('Profil bilgilerin şu an yüklenemedi. Bağlantını kontrol edip tekrar dene.');
              icerideBirak();
            } else if (insertError && !isConflict) {
              // Insert başka bir sebeple düştü (ör. NOT NULL ihlali). Bu
              // kullanıcı "yeni" sayılıp ONBOARDING'e GÖNDERİLMEMELİ: profili
              // yok, onboarding'in yazacağı satır da yok. İçeri al ve söyle.
              icerideBirak();
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
            });

            // MAÇLARIM'I GİRİŞTE TAZELE (17 Ağu 2026 — mağaza öncesi denetim).
            // Açılış yüklemesi kullanıcı giriş yapmadan ÖNCE koşuyor; oturum
            // gerektiren `get_my_matches` o anda ya reddediliyor ya boş dönüyordu
            // ve bir daha çağrılmıyordu. Sonuç: kaptan kendi kurduğu maçı ana
            // sayfada ve Maçlarım'da göremiyordu. Best-effort: akışı bloke etmez.
            useAppStore.getState().refreshMyMatches().catch(() => {});

            // onAuthStateChanged HER auth olayında tetiklenir (SIGNED_IN +
            // TOKEN_REFRESHED + yeniden INITIAL_SESSION…). Açılış-rolü OVERRIDE'ı
            // YALNIZ uygulamaya giriş anında (splash/auth/…) uygulanır. Aksi halde
            // arka plan token yenilemesi (≈saatlik / sekme odağı), kullanıcının
            // uygulama-içi "Rol Değiştir" ile geçtiği rolü sessizce geri alırdı.
            const isEntering = ['SPLASH', 'AUTH', 'ROLE_SELECTION', 'PENDING_VERIFICATION']
              .includes(girisAninkiGorunum);
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
              // KA-1/KA-2: Sağlayıcı (kaleci/hakem) rolü ONAYLANMADIYSA panele
              // DEĞİL bekleme/red ekranına yönlendir. verification_status SELECT
              // ediliyordu ama landing'de hiç okunmuyordu → onaysız/red sağlayıcı
              // doğrudan SERVICE_DASHBOARD'a düşüp red notunu/"Tekrar Başvur"u hiç
              // görmüyordu (takılı kalırdı). Bu kapı token yenilemesinde de çalışır
              // (isEntering PENDING_VERIFICATION'ı içerir) → ~1 saat sonra gelen
              // arka-plan yenilemesi onaysız kullanıcıyı panele bounce edemez.
              const providerRole = landingRole === UserRole.GOALKEEPER || landingRole === UserRole.REFEREE;
              const vstatus = (profile.verification_status as string | null) ?? null;
              // ─── NUMARA KAPISI ────────────────────────────────────────────
              // 17 Ağu 2026: telefon ANA giriş yöntemi olduğu için Google/Apple
              // ile girenden de numara istenir — tesis sahibi ve kaptan oyuncuya
              // numaradan ulaşır. Kapı YALNIZ sosyal yollara kurulur:
              //   • telefonla girenin numarası zaten doğrulanmıştır,
              //   • 17 Ağu ÖNCESİ e-posta hesapları MUAFTIR (kurucu kararı:
              //     "onlar kalsınlar") — çalışan bir hesabı kilitlemek olmaz.
              //
              // 22 Ağu 2026 (Apple 5.6 reddi): ekran artık DUVAR DEĞİL. SMS
              // yalnız +90 numaralara gidiyordu; yurt dışındaki kullanıcı —
              // mağaza incelemecisi dahil — uygulamayı hiç açamıyordu ve bu,
              // incelemeye özel bir paket derlenmesine yol açmıştı. Atlayan
              // kullanıcı bir daha açılışta zorlanmaz; numara ödeme/rezervasyon
              // anında istenir (PaymentScreen · handlePay).
              //
              // ─── NUMARA KAPISI SİLİNDİ (23 Ağu 2026, kurucu kararı) ────
              // Giriş sonrası numara ekranı ve numara BAĞLAMA ekranının kendisi
              // uygulamadan tümüyle kaldırıldı. Bayrakla karartmak yetmedi:
              // bayrak yanlış ortama yazıldığında ekran geri geliyordu ve
              // kurucu aynı numara ekranını üç kez bildirdi. SMS sağlayıcısı
              // da hiç yapılandırılmamıştı, yani ekran hiçbir zaman
              // çalışmıyordu. Giriş yolu artık YALNIZ Apple ve Google.
              // ─── KOPYALA-YAPIŞTIR HATASI DÜZELTİLDİ (24 Ağu 2026) ────────
              // Bu satır şöyleydi:
              //   if (providerRole && (...)) {              } else if (providerRole && (...)) {
              // Yani AYNI koşul iki kez yazılmış, ilk gövde BOŞ bırakılmıştı.
              // İlk dal her zaman önce eşleştiği için `else if` gövdesine
              // (PENDING_VERIFICATION yönlendirmesi) HİÇ girilmiyordu: onayı
              // bekleyen ya da REDDEDİLMİŞ kaleci/hakem doğrudan sağlayıcı
              // paneline düşüyor, red notunu ve "Tekrar Başvur" düğmesini hiç
              // görmüyordu — üstteki yorumun engellemek için yazıldığı
              // davranışın ta kendisi. Numara kapısı 23 Ağustos'ta silinirken
              // boşalan `if` gövdesi kaldırılmayı unutulmuş.
              if (providerRole && (vstatus === 'pending' || vstatus === 'rejected')) {
                // Tekrar-başvuru akışının doğru rolü hedeflemesi için serviceAppRole'ü kur.
                useAppStore.getState().setServiceAppRole(landingRole);
                resetNavigation('PENDING_VERIFICATION');
              } else if (
                // Yarıda bırakılan tanıtım. `has_completed_onboarding`
                // açılışta HİÇ okunmuyordu: adımların ortasında uygulamayı
                // kapatan kullanıcı bir daha akışa dönmüyor, konum da yalnız
                // orada istendiği için bir daha hiç sorulmuyordu.
                //
                // Burada eskiden bir `!wasOnboardingSkipped(...)` istisnası
                // vardı: "Atla" diyen bir daha zorlanmıyordu. Atlama yolu
                // kaldırıldığı için (24 Ağu 2026) istisnanın kaynağı da yok —
                // kalsaydı dün atlamış kullanıcı profili sonsuza dek eksik
                // kalır, bugün kaydolan ise doldurmak zorunda olurdu. Tek
                // ölçüt sunucudaki `has_completed_onboarding`.
                landingRole === UserRole.PLAYER &&
                isOnboardingEnabled() &&
                (profile as { has_completed_onboarding?: boolean | null }).has_completed_onboarding === false
              ) {
                resetNavigation('ONBOARDING');
              } else {
                const intent = await niyetiTuket(landingRole);
                resetNavigation(intent ? intent.view : navigateBasedOnRole(landingRole));
              }
            }
          }
        } else {
          // ─── OTURUMSUZ OLAY: HEPSİ ÇIKIŞ DEĞİLDİR (22 Ağustos 2026) ──────
          // Buraya üç ayrı şey düşebiliyordu: gerçek ÇIKIŞ, açılışta oturumun
          // henüz çözülmemiş olması ve jeton yenilemesinin boş dönmesi. Üçü de
          // koşulsuz giriş ekranına atıyordu. Bu dal SENKRON, başarı dalı ise
          // 2-4 ağ gidiş-dönüşü bekliyor: başarılı bir girişten hemen sonra
          // gelen oturumsuz bir olay, henüz tamamlanmamış yönlendirmenin
          // üstüne biniyor ve kullanıcıyı giriş ekranına geri atıyordu.
          //
          // Artık yalnız GERÇEK çıkış giriş ekranına düşürür. Belirsiz
          // olaylarda oturum bir kez daha SORULUR; hâlâ yoksa çıkış sayılır.
          const gercekCikis = olay === 'SIGNED_OUT';
          if (!gercekCikis && auth.currentUser) {
            // Elde çalışan bir kullanıcı var — belirsiz bir olay yüzünden
            // kullanıcıyı uygulamadan atma.
            return;
          }
          // İSTEMLİ mi İSTEMSİZ mi? (26 Ağu 2026) — SIGNED_OUT'u kütüphane,
          // jeton yenilemesi geçersizleştiğinde de yayınlar. Kullanıcı form
          // doldururken uyarısız giriş ekranında uyanıyordu. İstemsiz düşüşte
          // kaldığı yer pendingIntent'e yazılır (girişte consumePendingIntent
          // zaten geri götürür) ve durum kendisine söylenir.
          const istemli = cikisIstemliMiVeTuket();
          const storeSnap = useAppStore.getState();
          const prevView = storeSnap.view;
          if (gercekCikis && !istemli && prevView !== 'SPLASH' && prevView !== 'AUTH') {
            // Niyet YALNIZ girişten sonra anlamlıca geri yüklenebilen ekran
            // için saklanır: bugün bu, maç lobisi (niyetiTuket matchId ile maçı
            // yeniden yükler). Diğer ekranların bağlamı (bilet id, ödeme
            // bağlamı…) hemen aşağıda güvenlik gereği sıfırlanır — oraya
            // "dönmek" boş ekran açardı; OWNER/ADMIN panellerine niyet yazmak
            // ise ortak cihazda 30 dk içinde giren BAŞKA kullanıcıya taşınırdı.
            if (prevView === 'MATCH_JOIN' && storeSnap.selectedMatch?.id) {
              storeSnap.setPendingIntent(prevView, storeSnap.selectedMatch.id);
              showToast('Oturumun yenilenemedi. Tekrar giriş yapınca kaldığın yerden devam edeceksin.', 'error');
            } else {
              showToast('Oturumun sonlandı — devam etmek için tekrar giriş yap.', 'error');
            }
          }
          setRole(UserRole.PLAYER);
          // İlk açılış (oturum yok) SPLASH'te kalır; bir panelden ÇIKIŞ yapıldıysa
          // doğrudan giriş (AUTH) ekranına düşülür.
          resetNavigation(prevView === 'SPLASH' ? 'SPLASH' : 'AUTH');
          resetUser(); // FAZ 7.4: çıkışta analitik/hata kullanıcı bağlamını temizle
          // Kullanıcıya ait TÜM bellek alanları sıfırlanır (26 Ağu 2026):
          // native'de çıkış sayfayı yeniden yüklemez; maçlar/bildirimler/
          // adminSession bellekte kalıp sonraki kullanıcıya sızıyordu.
          // (resetUserScopedState pendingIntent'in BELLEK kopyasını da siler;
          // yukarıda yazılan niyet localStorage'da yaşar, consumePendingIntent
          // oradan okur — sıra bilinçli: önce yaz, sonra sıfırla.)
          useAppStore.getState().resetUserScopedState();
          stopPresenceHeartbeat(); // çıkışta heartbeat durur (Spec F34)
        }
      } catch (error: any) {
        console.error('[App] Auth state error:', error);
        // ÇIKIŞ YALNIZ KESİN SİNYALLE (22 Ağustos 2026).
        //
        // Kapı, hata TÜRÜNE değil hata METNİNDE 'Auth' ya da 'JWT' alt dizesi
        // geçmesine bakıyordu. @supabase/auth-js'in kendi hata sınıfı adı
        // "AuthApiError", mesajları da sık sık "Auth" içerir — yani geçici bir
        // ağ/RLS hatası bile kullanıcıyı ÇIKIŞA zorluyordu. Giriş-sonrası
        // akışta kullanıcıyı otomatik olarak giriş ekranına atan tek yol buydu.
        //
        // Artık yalnız jetonun gerçekten geçersiz olduğu durumlar çıkış yapar.
        const kod = error?.code;
        const durum = error?.status;
        const jetonGecersiz = kod === 'PGRST301' || durum === 401
          || (error?.name === 'AuthApiError' && (durum === 401 || durum === 403));
        if (jetonGecersiz) {
          // 'oturum-gecersiz': istemli işaret KONMAZ — SIGNED_OUT dalı bunu
          // istemsiz düşüş sayar, kullanıcıya dürüst mesaj + niyet kaydı düşer.
          logout('oturum-gecersiz').catch(e => console.error('[App] Sign out error on invalid session:', e));
          resetNavigation('AUTH');
        }
      } finally {
        // Kilit BURADA bırakılır: açılış bitmeden ikinci bir SIGNED_IN gelirse
        // düşer, bittikten sonra gelen (ör. jeton yenileme) yine çalışır.
        if (user) acilisKoşuyor = null;
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

    const setupPush = async (uid: string, izinIste = false) => {
      // D2: izin artık GİRİŞTE istenmiyor. Doğru an (maça katılma) geldiğinde
      // PushIzniModal bu fonksiyonu izinIste=true ile yeniden çağırır.
      pushKurulumRef.current = (yeniIzin: boolean) => setupPush(uid, yeniIzin);
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
          void handleDeepLink(deepLink, (v) => s.navigateTo(v as AppView), {
            setSelectedMatch: (m) => s.setSelectedMatch(m),
            setSelectedTeamId: s.setSelectedTeamId,
            setStudioContext: s.setStudioContext,
            setSocialTarget: s.setSocialTarget,
            setSelectedConversationId: s.setSelectedConversationId,
            setSelectedTeamChatId: s.setSelectedTeamChatId,
            setTeamInitialTab: s.setTeamInitialTab,
            showToast, // IP-06: maç çekilemezse sessiz kalma, kullanıcıya söyle
          });
        },
        izinIste,
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
  //
  // SOĞUK AÇILIŞ DELİĞİ (22 Ağustos 2026 — kurucunun bildirdiği hata).
  // Bu dinleyici DİNAMİK import ile, yani bir mikro-görev sonrasında takılıyor.
  // Uygulama arka planda öldürülmüşse (iOS bunu bellek baskısında rutin olarak
  // yapar; Google/Apple girişi sırasında tarayıcı yaprağı öndeyken çok olası),
  // sistem uygulamayı `oyna://auth-callback?code=...` ile SIFIRDAN açar ve
  // `appUrlOpen` olayı dinleyici takılmadan ÖNCE düşer. Sonuç: kod hiç
  // bozdurulmaz, oturum açılmaz ve kullanıcı Google'dan dönünce kendini
  // yeniden giriş ekranında bulur — "beni attı, baştan başlattı".
  //
  // Çözüm: olayı beklemek yetmez, uygulamanın HANGİ ADRESLE AÇILDIĞI da
  // sorulur (`getLaunchUrl`). İki yol da aynı işleyiciden geçer; aynı adresin
  // iki kez işlenmemesi için işlenenler tutulur (kod tek kullanımlıktır,
  // ikinci bozdurma hata verir ve kullanıcıya yanlışlıkla hata gösterirdi).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    const islenen = new Set<string>();
    const adresiIsle = async (url: string) => {
      if (!url || islenen.has(url)) return;
      islenen.add(url);
      // OAuth dönüşü (oyna://auth-callback?code=...) — kodu oturuma bozdur;
      // navigasyonu onAuthStateChanged üstlenir. Diğer deep link'lere gitmez.
      const donus = await handleAuthCallbackUrl(url);
      if (donus) {
        // Başarılıysa yönlendirmeyi onAuthStateChanged yapar; sessiz kalırız.
        // Başarısızsa kullanıcı NEDEN giriş ekranında olduğunu bilmeli.
        if (donus === 'HATA') {
          showToast('Giriş tamamlanamadı. Lütfen tekrar dene.');
        }
        return;
      }
      const s = useAppStore.getState();
      void handleDeepLink(url, (v) => s.navigateTo(v as AppView), {
        setSelectedMatch: (m) => s.setSelectedMatch(m),
        setSelectedTeamId: s.setSelectedTeamId,
        setStudioContext: s.setStudioContext,
        setSocialTarget: s.setSocialTarget,
        setSelectedConversationId: s.setSelectedConversationId,
        setSelectedTeamChatId: s.setSelectedTeamChatId,
        setTeamInitialTab: s.setTeamInitialTab,
        showToast, // IP-06: maç çekilemezse sessiz kalma, kullanıcıya söyle
      });
    };

    import('@capacitor/app').then(({ App: CapApp }) => {
      // 1) Uygulama AÇIKKEN gelen adresler.
      CapApp.addListener('appUrlOpen', ({ url }) => { void adresiIsle(url); })
        .then((handle) => { remove = () => handle.remove(); });
      // 2) Uygulamayı AÇAN adres — dinleyici geç takıldıysa tek kurtarma yolu.
      //    Desteklenmeyen platformda sessizce boş döner.
      CapApp.getLaunchUrl()
        .then((res) => { if (res?.url) void adresiIsle(res.url); })
        .catch(() => { /* açılış adresi okunamadı — dinleyici yolu devrede */ });
    });
    return () => { if (remove) remove(); };
  }, []);

  // ─── Android donanım geri tuşu ─────────────────────────────────────────────
  // Donanım geri tuşu TEK bir öncelik sırası izler (IP-01):
  //   1) Banka doğrulaması açık → hiçbir şey yapma
  //   2) Açık overlay varsa → yalnız onu kapat, ekranı değiştirme
  //   3) Yığında ekran varsa → geri git
  //   4) Kök ekran → uygulamayı arka plana al (Play incelemesinin beklediği davranış)
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', () => {
        const s = useAppStore.getState();
        // 1) Banka doğrulaması (3DS) açık — geri tuşu hiçbir şey yapmaz.
        //    PaymentScreen unmount olursa 3DS sonucu bir daha okunamaz (BULGU-084).
        if (s.paymentLockActive) return;
        // 2) Açık overlay varsa yalnız onu kapat, ekranı DEĞİŞTİRME (BULGU-020/021/132).
        if (s.closeTopOverlay()) return;
        // 3) Yığında ekran varsa geri git.
        if (s.navigationStack.length > 0) { s.goBack(); return; }
        // 4) Kök ekran → uygulamayı arka plana al (kapatmak yerine).
        CapApp.minimizeApp();
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
          onComplete={async () => {
            // IP-15: kapıdan gelip hesap açan kullanıcı onboarding'den sonra
            // Ana Sayfa'ya değil, başladığı ekrana döner.
            const st = useAppStore.getState();
            const intent = await niyetiTuket(st.role);
            if (intent) { resetNavigation(intent.view); return; }
            goBack(navigateBasedOnRole(st.role));
          }}
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
      case 'OWNER_PANEL':
        return (
          <OwnerPanel
            onBack={() => goBack(navigateBasedOnRole(role))}
            onNavigate={(v) => navigateTo(v as AppView)}
            onLogout={handleLogout}
          />
        );
      case 'SERVICE_DASHBOARD':
        return <ServiceDashboard role={role!} onBack={() => goBack(navigateBasedOnRole(role))} onNavigate={(v) => navigateTo(v)} onLogout={handleLogout} />;
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
        />;
      case 'MY_MATCHES':
        return <MyMatchesHub onNavigate={(v) => navigateTo(v)} />;
      // Cüzdan lansmanda KAPALI (e-para mevzuatı — shared/featureFlags.ts).
      // Rota ölmedi: eski derin bağlantı/bildirim WALLET derse ana ekran açılır.
      case 'WALLET':
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
          onNavigate={(v) => navigateTo(v)}
          onOpenDiaryEntry={(id) => {
            setSelectedDiaryId(id);
            navigateTo('MATCH_DIARY_DETAIL');
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
          onSelect={(match) => {
            useAppStore.getState().setLobbyMode('DISCOVER');
            setSelectedMatch(match);
            navigateTo('MATCH_JOIN');
          }}
        />;
      case 'MATCH_JOIN':
        // RAHAT bir maç ÇEŞİDİdir: pozisyonsuz kadro lobisi açılır; Ciddi/
        // Taktiksel saha+diziliş akışına dokunulmaz. Dallanma BURADA (hook-
        // güvenli): MatchJoin'in kendi içinde erken return, satır 600+ hook'ları
        // yüzünden rules-of-hooks ihlali olurdu.
        if (selectedMatch?.difficulty === 'Rahat') {
          return <RahatMatchLobby match={selectedMatch} onBack={() => goBack('MATCH_DISCOVERY')} />;
        }
        return <MatchJoin
          match={selectedMatch}
          onBack={() => goBack('MATCH_DISCOVERY')}
          onJoin={() => resetNavigation('DASHBOARD')} // Kadro kaydından sonra Dashboard'a dön
        />;
      case 'MATCH_TICKET':
        {/* F4.1: bilet artık Maçlarım'daki rezervasyon kartından açılıyor */}
        return <MatchTicket onBack={() => goBack('MY_MATCHES')} />;
      case 'SOCIAL':
        return <SocialView onBack={() => goBack('PROFILE')} onNavigate={(v) => navigateTo(v)} />;
      case 'FRIEND_ADD':
        return <FriendAddView onBack={() => goBack('SOCIAL')} onNavigate={(v) => navigateTo(v)} />;
      case 'MESSAGES':
        return <MessagesView
          initialConversationId={selectedConversationId}
          initialTeamChatId={selectedTeamChatId}
          onFindFriends={() => navigateTo('FRIEND_ADD')}
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

  // Alt menü YALNIZ sekme köklerinde çizilir ve liste BottomNav'dan gelir —
  // elle yazılan ikinci bir dizi olduğu sürece ikisi kaçınılmaz olarak ayrışıyordu.
  // Taktik Stüdyo listeden çıktı: sekmesi yoktu, çubuk çiziliyor ama hiçbir sekme
  // yanmıyordu. Artık tam ekran açılır ve kendi geri okuyla kapanır.
  //
  // ANA SAYFA MUAF (kullanıcı kararı, onaylı tasarım): ana sayfada alt menü
  // ÇİZİLMEZ. Ekranın kendisi zaten altı kapının tamamını taşıyor; altına bir
  // de aynı kapıların kısayolunu koymak ekranı ikiye bölüyordu. Çubuk kapı
  // ekranlarında görünür ve eve dönüş oradaki "Ana Sayfa" sekmesinden olur —
  // bu yüzden DASHBOARD `TAB_IDS`'ten ÇIKARILMADI, yalnız burada elenir.
  // Çıkarılsaydı hiçbir ekrandan ana sayfaya dönülemezdi.
  const showBottomNav = (TAB_IDS as readonly string[]).includes(view) && view !== 'DASHBOARD';

  return (
    // IP-11: framer-motion animasyonları CSS'teki prefers-reduced-motion
    // bloğuna BAKMAZ (inline style/WAAPI ile sürerler). Sistem tercihini
    // onlara taşıyan tek şey bu sarmalayıcıdır.
    <MotionConfig reducedMotion="user">
    <div className="h-full bg-[#0A0E14] text-white font-['Inter'] relative overflow-hidden">
      <OfflineBanner />
      {loadDegraded && (
        <div role="alert" className="fixed top-0 inset-x-0 z-[60] bg-amber-500/90 backdrop-blur-sm text-[#0A0E14] text-[0.75rem] font-bold px-4 py-2 pt-safe-2 flex items-center justify-between gap-3">
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
      <PushIzniModal onIzinIste={() => pushKurulumRef.current?.(true)} />
      <SignupGate />
      {/* Mesh Gradient Background */}
      <div className="mesh-bg">
        <div className="mesh-blob mesh-blob-1"></div>
        <div className="mesh-blob mesh-blob-2"></div>
        <div className="mesh-blob mesh-blob-3"></div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          {...PAGE_TRANSITION}
          onScrollCapture={showBottomNav ? handleNavScrollCapture : undefined}
          onTouchStartCapture={showBottomNav ? handleNavTouchStart : undefined}
          onTouchMoveCapture={showBottomNav ? handleNavTouchMove : undefined}
          // Görünüm kaydırıcısının işareti. İki yerden okunur:
          //  • index.css — ekranların "tam ekran" ölçüsünü VİEWPORT yerine bu
          //    kabın iç yüksekliğine bağlayan tek ortak kural.
          //  • tests/visual/oluBosluk.visual.spec.ts — ölü bant ölçümü.
          data-oyna-view-scroller=""
          className={`w-full h-full absolute inset-0 overflow-y-auto overscroll-contain custom-scrollbar ${
            // MY_MATCHES kendi içinde kaydırır ve bar payını kendisi ayırır →
            // dış dolgu ölü bant yaratmasın, kartlar barın altından aksın.
            // DASHBOARD aynı gerekçeyle muaf: ana sayfa kökü `height:100%` +
            // `overflow:hidden`, içerik kendi kaydırıcısında akar ve alt
            // güvenli alan payını orada ayırır. Ayrıca bu ekranda alt menü
            // hiç çizilmez (yukarıdaki `showBottomNav`), yani ayrılacak bar
            // payı da yoktur. Dıştan dolgu eklenirse yalnız ölü bant kalır.
            // MATCH_DISCOVERY de aynı ailede: ekran `max-h-screen` + kendi
            // iç kaydırması ile çalışır, kart listesi ve filtre paneli bar
            // payını kendileri ayırır. Dış dolgu bırakılırsa sayfa 120px
            // boşluğa doğru sürüklenebiliyordu.
            // PITCH_DISCOVERY aynı ailenin son üyesi: kökü `min-h-screen` +
            // `overflow-hidden`, içerik kendi `<main>` kaydırıcısında akar ve
            // bar payını orada (`pb-safe-nav`) ayırır. Dıştaki dolgu burada da
            // yalnız ÖLÜ BANT üretiyordu — sayfa boşluğa doğru sürükleniyordu.
            view === 'MY_MATCHES' || view === 'DASHBOARD' || view === 'MATCH_DISCOVERY' || view === 'PITCH_DISCOVERY'
              ? ''
              : showBottomNav ? 'pb-safe-nav' : 'pb-safe'
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
          <BottomNav currentView={view} onNavigate={(v) => useAppStore.getState().switchTab(v)} hidden={navHidden || navOverlayOpen} />
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

      {/* FAZ 7.5: Çoklu rol geçişi ve arayüz keşfi — rol değiştirici sheet */}
      <AnimatePresence>
        {isRoleSwitcherOpen && (
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
    </div>
    </MotionConfig>
  );
};

export default App;
