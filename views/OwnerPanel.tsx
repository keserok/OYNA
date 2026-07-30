
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { 
  Wallet, TrendingUp, Calendar, AlertCircle, Settings,
  MessageSquare, Clock, XCircle, Home, Users, CheckCircle2, ChevronRight, Bell, 
  MoreHorizontal, Shield, Hand, DollarSign, Filter, RefreshCw, X, Search, Pause, Play, ChevronDown, BarChart as BarChartIcon, ArrowUpRight, Zap, Phone, Plus, User, Lock, CreditCard, Banknote, Trash2, Edit3, Tag, Percent, CalendarDays, TrendingDown, Send, Receipt, ClipboardList, Briefcase, UserCheck, Flame, Building2, Image as ImageIcon, MapPin, Globe, HelpCircle, LogOut, FileText, Camera, Save, Type, List, Check, PieChart as PieChartIcon, Activity, ZapOff, CreditCard as CardIcon, Coins, Trophy, Star, Target, ChevronLeft, ImagePlus, GripVertical, LayoutDashboard, Palette, CalendarRange
} from 'lucide-react';

import { useAppStore } from '../store';
import { money } from './owner/finance/financeUi';
import { hasMultipleSwitchableRoles } from '../shared/roles';
import { resolveWorkingHoursForDate, isHourWithinWorkingHours, openHourCount } from '../shared/workingHours';
import { courtsMissingTariff } from '../shared/courtTariffGate';
import { PitchManager } from '../admin-panel/views/PitchManager';
import { OwnerFinanceView } from './owner/OwnerFinanceView';
import { LoadingState, EmptyState } from '../components/common/StatusState';
import { OwnerTeamView } from './owner/OwnerTeamView';
import { OwnerBankAccountsModal } from './owner/OwnerBankAccountsModal';
import { OwnerSubscriptionModal } from './owner/OwnerSubscriptionModal';
import { OwnerFlashDealModal } from './owner/OwnerFlashDealModal';
import { OwnerCloseSlotModal } from './owner/OwnerCloseSlotModal';
import { OwnerBookingDetailModal } from './owner/OwnerBookingDetailModal';
import { OwnerSpecialPriceModal } from './owner/OwnerSpecialPriceModal';
import { useOwnerEntitlements } from '../hooks/useOwnerEntitlements';
import { OwnerToastProvider, useOwnerToast } from './owner/components/useOwnerToast';
import { OwnerKpiGrid, OwnerCommandStrip, kpiIcons, type OwnerKpiItem } from './owner/components/OwnerKpiGrid';
import { OwnerStatusBar, type OwnerStatusBanner } from './owner/components/OwnerStatusBar';
import { OwnerBottomNav } from './owner/components/OwnerBottomNav';
import { OutboxBadge } from './owner/components/OutboxBadge';
import { installOutboxAutoFlush, setOutboxDropNotifier } from '../services/offline/outbox';
import { OwnerHomeSkeleton } from './owner/components/OwnerHomeSkeleton';
import {
  OwnerMenuView,
  OwnerFacilitySettingsModal,
  OwnerWorkingHoursModal,
  OwnerCancellationPolicyModal,
  OwnerWithdrawalsModal,
  OwnerWidgetSettingsModal,
  OwnerMatchesModal,
  OwnerNotificationsModal,
  OwnerPaymentSettingsModal,
  OwnerSecurityModal,
  OwnerSupportModal,
  OwnerLogoutModal,
  type WidgetType,
  type OwnerMenuStats,
} from './owner/menu';
import {
  findFlashDealForSlot,
  isSlotClosed,
  localDateISO,
} from './owner/ownerCalendarHelpers';
import { getOrCreateOwnerAccount, planTierLabel, accountStatusLabel } from '../services/ownerAccountService';
import type { OwnerAccount } from '../types';
import { supabase } from '../supabaseClient';
import {
  getOwnerPitches,
  getAllPitchesForAdmin,
  saveWorkingHours,
  togglePitchOpen,
  getOwnerBalance,
  getOwnerDailySummary,
  getPitchBookings,
  ownerCreateManualBooking,
  getSubscriptions,
  updateSubscriptionStatus,
  setSubscriptionAutoRenew,
  subscribeToOwnerBookings,
  getTariffs,
  buildDayOccupancyGrid,
  EMPTY_DAY_OCCUPANCY,
  computeCourtDailyStats,
  computeOverallOccupancy,
  getPaymentSettings,
  getBankAccounts,
  getActiveFlashDeals,
  getAvailabilityExceptions,
  toTurkishError,
  type CourtDailyStats,
} from '../services/pitchOwnerService';
import type { SlotTariffInput } from '../shared/slotGrid';
import { getOwnerDemoPitchId, seedOwnerDemo } from '../services/ownerDemoService';
import type { PitchCourt, PitchBookingFull, OwnerDailySummary, OwnerPitch, FlashDeal, PitchAvailabilityException, PitchTariff } from '../types';

interface OwnerPanelProps {
  onBack: () => void;
  onNavigate: (view: any) => void;
  /** Gerçek oturum kapatma (App merkezî handleLogout) → giriş ekranına düşer. */
  onLogout?: () => void;
}

// --- HELPERS ---

import { FinancialCalendarView } from './owner/calendar/FinancialCalendarView';
import { PitchOccupancyGrid } from './owner/home/OwnerHomeWidgets';
import { OwnerSetupProgress, type SetupStep } from './owner/home/OwnerSetupProgress';
import { OwnerBottomSheet } from './owner/components/OwnerBottomSheet';
import { useConfirmSheet } from './owner/components/useConfirmSheet';
import { todayISO } from './owner/ownerPanelShared';

type OwnerTab = 'HOME' | 'CALENDAR' | 'FINANCE' | 'TEAM' | 'MORE' | 'PITCHES';

/**
 * pitch_tariffs satırı → panelin `pricingPolicy` biçimi.
 *
 * TEK KOPYA: takvim, doluluk şeridi ve tüketici ekranı aynı alanlardan beslenir.
 * `applies_to_days` / `tariff_type` / `valid_on` kopyalanmazsa ızgara yanlış
 * güne düşer; `deposit_amount` kopyalanmazsa takvim uydurma kaporaya düşer
 * (BULGU-123).
 */
const tariffRowToPolicy = (t: PitchTariff) => ({
  startTime: String(t.start_time ?? '08:00'),
  endTime: String(t.end_time ?? '17:00'),
  price: Number(t.slot_price ?? 0),
  slot_price: Number(t.slot_price ?? 0),
  slot_minutes: Number(t.slot_minutes ?? 60),
  deposit_amount: Number(t.deposit_amount ?? 0),
  court_id: t.court_id ?? null,
  applies_to_days: t.applies_to_days ?? null,
  tariff_type: t.tariff_type ?? undefined,
  valid_on: t.valid_on ?? null,
});

 const OwnerPanelInner: React.FC<OwnerPanelProps> = ({ onBack, onNavigate, onLogout }) => {
  const notify = useOwnerToast();
  const { confirm, confirmElement } = useConfirmSheet();
  const { setIsNotificationsOpen, setIsRoleSwitcherOpen, myRoles, setStaffPanelContext } = useAppStore();
  // STAFF-3: panel erişim seviyesi. staffPanelContext varsa personel/müdür,
  // yoksa sahip (kendi paneli). Mount anında BİR KEZ yakalanır — StrictMode
  // çift-mount'u veya store temizliği erişim seviyesini bozmasın.
  const [staffCtx] = useState(() => useAppStore.getState().staffPanelContext);
  const [accessLevel] = useState<'OWNER' | 'MANAGER' | 'STAFF'>(
    () => useAppStore.getState().staffPanelContext?.accessLevel ?? 'OWNER',
  );
  const isStaffCtx = !!staffCtx;
  const isManagerLevel = accessLevel === 'OWNER' || accessLevel === 'MANAGER';
  const isOwnerLevel = accessLevel === 'OWNER';
  const canSwitchRole = hasMultipleSwitchableRoles(myRoles);
  const [activeTab, setActiveTab] = useState<OwnerTab>('HOME'); 
  const [courts, setCourts] = useState<PitchCourt[]>([]);
  const [dailySummary, setDailySummary] = useState<OwnerDailySummary | null>(null);
  const [todayBookings, setTodayBookings] = useState<PitchBookingFull[]>([]);
  const [courtStats, setCourtStats] = useState<CourtDailyStats[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showOccupancyModal, setShowOccupancyModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileTab, setEditProfileTab] = useState<'general' | 'amenities' | 'location' | 'showcase'>('general');
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showBankAccountList, setShowBankAccountList] = useState(false);
  const [showWithdrawals, setShowWithdrawals] = useState(false);
  const [ownerAccount, setOwnerAccount] = useState<OwnerAccount | null>(null);
  const { isReadOnly, isPastDue, can, requireFeature, guardWrite, maxFacilities, maxCourts, maxStaff } =
    useOwnerEntitlements(ownerAccount, notify);
  // STAFF-3: personel/müdür bağlamında abonelik-tabanlı salt-okuma UYGULANMAZ —
  // tesisin planı sahibe bağlıdır; personelin kendi hesabında abonelik yoktur.
  // Gerçek yetki sınırı sunucuda RLS + RPC'de (STAFF-2). effReadOnly bunu köprüler.
  const effReadOnly = isStaffCtx ? false : isReadOnly;
  // Abonelik-tabanlı yazma kilidi personel/müdür için uygulanmaz (sunucu RLS gerçek gate).
  const effGuardWrite = React.useCallback(() => (isStaffCtx ? true : guardWrite()), [isStaffCtx, guardWrite]);
  // Yalnız-sahip/müdür eylem kapıları — personel bunları açamaz (sunucu da reddeder).
  const ownerOnlyGuard = () => {
    if (!isOwnerLevel) { notify('Bu işlem yalnızca saha sahibine açık.', 'warning'); return false; }
    return effGuardWrite();
  };
  const managerGuard = () => {
    if (!isManagerLevel) { notify('Bu işlem yalnızca sahip ve müdüre açık.', 'warning'); return false; }
    return effGuardWrite();
  };

  // P-OFFLINE: panel açıkken çevrimdışı kuyruk otomatik boşalır (online olayı +
  // periyodik + görünürlük). Kalıcı hatayla düşen işlem KULLANICIYA söylenir —
  // para işlemi sessizce kaybolmaz.
  useEffect(() => {
    installOutboxAutoFlush();
    setOutboxDropNotifier((item, err) => {
      notify(`Bekleyen işlem gönderilemedi (${item.label}): ${err}`, 'error');
    });
    return () => setOutboxDropNotifier(null);
  }, [notify]);

  const handleTabSelect = (tab: OwnerTab) => {
    // Finans & Ekip her owner'a açık — plan kilidi yok.
    // STAFF-3: personel Finans/Sahalar sekmesini açamaz (yönetim yetkisi ister).
    // STAFF: Finans/Sahalarım/Ekip yönetim yetkisi ister — açamaz (sunucu da reddeder).
    if (accessLevel === 'STAFF' && (tab === 'FINANCE' || tab === 'PITCHES' || tab === 'TEAM')) {
      setActiveTab('HOME');
      return;
    }
    setActiveTab(tab);
  };
  const [showCancellationPolicy, setShowCancellationPolicy] = useState(false);
  const [showPaymentMode, setShowPaymentMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<WidgetType[]>(() => {
      const saved = localStorage.getItem('owner_activeWidgets');
      return saved ? JSON.parse(saved) : [
          'QUICK_STATS',
          'QUICK_ACTIONS',
          'OCCUPANCY_ANALYSIS'
      ];
  });
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [menuBalance, setMenuBalance] = useState<number | undefined>(undefined);

  const toggleWidget = (widget: WidgetType) => {
      setActiveWidgets(prev => 
          prev.includes(widget) 
              ? prev.filter(w => w !== widget)
              : [...prev, widget]
      );
  };
  const [isFacilityOpen, setIsFacilityOpen] = useState(true);

  const [facilityData, setFacilityData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [realPitchId, setRealPitchId] = useState<string | null>(null);
  const [ownedFacilities, setOwnedFacilities] = useState<OwnerPitch[]>([]);
  const [showFacilityPicker, setShowFacilityPicker] = useState(false);

  // OP-P1-6: doluluk paydası sabit 16 değil, owner'ın BUGÜNE ayarladığı gerçek
  // çalışma penceresi. Ref ile tutulur ki refreshDashboard useCallback'i dep
  // churn'ü olmadan güncel değeri okusun. Kapalı gün → 0 (doluluk 0).
  const todayOpenHoursRef = useRef<number>(16);
  useEffect(() => {
    const wh = resolveWorkingHoursForDate(facilityData?.workingHours as any, todayISO());
    todayOpenHoursRef.current = wh.closed ? 0 : openHourCount(wh.open, wh.close);
  }, [facilityData]);

  // SLOT-3 — Doluluk analizi şeridi. Sabit 24 saatlik ızgara YOK: tarifelerden
  // (pitch_tariffs.slot_minutes) türetilir, dikdörtgenler süreyle orantılıdır.
  const tariffsForOccupancy = useMemo<SlotTariffInput[]>(
    () => ((facilityData?.pricingPolicy ?? []) as any[]).map((p) => ({
      id: p.id,
      tariff_type: p.tariff_type ?? 'WEEKDAY',
      applies_to_days: p.applies_to_days ?? null,
      start_time: String(p.start_time ?? p.startTime ?? '09:00'),
      end_time: String(p.end_time ?? p.endTime ?? '00:00'),
      slot_price: Number(p.slot_price ?? p.price ?? 0),
      slot_minutes: Number(p.slot_minutes ?? 60),
      deposit_amount: Number(p.deposit_amount ?? 0),
      is_active: p.is_active,
      court_id: p.court_id ?? null,
      valid_on: p.valid_on ?? null,
    })),
    [facilityData],
  );

  const occupancyGrid = useMemo(() => {
    const activeCourts = courts.filter((c) => c.is_active !== false);
    if (activeCourts.length === 0) return EMPTY_DAY_OCCUPANCY;
    const wh = resolveWorkingHoursForDate(facilityData?.workingHours as any, todayISO());
    return buildDayOccupancyGrid(
      todayBookings,
      activeCourts.map((c) => ({ id: c.id, name: c.name })),
      tariffsForOccupancy,
      todayISO(),
      // Tarifesiz tesis boş şerit görmesin (slotGrid Kural 4). Kapalı günde yedek yok.
      wh.closed ? null : wh,
    );
  }, [todayBookings, courts, tariffsForOccupancy, facilityData]);

  // SLOT-3 (4. madde) — sahip tarifeyi değiştirince ŞERİT ANINDA doğru çizmeli.
  // Tarife modalının onSave yükü ekran için YETERLİ DEĞİL: gün listesini
  // (applies_to_days) ve tarife tipini taşımıyor, SPECIAL satırlarını da eliyor.
  // O yükle çizersek hafta sonu tarifesi cumartesi günü şeritten düşerdi.
  // Bu yüzden modal kapanınca tarifeler GERÇEK KAYNAKTAN yeniden çekilir.
  // Fiyat politikası artık Sahalarım (PITCHES) sekmesinde, saha bazlı giriliyor.
  // O sekmeden çıkıldığında tarifeler gerçek kaynaktan yeniden çekilir.
  const pricingWasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = pricingWasOpenRef.current;
    const isOpen = activeTab === 'PITCHES';
    pricingWasOpenRef.current = isOpen;
    if (!wasOpen || isOpen || !realPitchId) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getTariffs(realPitchId);
        if (cancelled) return;
        setFacilityData((prev: any) => (prev ? { ...prev, pricingPolicy: rows.map(tariffRowToPolicy) } : prev));
      } catch {
        // Sessiz: şerit son bilinen tarifeyle çizmeye devam eder, yanlış veri basmaz.
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, realPitchId]);

  const refreshDashboard = React.useCallback(async (pitchId: string, courtList?: PitchCourt[]) => {
    try {
      const [summary, bookings] = await Promise.all([
        getOwnerDailySummary(pitchId),
        getPitchBookings(pitchId, todayISO()),
      ]);
      setDailySummary(summary);
      setTodayBookings(bookings);
      const activeCourtRows = (courtList ?? courts).filter((c) => c.is_active !== false);
      const courtMeta = activeCourtRows.map((c) => ({ id: c.id, name: c.name }));
      setCourtStats(computeCourtDailyStats(bookings, courtMeta, todayOpenHoursRef.current));
    } catch (err) {
      notify(toTurkishError(err), 'error');
    }
  }, [courts, notify]);

  const applyPitch = React.useCallback(async (pitch: OwnerPitch, demo: boolean, uid: string, ownerScope: boolean = true) => {
    const facilityCourts = (pitch.courts ?? []).filter((c) => c.is_active !== false);
    // ── HIZLI YOL: kortlar, saatler ve tarifeler pitch objesinde hazır; ANINDA uygula.
    // Ödeme/banka/hesap ayarları AYRI sorgulardan gelir. Bunları beklemek, yavaş
    // bağlantıda kortları/takvimi gereksizce bloklar (owner "Saha ekleyin" görür
    // — 4 kortu olmasına rağmen). Çekirdek operasyon ekranı bir saniye beklemez;
    // finansal ayarlar arkada yüklenip facilityData'ya yamalanır.
    setRealPitchId(pitch.id);
    // Skor Gir (QR_SCANNER) rotası maç listesini aktif tesise göre çeksin
    // (çoklu tesis, personel/müdür ve admin-önizleme için de doğru tesis).
    useAppStore.getState().setOwnerActivePitchId(pitch.id);
    setIsDemoMode(demo || !!pitch.is_demo);
    setCourts(facilityCourts);
    setIsFacilityOpen(pitch.is_open ?? true);
    setFacilityData({
      id: pitch.id,
      ownerId: uid,
      name: pitch.name ?? 'Tesisim',
      description: pitch.description ?? '',
      images: pitch.images?.length ? pitch.images : pitch.image ? [pitch.image] : [],
      amenities: Array.isArray(pitch.amenities) ? pitch.amenities : [],
      isFacilityOpen: pitch.is_open ?? true,
      latitude: (pitch as { latitude?: number | null }).latitude ?? null,
      longitude: (pitch as { longitude?: number | null }).longitude ?? null,
      pricingPolicy: (pitch.pitch_tariffs ?? []).map(tariffRowToPolicy),
      bankAccounts: [],
      workingHours: Array.isArray(pitch.working_hours) && pitch.working_hours.length ? pitch.working_hours : [],
      district: pitch.district,
      city: pitch.city,
      address: pitch.address,
      pricingMode: pitch.pricing_mode ?? 'FULL',
      paymentOptions: { online: true, deposit: false, cash: true },
      paramMerchantId: '',
      paramApiKey: '',
      paramClientId: '',
    });

    // Rezervasyon özetleri (HOME) — kortlar zaten set edildi, bloklamadan yükle.
    void refreshDashboard(pitch.id, facilityCourts);

    // ── YAVAŞ YOL: ödeme/banka/hesap ayarları — TAMAMEN arkada (await EDİLMEZ).
    // applyPitch bunu beklemez; yükleme efekti isLoading'i çekirdek veri gelir
    // gelmez kapatır. Yavaş/bozuk bağlantıda 3 finansal-ayar sorgusu TÜM paneli
    // (HOME iskeleti) kilitlemesin. Başarısız olsa da kortlar/takvim/HOME çalışır.
    // STAFF-3: personel/müdür bağlamında ATLA — banka/ödeme/hesap sahip-only'dir
    // (getOrCreateOwnerAccount personel için sahte owner hesabı YARATMASIN).
    if (ownerScope) void (async () => {
      try {
        const [paymentSettings, bankAccounts, account] = await Promise.all([
          getPaymentSettings(pitch.id),
          getBankAccounts(pitch.id),
          getOrCreateOwnerAccount(uid),
        ]);
        setOwnerAccount(account);
        setFacilityData((prev: any) => (prev && prev.id === pitch.id ? {
          ...prev,
          bankAccounts,
          paymentOptions: paymentSettings.paymentOptions,
          paramMerchantId: paymentSettings.paramMerchantId,
          paramApiKey: paymentSettings.paramApiKey,
          paramClientId: paymentSettings.paramClientId,
        } : prev));
      } catch (e) {
        console.warn('Ödeme/banka/hesap ayarları yüklenemedi (kortlar/takvim etkilenmez):', e);
      }
    })();
  }, [refreshDashboard]);

  const switchFacility = async (pitchId: string) => {
    const uid = facilityData?.ownerId;
    if (!uid) return;
    setShowFacilityPicker(false);
    setIsLoading(true);
    try {
      // Yüklü listeden seç (hem owner hem admin-önizleme için çalışır; admin
      // getOwnerPitches'te görünmez ama ownedFacilities zaten tüm tesisleri taşır).
      const next = ownedFacilities.find((p) => p.id === pitchId && !p.is_demo);
      if (next) {
        await applyPitch(next, false, uid);
      }
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Gerçek tesis + sahalar (courts) yükle; yoksa demo veya onboarding
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) {
          if (active) setIsLoading(false);
          return;
        }

        // STAFF-3: personel/müdür bağlamı — belirli tesisi id ile yükle; sahip
        // keşif yolu (getOwnerPitches/demo/onboarding) tamamen atlanır.
        // STAFF-3: personel/müdür bağlamı (mount'ta yakalanan staffCtx).
        if (staffCtx?.pitchId) {
          // Zayıf bağlantıya dayanıklı: tesisi 3 denemeye kadar getir (owner
          // keşif yolu gibi tek atışta bırakma — personel açılışı takılmasın).
          let sp: any = null;
          for (let attempt = 0; attempt < 3 && active; attempt++) {
            const { data, error } = await supabase
              .from('pitches')
              .select('*, courts(*), pitch_tariffs(*)')
              .eq('id', staffCtx.pitchId)
              .maybeSingle();
            if (data) { sp = data; break; }
            if (!error) break; // veri yok (silinmiş/erişim yok) — tekrar deneme
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
          if (!active) return;
          if (sp) {
            await applyPitch(sp as unknown as OwnerPitch, false, uid, false);
          } else {
            notify('Tesis yüklenemedi. Bağlantını kontrol edip tekrar dene.', 'error');
          }
          if (active) setIsLoading(false);
          return;
        }

        const ownerPitches = await getOwnerPitches(uid);
        const owned = ownerPitches.filter((p) => !p.is_demo);
        setOwnedFacilities(owned);
        let pitch: OwnerPitch | null = owned[0] ?? null;
        let demo = false;

        // Admin/SUPER_ADMIN önizleme: kendi tesisi olmayan bir yönetici, owner panelini
        // gerçek bir tesisle açar (onboarding'e düşmez). Yazma yetkisi sunucuda is_admin
        // ile zaten var. Böylece yönetici takvim/operasyonu gerçek veride görebilir/yönetebilir.
        if (!pitch) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role, is_admin')
            .eq('id', uid)
            .maybeSingle();
          const isAdmin =
            (prof as { is_admin?: boolean; role?: string } | null)?.is_admin === true ||
            ['ADMIN', 'SUPER_ADMIN'].includes(String((prof as { role?: string } | null)?.role ?? ''));
          if (isAdmin) {
            try {
              const allReal = await getAllPitchesForAdmin();
              if (allReal.length) {
                setOwnedFacilities(allReal);
                setIsAdminPreview(true);
                pitch = allReal[0];
              }
            } catch (e) {
              console.warn('Admin önizleme tesisleri yüklenemedi:', e);
            }
          }
        }

        if (!pitch) {
          let demoId = await getOwnerDemoPitchId();
          const autoSeed = import.meta.env.VITE_OWNER_DEMO_AUTO_SEED === 'true';
          if (!demoId && autoSeed) {
            try {
              demoId = await seedOwnerDemo();
            } catch (e) {
              console.warn('Demo seed:', e);
            }
          }
          if (demoId) {
            const { data: demoPitch } = await supabase
              .from('pitches')
              .select('*, courts(*), pitch_tariffs(*)')
              .eq('id', demoId)
              .single();
            if (demoPitch) {
              pitch = demoPitch as typeof pitch;
              demo = true;
            }
          }
        }

        if (!active) return;

        if (!pitch) {
          setNeedsOnboarding(true);
          setIsLoading(false);
          return;
        }

        await applyPitch(pitch, demo, uid);
      } catch (err) {
        if (active) notify(toTurkishError(err), 'error');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!realPitchId) return;
    return subscribeToOwnerBookings(realPitchId, () => {
      refreshDashboard(realPitchId);
    }, 'panel');
  }, [realPitchId, refreshDashboard]);

  // Mock fallback kaldırıldı — tesis yoksa onboarding ekranı gösterilir

  const dynamicTotalRevenue = dailySummary?.collected_today ?? todayBookings.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
  const dynamicOccupancyRatio = dailySummary && dailySummary.total_courts > 0
    ? computeOverallOccupancy(todayBookings, dailySummary.active_courts || dailySummary.total_courts, todayOpenHoursRef.current)
    : computeOverallOccupancy(todayBookings, courts.length, todayOpenHoursRef.current);

  const confirmedToday = todayBookings.filter((b) => b.status === 'CONFIRMED').length;

  const trialDaysLeft = useMemo(() => {
    if (!ownerAccount?.trial_ends_at || ownerAccount.status !== 'trialing') return null;
    const end = new Date(ownerAccount.trial_ends_at);
    const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [ownerAccount]);

  const statusBanners = useMemo((): OwnerStatusBanner[] => {
    const list: OwnerStatusBanner[] = [];
    if (isAdminPreview) {
      list.push({
        id: 'admin-preview',
        tone: 'info',
        message: `Yönetici önizleme — ${facilityData?.name ?? 'tesis'} yönetiliyor (kendi tesisin değil)`,
      });
    }
    if (isDemoMode) {
      list.push({
        id: 'demo',
        tone: 'demo',
        message: 'DEMO MODU — OYNA Demo Arena (gerçek veri değil)',
      });
    }
    return list;
  }, [isAdminPreview, isDemoMode, facilityData?.name, ownerAccount, isPastDue]);

  const homeKpis = useMemo((): OwnerKpiItem[] => [
    {
      id: 'revenue',
      label: 'Bugünkü Ciro',
      value: money(dynamicTotalRevenue),
      trend: 'up',
      trendLabel: 'Canlı veri',
      accent: 'emerald',
      icon: kpiIcons.wallet,
      onClick: () => setShowRevenueModal(true),
    },
    {
      id: 'occupancy',
      label: 'Doluluk',
      value: `%${dynamicOccupancyRatio}`,
      sublabel: dynamicOccupancyRatio < 50 ? 'Düşük' : 'İyi',
      accent: dynamicOccupancyRatio < 50 ? 'red' : 'emerald',
      icon: kpiIcons.users,
      onClick: () => setShowOccupancyModal(true),
    },
    {
      id: 'confirmed',
      label: 'Onaylı Maç',
      value: String(confirmedToday),
      sublabel: 'Bugün',
      accent: 'blue',
      icon: kpiIcons.calendar,
      onClick: () => setActiveTab('CALENDAR'),
    },
  ], [dynamicTotalRevenue, dynamicOccupancyRatio, confirmedToday]);

  useEffect(() => {
      localStorage.setItem('owner_activeWidgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  const toggleFacilityStatus = async () => {
    if (!effGuardWrite()) return;
    if (!facilityData?.id) return;

    const newStatus = !isFacilityOpen;
    setIsFacilityOpen(newStatus); // iyimser güncelleme

    const pitchId = realPitchId ?? (typeof facilityData.id === 'string' && !facilityData.id.startsWith('mock-') ? facilityData.id : null);
    if (!pitchId) return; // demo modu: yalnız yerel durum

    try {
      await togglePitchOpen(pitchId, newStatus);
    } catch (err) {
      console.error('Tesis durumu güncellenemedi:', err);
      setIsFacilityOpen(!newStatus); // hata: geri al
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('NO_TARIFF')) {
        notify('Sahayı yayına almadan önce en az bir aktif tarife girmelisin (0 TL olabilir).', 'warning');
      } else {
        notify(toTurkishError(err), 'error');
      }
    }
  };

  useEffect(() => {
    if (activeTab !== 'MORE' || !realPitchId) return;
    if (realPitchId.startsWith('mock-')) {
      // OP-P0-4/N-5: demo tesiste sahte ₺12.500 bakiye gösterme (çekilebilir gerçek
      // para izlenimi verir). Demo'da bakiye 0.
      setMenuBalance(0);
      return;
    }
    getOwnerBalance(realPitchId)
      .then((b) => setMenuBalance(b.available))
      .catch(() => setMenuBalance(0));
  }, [activeTab, realPitchId]);

  const menuStats: OwnerMenuStats = useMemo(
    () => ({
      isFacilityOpen,
      bankAccountCount: facilityData?.bankAccounts?.length ?? 0,
      availableBalance: menuBalance,
      paramConfigured: Boolean(
        facilityData?.paramMerchantId &&
          facilityData?.paramApiKey &&
          facilityData?.paramClientId,
      ),
      courtCount: courts.filter((c) => c.is_active !== false).length,
      // Kendi tarifesi (court_id = kort) olmayan AKTİF saha sayısı. Kural
      // shared/courtTariffGate'te tek yerde durur; sunucu ikizi
      // trg_enforce_court_tariff_before_activate.
      courtsWithoutTariff: courtsMissingTariff(
        courts,
        (facilityData?.pricingPolicy ?? []) as { court_id?: string | null }[],
      ).length,
    }),
    [
      isFacilityOpen,
      facilityData,
      menuBalance,
      courts,
    ],
  );

  // Kurulum Sihirbazı adımları (Faz 7): eksik olan her adım tek dokunuşla açılır.
  const setupSteps = useMemo((): SetupStep[] => {
    const fd = facilityData;
    const openProfile = (tab: 'general' | 'location') => {
      if (managerGuard()) { setEditProfileTab(tab); setShowEditProfile(true); }
    };
    return [
      { key: 'court', label: 'Saha ekle', hint: 'En az bir saha tanımla', done: menuStats.courtCount > 0,
        onFix: () => { if (managerGuard()) setActiveTab('PITCHES'); } },
      { key: 'location', label: 'Konumu işaretle', hint: 'Haritada pin — vitrin için şart', done: fd?.latitude != null && fd?.longitude != null,
        onFix: () => openProfile('location') },
      { key: 'photo', label: 'Fotoğraf yükle', hint: 'Tesis ve saha görselleri', done: (fd?.images?.length ?? 0) > 0,
        onFix: () => openProfile('general') },
      // Her saha kendi tarifesini girer: adım, tarifesiz saha kalmayınca tamamlanır.
      { key: 'tariff', label: 'Saha fiyat politikası', hint: 'Her saha için saat/gün bazlı ücret',
        done: menuStats.courtCount > 0 && menuStats.courtsWithoutTariff === 0,
        onFix: () => { if (managerGuard()) setActiveTab('PITCHES'); } },
      { key: 'hours', label: 'Çalışma saatleri', hint: 'Açık/kapalı saatler', done: (fd?.workingHours?.length ?? 0) > 0,
        onFix: () => { if (managerGuard()) setShowWorkingHours(true); } },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityData, menuStats.courtCount, menuStats.courtsWithoutTariff]);

  if (needsOnboarding && !isLoading) {
    // IP-22: kendi kendine tesis başvurusu kaldırıldı. Tesisler OYNA ekibi
    // tarafından eklenir; panel de artık olmayan bir kayıt akışını vaat etmez.
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#0A0E14] text-white p-8 text-center safe-top safe-bottom">
        <Building2 size={64} className="text-[#FACC15] mb-6" />
        <h1 className="text-2xl font-extrabold mb-3">Hesabına bağlı tesis yok</h1>
        <p className="text-gray-400 text-sm max-w-sm mb-8">
          Tesisler OYNA ekibi tarafından tanımlanır ve yetkileri buradan verilir.
          Anlaşman varsa tesisin panele bağlanması için OYNA ile iletişime geç.
        </p>
        <button onClick={onBack} className="text-ink-4 text-sm font-bold">Geri Dön</button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0E14] text-slate-200 font-sans selection:bg-blue-500 selection:text-white relative">
      <OwnerStatusBar banners={statusBanners} />
      
      {/* Header logic adjustment for Menu view */}
      {activeTab !== 'CALENDAR' && activeTab !== 'MORE' && (
          <header className={`px-6 py-4 ${statusBanners.length ? '' : 'pt-safe'} bg-[#0A0E14] border-b border-white/5 flex justify-between items-center sticky top-0 z-30`}>
              <div className="flex items-center gap-3">
                  <div className="flex flex-col relative">
                      {ownedFacilities.length > 1 && !isDemoMode ? (
                        <button
                          type="button"
                          onClick={() => setShowFacilityPicker((v) => !v)}
                          className="flex items-center gap-1 text-left"
                        >
                          <h1 className="text-sm font-bold text-white tracking-wide">OYNA İŞLETME</h1>
                          <ChevronDown size={14} className="text-gray-400" />
                          <p className="text-[0.6875rem] text-emerald-400 font-medium">{facilityData?.name ?? 'Tesisim'}</p>
                        </button>
                      ) : (
                        <>
                          <h1 className="text-sm font-bold text-white tracking-wide text-shadow">OYNA İŞLETME</h1>
                          <p className="text-[0.6875rem] text-ink-4 font-medium">{facilityData?.name ?? 'Tesisim'}</p>
                        </>
                      )}
                      {showFacilityPicker && ownedFacilities.length > 1 && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-[#161B22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                          {ownedFacilities.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => switchFacility(f.id)}
                              className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-white/5 ${f.id === realPitchId ? 'text-emerald-400' : 'text-white'}`}
                            >
                              {f.name}
                              {f.district ? <span className="block text-[0.6875rem] text-ink-4 font-normal">{f.district}</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
              </div>
              <div className="flex items-center gap-2">
                  {/* BULGU-125: rozet başlıktan alındı — Takvim/Menü'de başlık hiç
                      render edilmiyordu; şerit artık alt barın üstünde, tüm sekmelerde. */}
                  <button
                    onClick={() => setIsNotificationsOpen(true)}
                    aria-label="Bildirimler"
                    className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[#252B3B] text-gray-400 relative active:scale-95 transition-transform"
                  >
                      <Bell size={20} />
                  </button>
              </div>
          </header>
      )}

      {/* Simplified Header for Menu View */}
      {activeTab === 'MORE' && (
          <header className={`px-6 py-4 ${statusBanners.length ? '' : 'pt-safe'} bg-[#0A0E14] border-b border-white/5 flex items-center sticky top-0 z-30`}>
              <h1 className="text-lg font-extrabold text-white tracking-wide">MENÜ & AYARLAR</h1>
          </header>
      )}

      {activeTab === 'HOME' && isLoading && <OwnerHomeSkeleton />}

      {activeTab === 'HOME' && !isLoading && (
          // pb-40: çevrimdışı kuyruk şeridi (44px) + alt bar son kartı örtmesin.
          <main className="flex-1 px-6 pt-6 overflow-y-auto custom-scrollbar pb-40">
              <OwnerCommandStrip
                isFacilityOpen={isFacilityOpen}
                onCalendarClick={() => setActiveTab('CALENDAR')}
              />

              {/* Kurulum Sihirbazı — yalnız gerçek tesiste ve eksik adım varken (Faz 7) */}
              {!isDemoMode && !isAdminPreview && realPitchId && (
                <OwnerSetupProgress steps={setupSteps} />
              )}

              {activeWidgets.includes('QUICK_STATS') && (
                  <OwnerKpiGrid items={homeKpis} />
              )}

              {/* Quick Actions */}
              {activeWidgets.includes('QUICK_ACTIONS') && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button 
                      onClick={() => onNavigate('QR_SCANNER')}
                      className="flex flex-col items-center justify-center p-6 bg-blue-600 rounded-3xl border border-blue-400/30 shadow-xl shadow-blue-900/20 group hover:bg-blue-500 transition-all active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Trophy size={24} className="text-white" />
                      </div>
                      <span className="text-sm font-extrabold italic text-white">SKOR GİR</span>
                      <span className="text-[0.625rem] font-bold text-blue-100 mt-1 uppercase tracking-widest">Maç seç veya kod gir</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('CALENDAR')}
                      className="flex flex-col items-center justify-center p-6 bg-[#161B22] rounded-3xl border border-white/5 hover:border-white/10 transition-all group active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Plus size={24} className="text-white" />
                      </div>
                      <span className="text-sm font-extrabold italic text-white">YENİ KAYIT</span>
                      <span className="text-[0.625rem] font-bold text-ink-4 mt-1 uppercase tracking-widest">Rezervasyon</span>
                    </button>
                  </div>
              )}

              {activeWidgets.includes('OCCUPANCY_ANALYSIS') && (
                  <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
                    <button
                      onClick={() => setActiveTab('CALENDAR')}
                      className="w-full font-bold text-white text-base flex items-center justify-between mb-6 group"
                    >
                        <span className="flex items-center gap-2"><BarChartIcon size={18} className="text-indigo-500" /> Saha Doluluk Analizi</span>
                        <span className="text-[0.625rem] font-bold text-ink-4 group-hover:text-white uppercase tracking-wider flex items-center gap-1">Takvim <ChevronRight size={13} /></span>
                    </button>
                    <PitchOccupancyGrid grid={occupancyGrid} />
                  </div>
              )}

          </main>
      )}

      {activeTab === 'CALENDAR' && (
        <ErrorBoundary onBack={() => setActiveTab('HOME')} backLabel="Özet'e Dön" fullScreen={false}>
        <FinancialCalendarView
          pitchId={facilityData?.id ?? ''}
          pricingPolicy={facilityData?.pricingPolicy}
          courts={courts}
          readOnly={effReadOnly}
          canFlashDeals={can.flashDeals}
          workingHours={facilityData?.workingHours}
          onNavigate={onNavigate}
          onPricingUpdated={async () => {
            if (!realPitchId || !facilityData?.ownerId) return;
            const list = await getOwnerPitches(facilityData.ownerId);
            const pitch = list.find((p) => p.id === realPitchId);
            if (pitch) {
              setFacilityData((prev: any) => ({
                ...prev,
                pricingPolicy: (pitch.pitch_tariffs ?? []).map(tariffRowToPolicy),
              }));
            }
          }}
        />
        </ErrorBoundary>
      )}
      {activeTab === 'PITCHES' && (
        <PitchManager
          facilityId={facilityData?.id}
          pitches={courts}
          onUpdatePitches={setCourts}
          onBack={() => setActiveTab('HOME')}
          readOnly={effReadOnly}
          maxCourts={maxCourts}
          showBack={false}
        />
      )}
      {/* Finans & Ekip her owner'a açık — plan/abonelik kilidi yok (karar: owner abonelik ödemez). */}
      {activeTab === 'FINANCE' && (
        <OwnerFinanceView
          pitchId={realPitchId ?? facilityData?.id ?? ''}
          isDemoMode={isDemoMode}
          readOnly={effReadOnly}
          onOpenCalendar={() => setActiveTab('CALENDAR')}
        />
      )}
      {activeTab === 'TEAM' && (
        <OwnerTeamView
          pitchId={realPitchId ?? facilityData?.id ?? ''}
          isDemoMode={isDemoMode}
          readOnly={effReadOnly}
          maxStaff={maxStaff}
          accessLevel={accessLevel}
        />
      )}
      {activeTab === 'MORE' && (
        <OwnerMenuView
          onNavigate={onNavigate}
          onBack={onBack}
          facilityName={facilityData?.name}
          facilityDistrict={[facilityData?.district, facilityData?.city].filter(Boolean).join(', ')}
          facilityImage={facilityData?.images?.[0]}
          accountStatus={ownerAccount ? accountStatusLabel(ownerAccount.status) : 'Aktif'}
          stats={menuStats}
          onEditProfile={() => {
            if (managerGuard()) setShowEditProfile(true);
          }}
          onWorkingHours={() => {
            if (managerGuard()) setShowWorkingHours(true);
          }}
          onMatches={() => {
            if (managerGuard()) setShowMatches(true);
          }}
          onBankAccounts={() => {
            if (ownerOnlyGuard()) setShowBankAccountList(true);
          }}
          onWithdrawals={() => { if (ownerOnlyGuard()) setShowWithdrawals(true); }}
          onCancellationPolicy={() => {
            // Karar: iade politikası yönetim ayarı — sahip + müdür düzenler.
            if (managerGuard()) setShowCancellationPolicy(true);
          }}
          onPaymentMode={() => {
            // Ödeme modu paranın nasıl toplandığını belirler → yalnız tesis sahibi.
            if (ownerOnlyGuard()) setShowPaymentMode(true);
          }}
          onSecurity={() => setShowSecurity(true)}
          onSupport={() => setShowSupport(true)}
          onLogout={() => setShowLogoutConfirm(true)}
          onNotifications={() => setShowNotifPrefs(true)}
          onWidgetSettings={() => setShowWidgetSettings(true)}
          onPitches={() => {
            if (managerGuard()) setActiveTab('PITCHES');
          }}
          onSwitchRole={() => setIsRoleSwitcherOpen(true)}
          canSwitchRole={canSwitchRole}
          isReadOnly={effReadOnly}
          accessLevel={accessLevel}
        />
      )}

      {/* MODALS */}
      {showEditProfile && (
        <OwnerFacilitySettingsModal
          onClose={() => setShowEditProfile(false)}
          facilityId={facilityData?.id}
          initialData={facilityData}
          initialTab={editProfileTab}
          onSave={(data) => setFacilityData((prev: any) => ({ ...prev, ...data }))}
          onOpenCourts={() => {
            setShowEditProfile(false);
            if (effGuardWrite()) setActiveTab('PITCHES');
          }}
          onOpenPricing={() => {
            setShowEditProfile(false);
            // Fiyat politikası saha bazlı: Sahalarım listesine götür.
            if (effGuardWrite()) setActiveTab('PITCHES');
          }}
          onOpenHours={() => {
            setShowEditProfile(false);
            if (effGuardWrite()) setShowWorkingHours(true);
          }}
        />
      )}
      {showWorkingHours && (
        <OwnerWorkingHoursModal
          onClose={() => setShowWorkingHours(false)}
          facilityId={facilityData?.id}
          isOpen={isFacilityOpen}
          onToggleOpen={toggleFacilityStatus}
          initialHours={facilityData?.workingHours}
          onSave={(hours) => setFacilityData((prev: any) => ({ ...prev, workingHours: hours }))}
        />
      )}
      {showNotifPrefs && (
        <OwnerNotificationsModal onClose={() => setShowNotifPrefs(false)} />
      )}
      {showMatches && (
        <OwnerMatchesModal
          pitchId={realPitchId ?? facilityData?.id ?? ''}
          /* Karar #26: skor girişi yalnız SAHİP + MÜDÜR; PERSONEL salt-okunur. */
          readOnly={effReadOnly || !isManagerLevel}
          onClose={() => setShowMatches(false)}
        />
      )}
      {showBankAccountList && (
        <OwnerBankAccountsModal
          pitchId={facilityData?.id ?? ''}
          onClose={() => setShowBankAccountList(false)}
          onUpdated={(accounts) =>
            setFacilityData((prev: any) => (prev ? { ...prev, bankAccounts: accounts } : prev))
          }
          readOnly={effReadOnly}
        />
      )}
      {showWithdrawals && (
        <OwnerWithdrawalsModal
          onClose={() => setShowWithdrawals(false)}
          facilityId={facilityData?.id}
          readOnly={effReadOnly}
        />
      )}
      {showCancellationPolicy && (
        <OwnerCancellationPolicyModal
          onClose={() => setShowCancellationPolicy(false)}
          facilityId={facilityData?.id ?? ''}
          readOnly={isReadOnly}
        />
      )}
      {showPaymentMode && (
        <OwnerPaymentSettingsModal
          onClose={() => setShowPaymentMode(false)}
          facilityId={facilityData?.id ?? ''}
          readOnly={isReadOnly}
          onSave={(data) =>
            setFacilityData((prev: any) => ({ ...prev, paymentOptions: data.paymentOptions }))
          }
        />
      )}
      {showSecurity && <OwnerSecurityModal onClose={() => setShowSecurity(false)} />}
      {showSupport && <OwnerSupportModal onClose={() => setShowSupport(false)} />}
      {showWidgetSettings && (
        <OwnerWidgetSettingsModal
          onClose={() => setShowWidgetSettings(false)}
          activeWidgets={activeWidgets}
          onToggleWidget={toggleWidget}
        />
      )}
      {showLogoutConfirm && (
        <OwnerLogoutModal onClose={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); setStaffPanelContext(null); (onLogout ?? onBack)(); }} />
      )}

      {/* FAZ2: ortada kırpılan dialog → klavye-farkında, kaydırılabilir, güvenli-alanlı bottom-sheet.
          Çok kortlu tesiste liste artık taşmıyor; backdrop/Esc ile kapanıyor. */}
      <OwnerBottomSheet
          open={showRevenueModal}
          onClose={() => setShowRevenueModal(false)}
          title="Ciro Detayları"
          subtitle="Bugünkü saha bazlı tahsilat"
      >
          <div className="space-y-3">
              {courtStats.length === 0 ? (
                  <p className="text-sm text-ink-4 text-center py-6">Bugün için saha bazlı ciro verisi yok.</p>
              ) : courtStats.map((item) => (
                  <div key={item.courtId} className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-400">{item.courtName}</span>
                      <span className="text-lg font-extrabold text-emerald-400 tabular-nums">{money(item.collected)}</span>
                  </div>
              ))}
              <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                  <span className="text-base font-extrabold text-white">TOPLAM TAHSİLAT</span>
                  <span className="text-2xl font-extrabold text-emerald-500 tabular-nums">{money(dynamicTotalRevenue)}</span>
              </div>
          </div>
      </OwnerBottomSheet>

      <OwnerBottomSheet
          open={showOccupancyModal}
          onClose={() => setShowOccupancyModal(false)}
          title="Doluluk Detayı"
          subtitle="Bugünkü saha bazlı doluluk"
      >
          <div className="space-y-6">
              {courtStats.length === 0 ? (
                  <p className="text-sm text-ink-4 text-center py-6">Bugün için doluluk verisi yok.</p>
              ) : courtStats.map((item) => (
                  <div key={item.courtId} className="space-y-2">
                      <div className="flex justify-between items-end">
                          <span className="text-sm font-bold text-white">{item.courtName}</span>
                          <span className={`text-sm font-extrabold tabular-nums ${item.occupancyPercent < 50 ? 'text-red-500' : 'text-emerald-500'}`}>%{item.occupancyPercent}</span>
                      </div>
                      <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${item.occupancyPercent < 50 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${item.occupancyPercent}%` }}></div>
                      </div>
                      <p className="text-[0.6875rem] text-ink-4">{item.bookedHours}/{item.totalHours} saat dolu</p>
                  </div>
              ))}
          </div>
      </OwnerBottomSheet>


      {/* BULGU-125: bekleyen kasa işlemleri HER sekmede görünür (kuyruk boşken render olmaz). */}
      <OutboxBadge variant="strip" />

      <OwnerBottomNav
        activeTab={activeTab}
        financeLocked={false}
        teamLocked={false}
        hiddenTabs={accessLevel === 'STAFF' ? ['FINANCE', 'TEAM'] : []}
        onSelect={(tab) => {
          if (tab === 'MORE') setActiveTab('MORE');
          else handleTabSelect(tab);
        }}
      />
      {confirmElement}
    </div>
  );
};

const OwnerPanel: React.FC<OwnerPanelProps> = (props) => (
  <OwnerToastProvider>
    <OwnerPanelInner {...props} />
  </OwnerToastProvider>
);

export default OwnerPanel;
