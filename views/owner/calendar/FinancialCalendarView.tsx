// Owner takvimi — gün ekranı çalışma penceresindeki AKTİF saatlerle açılır,
// üstte bugünden itibaren 30 günlük kaydırılabilir şerit, aylık görünümden gün
// seçimi doğrudan o günün saat ekranına götürür. (Tesis/Hafta modları kaldırıldı.)
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Lock, MoreHorizontal, Pause, Percent, Phone,
  Play, Plus, RefreshCw, Shield, Tag, TrendingUp, User, X,
} from 'lucide-react';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerBottomSheet } from '../components/OwnerBottomSheet';
import { useConfirmSheet } from '../components/useConfirmSheet';
import { OwnerSubscriptionModal } from '../OwnerSubscriptionModal';
import { OwnerFlashDealModal } from '../OwnerFlashDealModal';
import { OwnerCloseSlotModal } from '../OwnerCloseSlotModal';
import { OwnerBookingDetailModal } from '../OwnerBookingDetailModal';
import { OwnerSpecialPriceModal } from '../OwnerSpecialPriceModal';
import { findFlashDealForSlot, isSlotClosed, localDateISO, resolveHourlyPrice, resolveHourlyDeposit } from '../ownerCalendarHelpers';
import { parseTRYAmount } from '../../../shared/financeModel';
import { resolveWorkingHoursForDate, isHourWithinWorkingHours, openHourCount } from '../../../shared/workingHours';
import { buildSlotGrid, sellableMinutesForDate, type SlotTariffInput } from '../../../shared/slotGrid';
import { formatCapacityRange } from '../../../shared/pitchShowcaseMapper';
import {
  getPitchBookings, ownerCreateManualBooking, getSubscriptions, updateSubscriptionStatus,
  setSubscriptionAutoRenew, subscribeToOwnerBookings, getActiveFlashDeals,
  getAvailabilityExceptions, getMonthlyBookingDensity, toTurkishError,
} from '../../../services/pitchOwnerService';
import { todayISO } from '../ownerPanelShared';
import type { PitchBookingFull, PitchCourt, FlashDeal, PitchAvailabilityException } from '../../../types';

// Takvim veri modeli (SALT TAŞIMA)
interface CalendarBooking {
    id: string;
    time: string;
    duration: number;
    user: string;
    type: 'APP' | 'PHONE' | 'SUB' | 'DAILY';
    status: 'PAID' | 'PARTIAL' | 'PENDING';
    price: number;
    paid: number;
    note?: string;
    pitchId: string;
    date?: string;
}

function formatDateISO(d: Date): string {
  return localDateISO(d);
}

/** Üst gün şeridi: bugünden itibaren 30 gün (kaydırılabilir). */
const DAY_STRIP_LENGTH = 30;

function buildDayStrip(base = new Date()): Date[] {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: DAY_STRIP_LENGTH }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Aylık grid: Pazartesi başlangıçlı hafta dizileri (ay dışı hücreler null). */
function buildMonthWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Pazartesi=0
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}


function mapDbBookingToCalendar(b: PitchBookingFull): CalendarBooking {
  const start = (b.start_time ?? '00:00').slice(0, 5);
  const endRaw = (b.end_time ?? '').slice(0, 5);
  const startH = parseInt(start.split(':')[0], 10);
  let endH = endRaw ? parseInt(endRaw.split(':')[0], 10) : startH + 1;
  if (endRaw.slice(0, 2) === '00') endH = 24;      // gece yarısı bitişi
  if (!Number.isFinite(endH) || endH <= startH) endH = startH + 1;
  return {
    id: b.id,
    time: start.replace(':', '.'),
    duration: Math.max(1, endH - startH),           // B4/OP-P1-7: gerçek süre (çok-saatlik rezervasyon)
    user: b.customer_name || b.title || 'Misafir',
    type: b.source === 'SUBSCRIPTION' ? 'SUB' : b.source === 'OWNER_MANUAL' ? 'PHONE' : 'APP',
    status: b.payment_status === 'PAID' ? 'PAID' : b.payment_status === 'PARTIAL' ? 'PARTIAL' : 'PENDING',
    price: b.price ?? 0,
    paid: b.paid_amount ?? 0,
    note: b.note ?? undefined,
    pitchId: b.court_id ?? '',
    date: b.booking_date,
  };
}

type OwnerTab = 'HOME' | 'CALENDAR' | 'FINANCE' | 'TEAM' | 'MORE' | 'PENDING_ACTIONS' | 'PITCHES';

// --- COMPONENTS ---


export const FinancialCalendarView: React.FC<{
  pitchId: string;
  pricingPolicy?: any[];
  courts?: PitchCourt[];
  readOnly?: boolean;
  canFlashDeals?: boolean;
  workingHours?: unknown;
  onNavigate?: (view: string) => void;
  onPricingUpdated?: () => void;
}> = ({ pitchId, pricingPolicy, courts = [], readOnly = false, canFlashDeals = true, workingHours, onNavigate, onPricingUpdated }) => {
    const notify = useOwnerToast();
    const { confirm, confirmElement } = useConfirmSheet();
    const dayStrip = useMemo(() => buildDayStrip(), []);
    const dayStripRef = useRef<HTMLDivElement | null>(null);
    // Gün şeridi kaydırma konumu — kenar fade'lerini (keşfedilebilirlik) yönetir.
    const [stripAtStart, setStripAtStart] = useState(true);
    const [stripAtEnd, setStripAtEnd] = useState(false);
    const dayScrollRef = useRef<HTMLDivElement | null>(null);

    // Seçili gün artık ISO tarih — 30 günlük şerit ve aylık görünüm aynı state'i sürer.
    const [selectedDateISO, setSelectedDateISO] = useState(() => todayISO());
    const [selectedCourtId, setSelectedCourtId] = useState(courts[0]?.id ?? '');
    const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
    const [isQuickCreateOpen, setIsQuickCreateOpen] = useState<string | null>(null);
    const [flashDealModalOpen, setFlashDealModalOpen] = useState<string | null>(null);
    const [closeSlotModalOpen, setCloseSlotModalOpen] = useState<string | null>(null);
    const [specialPriceModalOpen, setSpecialPriceModalOpen] = useState<string | null>(null);
    const [isMonthlyView, setIsMonthlyView] = useState(false);
    const [monthCursor, setMonthCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
    // İlk ekran: yalnız AKTİF (çalışma penceresi içi) saatler; owner isterse tümünü açar.
    const [showAllHours, setShowAllHours] = useState(false);
    const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
    const [isAddingSlot, setIsAddingSlot] = useState(false);
    const [isLoadingBookings, setIsLoadingBookings] = useState(false);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subMenuId, setSubMenuId] = useState<string | null>(null);
    const [subActionBusy, setSubActionBusy] = useState(false);
    const [flashDeals, setFlashDeals] = useState<FlashDeal[]>([]);
    const [closedSlots, setClosedSlots] = useState<PitchAvailabilityException[]>([]);
    const [monthDensity, setMonthDensity] = useState<Record<string, number>>({});

    const [bookings, setBookings] = useState<CalendarBooking[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PARTIAL' | 'PENDING'>('PENDING');
    // BULGU-123: elden alınan kapora TUTARI — sahibi girer, uydurulmaz.
    const [depositStr, setDepositStr] = useState('');

    const isRealPitch = !!pitchId && !pitchId.startsWith('mock-');

    // Aylıktan/şeritten gün seçimi: doğrudan o günün saat ekranı açılır.
    const selectDay = (iso: string) => {
        setSelectedDateISO(iso);
        setIsMonthlyView(false);
    };

    // Seçili gün şeridin içindeyse görünür konuma kaydır.
    useEffect(() => {
        const el = dayStripRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selectedDateISO}"]`);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [selectedDateISO]);

    // UX (Faz 5): bugün seçiliyken gün ekranı açılınca ŞU ANKİ saate kaydır —
    // owner geçmiş saatleri geçip doğrudan güncel/yaklaşan slotları görsün.
    useEffect(() => {
        if (isMonthlyView) return;
        if (selectedDateISO !== todayISO()) return;
        const nowHour = new Date().getHours();
        const key = `${String(nowHour).padStart(2, '0')}.00`;
        const t = setTimeout(() => {
            dayScrollRef.current?.querySelector<HTMLElement>(`[data-hour="${key}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
        return () => clearTimeout(t);
    }, [selectedDateISO, isMonthlyView, showAllHours]);
    // WP6: seçili günün çalışma penceresi (owner ayarı = takvim penceresi = tüketici).
    const dayHours = useMemo(
        () => resolveWorkingHoursForDate(workingHours as any, selectedDateISO),
        [workingHours, selectedDateISO],
    );
    // Izgara TEK KAYNAK: pricingPolicy satırları shared/slotGrid'in beklediği
    // biçime çevrilir; takvim, doluluk ve tüketici ekranı aynı kuralı kullanır.
    const tariffsForGrid = useMemo<SlotTariffInput[]>(
        () => (pricingPolicy ?? []).map((p: any) => ({
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
        [pricingPolicy],
    );
    const activeCourts = courts.filter((c) => c.is_active !== false);

    useEffect(() => {
        if (activeCourts.length && !activeCourts.find((c) => c.id === selectedCourtId)) {
            setSelectedCourtId(activeCourts[0].id);
        }
    }, [activeCourts, selectedCourtId]);

    const loadBookings = React.useCallback(async () => {
        if (!isRealPitch || !pitchId) {
            setBookings([]);
            return;
        }
        setIsLoadingBookings(true);
        try {
            const rows = await getPitchBookings(pitchId, selectedDateISO, selectedCourtId || undefined);
            setBookings(rows.map(mapDbBookingToCalendar));
        } catch (err) {
            notify(toTurkishError(err), 'error');
            setBookings([]);
        } finally {
            setIsLoadingBookings(false);
        }
    }, [isRealPitch, pitchId, selectedDateISO, selectedCourtId]);

    useEffect(() => {
        loadBookings();
    }, [loadBookings]);

    useEffect(() => {
        if (!isRealPitch || !pitchId) return;
        return subscribeToOwnerBookings(pitchId, loadBookings, 'calendar');
    }, [isRealPitch, pitchId, loadBookings]);

    useEffect(() => {
        if (!isRealPitch || !pitchId) return;
        getSubscriptions(pitchId)
            .then(setSubscriptions)
            .catch(() => setSubscriptions([]));
    }, [isRealPitch, pitchId, isMonthlyView, isSubscriptionModalOpen]);

    const reloadSubscriptions = React.useCallback(() => {
        if (!isRealPitch || !pitchId) return;
        getSubscriptions(pitchId).then(setSubscriptions).catch(() => setSubscriptions([]));
    }, [isRealPitch, pitchId]);

    const handleSubStatus = async (id: string, status: 'ACTIVE' | 'PAUSED' | 'CANCELLED') => {
        if (status === 'CANCELLED') {
            const ok = await confirm({
                title: 'Aboneliği iptal et?',
                message: 'Bu abonelik iptal edilecek. Bu işlem geri alınamaz.',
                confirmLabel: 'İptal Et',
                destructive: true,
            });
            if (!ok) return;
        }
        setSubActionBusy(true);
        try {
            await updateSubscriptionStatus(id, status);
            notify(
                status === 'CANCELLED' ? 'Abonelik iptal edildi.'
                : status === 'PAUSED' ? 'Abonelik duraklatıldı.'
                : 'Abonelik devam ettirildi.',
                'success',
            );
            setSubMenuId(null);
            reloadSubscriptions();
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setSubActionBusy(false);
        }
    };

    const handleSubAutoRenew = async (id: string, next: boolean) => {
        setSubActionBusy(true);
        try {
            await setSubscriptionAutoRenew(id, next);
            notify(next ? 'Otomatik yenileme açıldı.' : 'Otomatik yenileme kapatıldı.', 'success');
            reloadSubscriptions();
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setSubActionBusy(false);
        }
    };

    const loadSlotMeta = React.useCallback(async () => {
        if (!isRealPitch || !pitchId) {
            setFlashDeals([]);
            setClosedSlots([]);
            return;
        }
        try {
            const [deals, exceptions] = await Promise.all([
                getActiveFlashDeals(pitchId, selectedDateISO, selectedCourtId || undefined),
                getAvailabilityExceptions(pitchId, selectedDateISO, selectedCourtId || undefined),
            ]);
            setFlashDeals(deals);
            setClosedSlots(exceptions);
        } catch (err) {
            notify(toTurkishError(err), 'error');
            setFlashDeals([]);
            setClosedSlots([]);
        }
    }, [isRealPitch, pitchId, selectedDateISO, selectedCourtId]);

    useEffect(() => {
        loadSlotMeta();
    }, [loadSlotMeta]);

    // Aylık görünüm yoğunluk noktaları: gösterilen ayın rezervasyon sayıları.
    useEffect(() => {
        if (!isMonthlyView || !isRealPitch || !pitchId) { setMonthDensity({}); return; }
        const startISO = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(monthCursor.y, monthCursor.m + 1, 0).getDate();
        const endISO = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        getMonthlyBookingDensity(pitchId, startISO, endISO).then(setMonthDensity).catch(() => setMonthDensity({}));
    }, [isMonthlyView, isRealPitch, pitchId, monthCursor]);

    // Fiyat GERÇEK tarifeden gelir (saha-öncelikli + gün-farkında); tarife yoksa null.
    const getSlotPrice = (time: string): number | null => {
        const hour = parseInt(time.split('.')[0], 10);
        const defaultPrice = resolveHourlyPrice(hour, pricingPolicy, selectedCourtId || null, selectedDateISO);
        const deal = findFlashDealForSlot(time, selectedCourtId, flashDeals);
        return deal ? deal.deal_price : defaultPrice;
    };

    // BULGU-123: kapora varsayılanı GERÇEK tarifeden gelir (uydurma %25 yok).
    const getSlotDeposit = (time: string): number | null =>
        resolveHourlyDeposit(parseInt(time.split('.')[0], 10), pricingPolicy, selectedCourtId || null, selectedDateISO);

    // Kapora doğrulaması tek yerde: KAYDET kilidi ve alan altındaki uyarı aynı sonucu kullanır.
    const quickSlotRate = isQuickCreateOpen ? getSlotPrice(isQuickCreateOpen) : null;
    const quickTariffDeposit = isQuickCreateOpen ? getSlotDeposit(isQuickCreateOpen) : null;
    const quickDepositVal = parseTRYAmount(depositStr);
    const isDepositTooBig = quickSlotRate != null && Number.isFinite(quickDepositVal) && quickDepositVal > quickSlotRate;
    const isDepositValid = Number.isFinite(quickDepositVal) && quickDepositVal > 0 && !isDepositTooBig;

    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const allTimeSlots = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}.00`);

    const currentBookings = useMemo(() => {
        return bookings.filter((b) => b.pitchId === selectedCourtId);
    }, [bookings, selectedCourtId]);

    const dailyCollected = currentBookings.reduce((acc, curr) => acc + curr.paid, 0);
    const dailyTotal = currentBookings.reduce((acc, curr) => acc + curr.price, 0);
    const dailyPending = dailyTotal - dailyCollected;
    // OP-P1-6 + WP6: rezervasyon SAYISI değil kapladığı SAAT toplamı; payda = GERÇEK
    // çalışma penceresi (owner'ın o güne ayarladığı açık saat sayısı).
    const bookedHours = currentBookings.reduce((acc, curr) => acc + (curr.duration || 1), 0);
    // Payda SATILABİLİR süre — açık saat DEĞİL. 18:00-23:00 penceresi 5 saat
    // açıktır ama 90 dakikalık slotlarla yalnız 4.5 saati satılabilir; payda
    // açık saat kalırsa tesis her slotu doldursa bile doluluk %90'da takılırdı.
    const sellableMin = dayHours.closed
      ? 0
      : sellableMinutesForDate(
          tariffsForGrid,
          selectedDateISO,
          selectedCourtId || null,
          dayHours,
        );
    const openHours = sellableMin > 0
      ? sellableMin / 60
      : (dayHours.closed ? 0 : openHourCount(dayHours.open, dayHours.close));
    const occupancyRate = openHours > 0 ? Math.min(100, Math.round((bookedHours / openHours) * 100)) : 0;

    // OP-P1-7: bir saat dilimini hangi rezervasyonun kapsadığını + başlangıç mı olduğunu döndürür.
    const getSlotCoverage = (time: string): { booking: CalendarBooking; isStart: boolean } | null => {
        const hour = parseInt(time.split('.')[0], 10);
        for (const b of currentBookings) {
            const sh = parseInt(String(b.time).split(/[.:]/)[0], 10);
            if (!Number.isFinite(sh)) continue;
            const eh = sh + (b.duration || 1);
            if (hour >= sh && hour < eh) return { booking: b, isStart: hour === sh };
        }
        return null;
    };

    /**
     * Gün ekranı saat listesi: çalışma penceresinin açılış saatinden başlayan
     * 24 saatlik dönüşlü sıra (09→…→23→00→…); varsayılan yalnız AKTİF saatler
     * (pencere içi) + pencere dışına taşan mevcut rezervasyon/kapanışlar.
     * "Tümünü göster" ile 24 saat açılır.
     */
    /**
     * GÜN EKRANI SLOT IZGARASI — sabit 24 saat DEĞİL, gerçek tarife ızgarası.
     * Sahip 90 dakika seçtiyse satırlar 18:00-19:30, 19:30-21:00 diye gelir ve
     * yükseklikleri süreyle orantılıdır. Kaynak kullanıcıya görünenle aynı
     * (shared/slotGrid = sunucudaki get_pitch_slots).
     */
    const daySlots = useMemo(
        () => buildSlotGrid(tariffsForGrid, selectedDateISO, selectedCourtId || null, dayHours),
        [tariffsForGrid, selectedDateISO, selectedCourtId, dayHours],
    );

    /** Izgara dışı saatler ("Tümünü göster") — yalnız 60'lık dolgu satırları. */
    const fallbackHourSlots = useMemo(() => {
        const taken = new Set(daySlots.map((s) => s.startTime));
        return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
            .filter((t) => !taken.has(t))
            .map((t) => ({
                startTime: t,
                endTime: `${String((parseInt(t, 10) + 1) % 24).padStart(2, '0')}:00`,
                minutes: 60,
                price: 0,
                deposit: 0,
                crossesMidnight: false,
            }));
    }, [daySlots]);

    const visibleSlots = useMemo(() => {
        const base = showAllHours
            ? [...daySlots, ...fallbackHourSlots].sort((a, b) =>
                a.startTime.localeCompare(b.startTime))
            : daySlots;
        if (showAllHours) return base;
        // Izgara dışına taşan gerçek kayıtlar (ör. gece 03:00 manuel rezervasyon)
        // gizlenmez — sahip parasını göremez duruma düşmesin.
        const extra = fallbackHourSlots.filter((s) => {
            const key = s.startTime.replace(':', '.');
            return !!getSlotCoverage(key) || isSlotClosed(key, selectedCourtId, closedSlots, s.minutes);
        });
        return [...base, ...extra].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }, [daySlots, fallbackHourSlots, showAllHours, currentBookings, selectedCourtId, closedSlots]);

    const visibleTimeSlots = useMemo(() => {
        const openH = parseInt(String(dayHours.open ?? '09:00').split(':')[0], 10) || 0;
        const rotated = Array.from({ length: 24 }, (_, i) => {
            const h = (openH + i) % 24;
            return `${h.toString().padStart(2, '0')}.00`;
        });
        if (showAllHours) return rotated;
        return rotated.filter((time) => {
            const h = parseInt(time.split('.')[0], 10);
            const within = !dayHours.closed && isHourWithinWorkingHours(h, dayHours.open, dayHours.close);
            if (within) return true;
            // Pencere dışında kalan gerçek kayıtlar gizlenmez (ör. gece 03:00 manuel rezervasyon).
            return !!getSlotCoverage(time) || isSlotClosed(time, selectedCourtId, closedSlots);
        });
    }, [dayHours, showAllHours, currentBookings, selectedCourtId, closedSlots]);

    const handleQuickCreate = async (time: string) => {
        setIsQuickCreateOpen(time);
        setCustomerName('');
        setCustomerPhone('');
        setPaymentStatus('PENDING');
        // Alan tarife değeriyle DOLU açılsın; tarifede kapora yoksa boş kalır.
        const d = getSlotDeposit(time);
        setDepositStr(d != null ? String(d) : '');
    };

    const getStatusStyles = (status: string) => {
        switch(status) {
            case 'PAID': return { bg: 'bg-emerald-900/30', border: 'border-emerald-500/50', text: 'text-emerald-400', bar: 'bg-emerald-500' };
            case 'PARTIAL': return { bg: 'bg-yellow-900/30', border: 'border-yellow-500/50', text: 'text-yellow-400', bar: 'bg-yellow-500' };
            case 'PENDING': return { bg: 'bg-red-900/30', border: 'border-red-500/50', text: 'text-red-400', bar: 'bg-red-500' };
            default: return { bg: 'bg-gray-800', border: 'border-gray-600', text: 'text-gray-400', bar: 'bg-gray-500' };
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0A0E14] relative">
            <div className="sticky top-0 z-20 bg-[#0A0E14] border-b border-white/10 shadow-2xl">
                <div className="grid grid-cols-3 gap-2 p-4 pb-2 pt-safe border-b border-white/5 bg-[#161B22]">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-bold uppercase">Tahsilat</span>
                        <span className="text-lg font-black text-emerald-400 tracking-tight font-mono">{dailyCollected}₺</span>
                    </div>
                    <div className="flex flex-col border-l border-white/10 pl-4">
                        <span className="text-[10px] text-gray-500 font-bold uppercase">Bekleyen</span>
                        <span className="text-lg font-black text-red-400 tracking-tight font-mono">{dailyPending}₺</span>
                    </div>
                    <div className="flex flex-col border-l border-white/10 pl-4">
                        <span className="text-[10px] text-gray-500 font-bold uppercase">Doluluk</span>
                        <span className="text-lg font-black text-white tracking-tight font-mono">%{occupancyRate}</span>
                    </div>
                </div>

                <div className="p-4 pt-2 space-y-3">
                    {/* 30 günlük kaydırılabilir gün şeridi (bugünden ileri).
                        Kenar fade'leri "kaydır, daha çok gün var" sinyali verir; touch-action:pan-x
                        yatay swipe'ı garanti eder (dikey kaydırmaya takılmaz). */}
                    <div className="relative">
                        <div
                            ref={dayStripRef}
                            style={{ touchAction: 'pan-x' }}
                            onScroll={(e) => {
                                const el = e.currentTarget;
                                setStripAtStart(el.scrollLeft < 8);
                                setStripAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
                            }}
                            className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 snap-x scroll-smooth overscroll-x-contain"
                        >
                            {dayStrip.map((d, i) => {
                                const iso = formatDateISO(d);
                                const isSel = iso === selectedDateISO;
                                const isToday = iso === todayISO();
                                const showMonth = i === 0 || d.getDate() === 1;
                                return (
                                    <button
                                        key={iso}
                                        data-date={iso}
                                        onClick={() => selectDay(iso)}
                                        className={`flex-shrink-0 w-[52px] py-2 rounded-xl flex flex-col items-center gap-0.5 transition-all border snap-start ${isSel ? 'bg-white/10 text-white border-white/25 shadow-lg' : 'bg-[#161B22] border-transparent text-gray-500 hover:bg-white/5'}`}
                                    >
                                        <span className={`text-[9px] font-black uppercase ${isToday && !isSel ? 'text-[#FACC15]' : ''}`}>
                                            {isToday ? 'Bugün' : d.toLocaleDateString('tr-TR', { weekday: 'short' })}
                                        </span>
                                        <span className="text-sm font-bold">{d.getDate()}</span>
                                        <span className="text-[8px] font-bold uppercase text-gray-600 h-2.5 leading-none">
                                            {showMonth ? d.toLocaleDateString('tr-TR', { month: 'short' }) : ''}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {/* sol fade — yalnız kaydırılmışken */}
                        <div className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0A0E14] to-transparent transition-opacity ${stripAtStart ? 'opacity-0' : 'opacity-100'}`} />
                        {/* sağ fade — devamında gün olduğunu gösterir */}
                        <div className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0A0E14] to-transparent transition-opacity ${stripAtEnd ? 'opacity-0' : 'opacity-100'}`} />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex bg-[#161B22] p-1 rounded-xl overflow-x-auto">
                            {activeCourts.length === 0 ? (
                                <span className="text-xs text-gray-500 px-3 py-2">Saha ekleyin (Menü → Sahalarım)</span>
                            ) : activeCourts.map(p => {
                                // Kort format aralığı rozeti ("6v6–8v8") — null ise yalnız ad.
                                const range = formatCapacityRange(p.min_capacity, p.max_capacity, p.capacity);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedCourtId(p.id)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap px-2 ${selectedCourtId === p.id ? 'bg-[#2D3748] text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {p.name}{range && <span className="opacity-60"> · {range}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setIsMonthlyView(!isMonthlyView)}
                            className={`h-full px-3 py-2 border rounded-xl transition-colors flex items-center justify-center gap-2 ${isMonthlyView ? 'bg-[#FACC15] text-black border-[#FACC15]' : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <CalendarDays size={20} />
                            {isMonthlyView && <span className="text-[10px] font-black uppercase">Aylık</span>}
                        </button>
                    </div>
                </div>
            </div>

            {/* pb-40: çevrimdışı kuyruk şeridi (44px) + alt bar son saati örtmesin. */}
            <div ref={dayScrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-2 pb-40">
                {isMonthlyView ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-[#161B22] rounded-3xl border border-white/10 p-6 mb-6">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setMonthCursor(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}
                                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <h3 className="text-base font-black text-white italic min-w-[130px] text-center">
                                        {new Date(monthCursor.y, monthCursor.m, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()}
                                    </h3>
                                    <button
                                        onClick={() => setMonthCursor(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}
                                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    {/* Takvim 2: aylık gezinirken hızlı bugüne dönüş — bugünün gün ekranını açar. */}
                                    <button
                                        onClick={() => { const now = new Date(); setMonthCursor({ y: now.getFullYear(), m: now.getMonth() }); selectDay(todayISO()); }}
                                        className="ml-1 px-2.5 h-8 rounded-lg bg-[#FACC15]/10 border border-[#FACC15]/25 text-[#FACC15] text-[10px] font-black uppercase tracking-wide hover:bg-[#FACC15]/20 transition-colors"
                                    >
                                        Bugün
                                    </button>
                                </div>
                                <button
                                    onClick={() => {
                                      if (readOnly) {
                                        notify('Hesabınız salt okunur modda.', 'warning');
                                        return;
                                      }
                                      setIsSubscriptionModalOpen(true);
                                    }}
                                    disabled={readOnly}
                                    className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-40"
                                >
                                    <Plus size={14} /> YENİ ABONMAN
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-2 text-center mb-4">
                                {days.map(d => <span key={d} className="text-[10px] font-black text-gray-600 uppercase">{d}</span>)}
                            </div>
                            {/* Gerçek ay grid'i: gün seçilince DOĞRUDAN o günün saat ekranı açılır. */}
                            {buildMonthWeeks(monthCursor.y, monthCursor.m).map((week, wi) => (
                                <div key={wi} className="grid grid-cols-7 gap-2 mb-2">
                                    {week.map((d, di) => {
                                        if (!d) return <div key={di} />;
                                        const iso = formatDateISO(d);
                                        const isToday = iso === todayISO();
                                        const isSelected = iso === selectedDateISO;
                                        const count = monthDensity[iso] ?? 0;
                                        // Yoğunluk: 0 nokta yok, 1-2 düşük, 3-5 orta, 6+ yüksek.
                                        const densityColor = count === 0 ? '' : count <= 2 ? 'bg-emerald-500/70' : count <= 5 ? 'bg-amber-500/80' : 'bg-red-500/80';
                                        return (
                                            <button
                                                key={di}
                                                onClick={() => selectDay(iso)}
                                                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all border ${
                                                    isSelected ? 'bg-white/10 text-white border-white/30 shadow-lg scale-110 z-10' :
                                                    isToday ? 'text-[#FACC15] border-[#FACC15]/30' :
                                                    'text-gray-500 border-transparent hover:bg-white/5'
                                                }`}
                                            >
                                                <span className="text-xs font-bold">{d.getDate()}</span>
                                                {count > 0 && (
                                                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${densityColor}`} title={`${count} rezervasyon`} />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">AKTİF ABONMANLAR</h4>
                            {subscriptions.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">Abonman bulunmuyor.</p>
                            ) : subscriptions.map(sub => {
                                const dayNames = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
                                const courtName = activeCourts.find(c => c.id === sub.court_id)?.name ?? 'Saha';
                                const isPaused = sub.status === 'PAUSED';
                                const autoRenew = sub.auto_renew !== false;
                                return (
                                <div key={sub.id} className={`bg-[#161B22] p-4 rounded-2xl border flex justify-between items-center group ${isPaused ? 'border-amber-500/20 opacity-70' : 'border-white/5'}`}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPaused ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                            <RefreshCw size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-black text-white truncate">{sub.customer_name}</p>
                                                {isPaused && <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Duraklatıldı</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase">{dayNames[sub.weekday] ?? ''} • {(sub.start_time ?? '').slice(0,5).replace(':','.')} • {courtName}</p>
                                            <p className={`text-[9px] font-bold mt-0.5 flex items-center gap-1 ${autoRenew ? 'text-blue-400/80' : 'text-gray-600'}`}>
                                                <RefreshCw size={10} /> {autoRenew ? 'Otomatik yenileniyor' : 'Otomatik yenileme kapalı'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={() => setSubMenuId(subMenuId === sub.id ? null : sub.id)}
                                            className="p-2 text-gray-600 hover:text-white transition-colors"
                                        >
                                            <MoreHorizontal size={20} />
                                        </button>
                                        {subMenuId === sub.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setSubMenuId(null)} />
                                                <div className="absolute right-0 top-10 z-20 w-52 bg-[#0A0E14] border border-white/10 rounded-2xl p-1.5 shadow-2xl">
                                                    <button
                                                        disabled={subActionBusy}
                                                        onClick={() => handleSubAutoRenew(sub.id, !autoRenew)}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50"
                                                    >
                                                        <RefreshCw size={15} className="text-blue-400" />
                                                        {autoRenew ? 'Otomatik yenilemeyi kapat' : 'Otomatik yenilemeyi aç'}
                                                    </button>
                                                    <button
                                                        disabled={subActionBusy}
                                                        onClick={() => handleSubStatus(sub.id, isPaused ? 'ACTIVE' : 'PAUSED')}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50"
                                                    >
                                                        {isPaused ? <Play size={15} className="text-emerald-400" /> : <Pause size={15} className="text-amber-400" />}
                                                        {isPaused ? 'Devam ettir' : 'Duraklat'}
                                                    </button>
                                                    <button
                                                        disabled={subActionBusy}
                                                        onClick={() => handleSubStatus(sub.id, 'CANCELLED')}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                                    >
                                                        <X size={15} />
                                                        Aboneliği iptal et
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );})}
                        </div>
                    </div>
                ) : (
                    <>
                    {/* Gün başlığı: seçili tarih + pencere bilgisi + tüm saatler anahtarı */}
                    <div className="flex items-center justify-between px-1 pb-1">
                        <div className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                            {new Date(`${selectedDateISO}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                            {dayHours.closed
                                ? ' · Bugün kapalı'
                                : ` · ${dayHours.open}–${dayHours.close}`}
                        </div>
                        <button
                            onClick={() => setShowAllHours(v => !v)}
                            className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider transition-colors ${showAllHours ? 'bg-white/10 text-white border-white/20' : 'bg-[#161B22] text-gray-500 border-white/5 hover:text-gray-300'}`}
                        >
                            {showAllHours ? 'Aktif saatler' : 'Tüm saatler'}
                        </button>
                    </div>
                    {dayHours.closed && visibleTimeSlots.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-[#161B22] p-6 text-center">
                            <p className="text-sm font-bold text-gray-400">Bu gün çalışma saatlerinde kapalı.</p>
                            <p className="text-[11px] text-gray-600 mt-1">Menü → Aktif Saatler ve Ücretler'den bu güne tarife ekleyerek açabilirsin.</p>
                        </div>
                    )}
                    {visibleSlots.map((slot) => {
                        // Eski yardımcılar 'HH.MM' anahtar bekliyor.
                        const time = slot.startTime.replace(':', '.');
                        const coverage = getSlotCoverage(time);
                        const booking = coverage?.booking ?? null;
                        const isContinuation = !!coverage && !coverage.isStart;
                        const isSub = booking?.type === 'SUB';
                        const subStyles = { bg: 'bg-blue-900/30', border: 'border-blue-500/50', text: 'text-blue-400', bar: 'bg-blue-500' };
                        const styles = booking ? (isSub ? subStyles : getStatusStyles(booking.status)) : null;

                        // Fiyat ARTIK IZGARADAN gelir (tarifenin slot fiyatı); yalnız
                        // flaş indirim varsa o ezer. Saatlik çarpım yapılmaz.
                        const standardPrice = slot.price > 0
                            ? slot.price
                            : resolveHourlyPrice(parseInt(time.split('.')[0], 10), pricingPolicy, selectedCourtId || null, selectedDateISO);
                        const deal = findFlashDealForSlot(time, selectedCourtId, flashDeals);
                        const currentPrice = deal ? deal.deal_price : standardPrice;
                        const hasFlashDeal = currentPrice != null && standardPrice != null && currentPrice < standardPrice;
                        const slotClosed = isSlotClosed(time, selectedCourtId, closedSlots, slot.minutes);
                        const nextTime = slot.endTime.replace(':', '.');
                        // Izgaradan gelen her slot zaten çalışma penceresi içindedir
                        // (pencere tarifeden türetiliyor). Yalnız "Tümünü göster"
                        // dolgu satırları pencere dışı olabilir.
                        const withinHours = slot.price > 0
                            || (!dayHours.closed && isHourWithinWorkingHours(parseInt(time.split('.')[0], 10), dayHours.open, dayHours.close));
                        // YÜKSEKLİK SÜREYLE ORANTILI: 60dk = 64px, 90dk = 96px, 120dk = 128px.
                        const rowHeight = Math.round((slot.minutes / 60) * 64);

                        return (
                            <div key={`${slot.startTime}-${slot.minutes}`} data-hour={time} className="flex gap-4 group scroll-mt-40">
                                <div className="w-20 pt-4 flex flex-col items-center">
                                    <span className={`text-[11px] font-mono font-black tracking-tighter ${booking || slotClosed ? 'text-white' : withinHours ? 'text-gray-600' : 'text-gray-700'}`}>
                                        {slot.startTime} - {slot.endTime}
                                    </span>
                                    {slot.minutes !== 60 && (
                                        <span className="text-[9px] font-black text-[#39FF14]/70 mt-0.5">{slot.minutes} dk</span>
                                    )}
                                </div>

                            <div className="flex-1">
                                {slotClosed && !booking ? (
                                    <div style={{ height: rowHeight }} className="rounded-xl border border-red-500/30 bg-red-950/30 flex items-center justify-center gap-2 text-red-400">
                                        <Lock size={16} />
                                        <span className="text-xs font-black uppercase tracking-wider">Kapalı</span>
                                    </div>
                                ) : !withinHours && !booking ? (
                                    <div style={{ height: rowHeight }} className="rounded-xl border border-white/5 bg-white/[0.015] flex items-center justify-center gap-2 text-gray-600">
                                        <Clock size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Çalışma saati dışı</span>
                                    </div>
                                ) : booking ? (
                                    isContinuation ? (
                                    <button
                                        onClick={() => setSelectedBooking(booking)}
                                        style={{ height: rowHeight }} className={`w-full rounded-xl border ${styles?.border} ${styles?.bg} flex items-center gap-3 px-4 text-left opacity-75 active:scale-[0.98]`}
                                        title="Çok saatlik rezervasyonun devamı"
                                    >
                                        <div className={`w-1.5 h-8 rounded ${styles?.bar}`}></div>
                                        <span className="text-[11px] font-bold text-gray-300 truncate">{booking.user} · devam ({booking.duration} saat)</span>
                                    </button>
                                    ) : (
                                    <button
                                        onClick={() => setSelectedBooking(booking)}
                                        className={`w-full relative overflow-hidden rounded-xl border ${styles?.bg} ${styles?.border} transition-all active:scale-[0.98] text-left`}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${styles?.bar}`}></div>
                                        <div className="p-3 pl-5 flex justify-between items-center">
                                            <div>
                                                <p className="text-sm font-bold text-white leading-tight">{booking.user}</p>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${styles?.text} bg-black/20`}>
                                                        {booking.status === 'PAID' ? 'ÖDENDİ' : 'BEKLEYEN'}
                                                    </span>
                                                    {booking.type === 'APP' && (
                                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded text-indigo-400 bg-indigo-500/20 border border-indigo-500/30 flex items-center gap-1 shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                                                            <Shield size={10} /> OYNA HAKEMİ ATANDI
                                                        </span>
                                                    )}
                                                    {booking.note && <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{booking.note}</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-white font-mono">{booking.price}₺</p>
                                                {booking.duration > 1 && (
                                                    <p className="text-[9px] font-bold text-gray-400 mt-0.5">{booking.duration} saat</p>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                    )
                                ) : (
                                    <div style={{ height: rowHeight }} className="flex gap-2 w-full">
                                        <button 
                                            onClick={() => {
                                              if (readOnly) {
                                                notify('Hesabınız salt okunur modda. Yeni rezervasyon oluşturulamaz.', 'warning');
                                                return;
                                              }
                                              handleQuickCreate(time);
                                            }}
                                            disabled={isAddingSlot || !selectedCourtId || isLoadingBookings || readOnly}
                                            className="flex-1 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 relative overflow-hidden border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 text-gray-600 hover:text-emerald-400 group/add"
                                        >
                                            <div className="relative z-10 flex flex-col items-center">
                                                <div className="flex items-center gap-1">
                                                    <Plus size={16} className="group-hover/add:scale-110 transition-transform" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">BOŞ</span>
                                                </div>
                                                {currentPrice != null ? (
                                                    <span className="text-[10px] text-gray-500 font-mono mt-0.5">{currentPrice}₺</span>
                                                ) : (
                                                    <span className="text-[9px] text-amber-500/90 font-bold mt-0.5 uppercase tracking-wide">Tarife yok</span>
                                                )}
                                            </div>
                                        </button>

                                        <button 
                                            onClick={() => {
                                              if (!canFlashDeals) {
                                                notify('Flash deal mevcut planınızda aktif değil.', 'warning');
                                                return;
                                              }
                                              setFlashDealModalOpen(time);
                                            }}
                                            disabled={!selectedCourtId || readOnly}
                                            className={`w-16 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 transition-all ${
                                                hasFlashDeal
                                                ? 'bg-green-900/20 text-green-500 border-green-500/30 hover:bg-green-900/40' 
                                                : 'bg-[#161B22] text-gray-500 hover:text-white'
                                            }`}
                                            title="Flash deal"
                                        >
                                            {hasFlashDeal ? <Percent size={14} /> : <Tag size={14} />}
                                            <span className="text-[9px] font-bold">{currentPrice != null ? `${currentPrice}₺` : '—'}</span>
                                        </button>

                                        <button 
                                            onClick={() => {
                                              if (readOnly) return;
                                              setSpecialPriceModalOpen(time);
                                            }}
                                            disabled={!selectedCourtId || readOnly}
                                            className="w-14 rounded-xl border border-white/5 bg-[#161B22] text-gray-500 hover:text-amber-400 hover:border-amber-500/30 flex items-center justify-center transition-all"
                                            title="Özel fiyat (prime time)"
                                        >
                                            <TrendingUp size={14} />
                                        </button>

                                        <button 
                                            onClick={() => {
                                              if (readOnly) return;
                                              setCloseSlotModalOpen(time);
                                            }}
                                            disabled={!selectedCourtId || readOnly}
                                            className="w-14 rounded-xl border border-white/5 bg-[#161B22] text-gray-500 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center transition-all"
                                            title="Slotu kapat"
                                        >
                                            <Lock size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                    </>
            )}
        </div>

            {/* FAZ2: klavye-farkında bottom-sheet — müşteri adı inputu klavye açınca
                KAYDET butonu (footer) klavye üstünde kalır; eskiden altında kayboluyordu. */}
            <OwnerBottomSheet
                open={!!isQuickCreateOpen}
                onClose={() => setIsQuickCreateOpen(null)}
                title="Yeni Rezervasyon"
                footer={
                    <button
                        onClick={async () => {
                            if (!isQuickCreateOpen || !selectedCourtId) return;
                            if (!isRealPitch) {
                                notify('Rezervasyon kaydı için önce tesisinizin onaylanması gerekir.', 'warning');
                                return;
                            }
                            setIsAddingSlot(true);
                            try {
                                const startTime = isQuickCreateOpen.replace('.', ':');
                                const hour = parseInt(startTime.split(':')[0], 10);
                                const endTime = `${((hour + 1) % 24).toString().padStart(2, '0')}:00`;
                                // Fiyat GERÇEK tarifeden; tarife yoksa kayıt engellenir (uydurma tutar yazılmaz).
                                const rateVal = isQuickCreateOpen ? getSlotPrice(isQuickCreateOpen) : null;
                                if (rateVal == null) {
                                    notify('Bu saat için tarife tanımlı değil. Menü → Aktif Saatler ve Ücretler\'den tarife ekleyin.', 'warning');
                                    setIsAddingSlot(false);
                                    return;
                                }
                                // BULGU-123: kapora sahibin ELDEN aldığı tutardır; oranla
                                // uydurulmaz. Saat ücretini aşan tutar deftere yazılamaz.
                                const depositVal = quickDepositVal;
                                if (paymentStatus === 'PARTIAL' && (!Number.isFinite(depositVal) || depositVal <= 0 || depositVal > rateVal)) {
                                    notify('Alınan kapora tutarını gir (0 ile saat ücreti arasında).', 'warning');
                                    setIsAddingSlot(false);
                                    return;
                                }
                                const paidAmount =
                                    paymentStatus === 'PAID' ? rateVal
                                    : paymentStatus === 'PARTIAL' ? depositVal
                                    : 0;
                                // OP-P0-1: rezervasyon + nakit ödeme TEK atomik/idempotent RPC —
                                // "rezervasyon var ama tahsilat yok" tutarsızlığı biter. Telefon
                                // yalnız customer_phone'a yazılır (OP-P2-21; note tekrarı yok).
                                await ownerCreateManualBooking({
                                    pitchId,
                                    courtId: selectedCourtId,
                                    bookingDate: selectedDateISO,
                                    startTime,
                                    endTime,
                                    customerName: customerName.trim() || undefined,
                                    customerPhone: customerPhone.trim() || undefined,
                                    paymentStatus,
                                    paidAmount,
                                    paymentMethod: 'CASH',
                                });
                                await loadBookings();
                                setIsQuickCreateOpen(null);
                                setCustomerName('');
                                setCustomerPhone('');
                                setPaymentStatus('PENDING');
                                setDepositStr('');
                            } catch (err) {
                                notify(toTurkishError(err), 'error');
                            } finally {
                                setIsAddingSlot(false);
                            }
                        }}
                        disabled={isAddingSlot || (paymentStatus === 'PARTIAL' && !isDepositValid)}
                        className="w-full py-4 min-h-[52px] bg-[#FACC15] text-black font-black text-lg rounded-2xl hover:bg-yellow-300 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {isAddingSlot ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                    </button>
                }
            >
                <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 mb-6 text-center">
                    <p className="text-xs text-gray-500 uppercase font-bold">Seçilen Saat</p>
                    <p className="text-3xl font-black text-white mt-1 font-mono tabular-nums">{isQuickCreateOpen}</p>
                    {(() => {
                        const rate = isQuickCreateOpen ? getSlotPrice(isQuickCreateOpen) : null;
                        return rate != null ? (
                            <p className="text-sm font-bold text-gray-400 mt-2">Tutar: {rate}₺</p>
                        ) : (
                            <p className="text-xs font-bold text-amber-400 mt-2">Bu saat için tarife tanımlı değil — Menü → Aktif Saatler ve Ücretler'den ekleyin.</p>
                        );
                    })()}
                </div>

                <div className="space-y-4">
                    <div className="bg-[#0A0E14] flex flex-col px-4 py-3 rounded-xl border border-white/10 focus-within:border-[#FACC15] transition-colors gap-3">
                        <div className="flex items-center w-full">
                          <User size={18} className="text-gray-500 mr-3" />
                          <input
                              type="text"
                              placeholder="Müşteri Adı / Takım Adı"
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              className="bg-transparent text-white font-bold w-full outline-none"
                              autoFocus
                          />
                        </div>
                        <div className="h-px w-full bg-white/5" />
                        <div className="flex items-center w-full">
                          <Phone size={18} className="text-gray-500 mr-3" />
                          <input
                              type="tel"
                              placeholder="Telefon Numarası (Opsiyonel)"
                              value={customerPhone}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              className="bg-transparent text-gray-300 font-mono text-sm w-full outline-none"
                          />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPaymentStatus('PAID')}
                            className={`flex-1 min-h-[44px] py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PAID' ? 'bg-emerald-500 text-black border-emerald-500 font-black' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                        >
                            Tam Ödendi
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentStatus('PARTIAL')}
                            className={`flex-1 min-h-[44px] py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PARTIAL' ? 'bg-yellow-500 text-black border-yellow-500 font-black' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20'}`}
                        >
                            Kapora
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentStatus('PENDING')}
                            className={`flex-1 min-h-[44px] py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PENDING' ? 'bg-red-500 text-white border-red-500 font-black' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
                        >
                            Ödeme Bekliyor
                        </button>
                    </div>
                    {/* BULGU-123: kapora = elden alınan GERÇEK tutar. Tarifedeki değer
                        varsayılan gelir, sahibi değiştirebilir; ücreti aşarsa KAYDET kilitli. */}
                    {paymentStatus === 'PARTIAL' && (
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                                Elden alınan kapora
                            </label>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl px-4 flex items-center focus-within:border-[#FACC15]">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={depositStr}
                                        onChange={(e) => setDepositStr(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-transparent text-white font-black text-xl py-3 outline-none tabular-nums"
                                    />
                                    <span className="text-[#9CA3AF] font-bold">₺</span>
                                </div>
                                {quickTariffDeposit != null && (
                                    <button
                                        type="button"
                                        onClick={() => setDepositStr(String(quickTariffDeposit))}
                                        className="px-4 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase active:scale-95"
                                    >
                                        Tarife: {quickTariffDeposit}₺
                                    </button>
                                )}
                            </div>
                            {isDepositTooBig ? (
                                <p className="text-[11px] font-bold text-[#F87171]">Kapora, saat ücretinden ({quickSlotRate}₺) fazla olamaz.</p>
                            ) : (
                                <p className="text-[11px] text-[#9CA3AF]">Deftere bu tutar yazılır. Kalanı sonra &quot;Tahsilat Al&quot; ile alırsın.</p>
                            )}
                        </div>
                    )}
                </div>
            </OwnerBottomSheet>

            {flashDealModalOpen && selectedCourtId && isRealPitch && (
                <OwnerFlashDealModal
                    pitchId={pitchId}
                    courtId={selectedCourtId}
                    bookingDate={selectedDateISO}
                    timeKey={flashDealModalOpen}
                    pricingPolicy={pricingPolicy}
                    existingDeal={findFlashDealForSlot(flashDealModalOpen, selectedCourtId, flashDeals)}
                    onClose={() => setFlashDealModalOpen(null)}
                    onSaved={loadSlotMeta}
                />
            )}

            {closeSlotModalOpen && selectedCourtId && isRealPitch && (
                <OwnerCloseSlotModal
                    pitchId={pitchId}
                    courtId={selectedCourtId}
                    bookingDate={selectedDateISO}
                    timeKey={closeSlotModalOpen}
                    courtName={activeCourts.find(c => c.id === selectedCourtId)?.name}
                    onClose={() => setCloseSlotModalOpen(null)}
                    onClosed={() => { loadSlotMeta(); loadBookings(); }}
                />
            )}

            {isSubscriptionModalOpen && isRealPitch && (
                <OwnerSubscriptionModal
                    pitchId={pitchId}
                    courts={activeCourts}
                    defaultCourtId={selectedCourtId}
                    timeSlots={allTimeSlots}
                    pricingPolicy={pricingPolicy}
                    onClose={() => setIsSubscriptionModalOpen(false)}
                    onCreated={() => getSubscriptions(pitchId).then(setSubscriptions).catch(() => setSubscriptions([]))}
                />
            )}

            {specialPriceModalOpen && selectedCourtId && isRealPitch && (
                <OwnerSpecialPriceModal
                    pitchId={pitchId}
                    courtId={selectedCourtId}
                    bookingDate={selectedDateISO}
                    timeKey={specialPriceModalOpen}
                    pricingPolicy={pricingPolicy}
                    onClose={() => setSpecialPriceModalOpen(null)}
                    onSaved={() => {
                      onPricingUpdated?.();
                      loadSlotMeta();
                    }}
                />
            )}

            {selectedBooking && (
                <OwnerBookingDetailModal
                    booking={selectedBooking}
                    readOnly={readOnly}
                    onClose={() => setSelectedBooking(null)}
                    onChanged={loadBookings}
                    onNavigateQr={() => onNavigate?.('QR_SCANNER')}
                />
            )}
            {confirmElement}
        </div>
    );
};

