
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { 
  ArrowLeft, Wallet, TrendingUp, Calendar, AlertCircle, Settings, 
  MessageSquare, Clock, XCircle, Home, Users, CheckCircle2, ChevronRight, Bell, 
  MoreHorizontal, Shield, Hand, DollarSign, Filter, RefreshCw, X, Search, Pause, Play, ChevronDown, BarChart as BarChartIcon, ArrowUpRight, Zap, Phone, Plus, User, Lock, CreditCard, Banknote, Trash2, Edit3, Tag, Percent, CalendarDays, TrendingDown, Send, Receipt, ClipboardList, Briefcase, UserCheck, Flame, Building2, Image as ImageIcon, MapPin, Globe, HelpCircle, LogOut, FileText, Camera, Save, Type, List, Check, QrCode, PieChart as PieChartIcon, Activity, ZapOff, CreditCard as CardIcon, Coins, Trophy, Star, Target, ChevronLeft, ImagePlus, GripVertical, LayoutDashboard, Palette, CalendarRange
} from 'lucide-react';

import { useAppStore } from '../store';
import { hasMultipleSwitchableRoles } from '../shared/roles';
import { resolveWorkingHoursForDate, isHourWithinWorkingHours, openHourCount } from '../shared/workingHours';
import { PitchManager } from '../admin-panel/views/PitchManager';
import { OwnerFinanceView } from './owner/OwnerFinanceView';
import { LoadingState, EmptyState } from '../components/common/StatusState';
import { OwnerTeamView } from './owner/OwnerTeamView';
import { OwnerBankAccountsModal } from './owner/OwnerBankAccountsModal';
import { OwnerSubscriptionModal } from './owner/OwnerSubscriptionModal';
import { OwnerFlashDealModal } from './owner/OwnerFlashDealModal';
import { OwnerCloseSlotModal } from './owner/OwnerCloseSlotModal';
import { OwnerBookingDetailModal } from './owner/OwnerBookingDetailModal';
import { OwnerFacilityScheduleView } from './owner/OwnerFacilityScheduleView';
import { OwnerFacilityWeekView } from './owner/OwnerFacilityWeekView';
import { OwnerSpecialPriceModal } from './owner/OwnerSpecialPriceModal';
import { useOwnerEntitlements } from '../hooks/useOwnerEntitlements';
import { OwnerToastProvider, useOwnerToast } from './owner/components/useOwnerToast';
import { OwnerKpiGrid, OwnerCommandStrip, kpiIcons, type OwnerKpiItem } from './owner/components/OwnerKpiGrid';
import { OwnerStatusBar, type OwnerStatusBanner } from './owner/components/OwnerStatusBar';
import { OwnerBottomNav } from './owner/components/OwnerBottomNav';
import { OwnerHomeSkeleton } from './owner/components/OwnerHomeSkeleton';
import {
  OwnerMenuView,
  OwnerFacilitySettingsModal,
  OwnerWorkingHoursModal,
  OwnerPricingPolicyModal,
  OwnerPaymentSettingsModal,
  OwnerWithdrawalsModal,
  OwnerWidgetSettingsModal,
  OwnerOperationsSettingsModal,
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
  resolveHourlyPrice,
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
  getPendingBookings,
  approveBooking,
  rejectBooking,
  ownerCreateManualBooking,
  getSubscriptions,
  updateSubscriptionStatus,
  setSubscriptionAutoRenew,
  subscribeToOwnerBookings,
  buildHourlyOccupancyGrid,
  buildEmptyHourlyGrid,
  computeCourtDailyStats,
  computeOverallOccupancy,
  getPaymentSettings,
  getBankAccounts,
  getActiveFlashDeals,
  getAvailabilityExceptions,
  getPitchAppMatches,
  updatePitchOperationsSettings,
  toTurkishError,
  type CourtDailyStats,
  type HourlyOccupancyCell,
} from '../services/pitchOwnerService';
import { getOwnerDemoPitchId, seedOwnerDemo } from '../services/ownerDemoService';
import type { PitchCourt, PitchBookingFull, OwnerDailySummary, OwnerPitch, FlashDeal, PitchAvailabilityException, PitchTariff } from '../types';

interface OwnerPanelProps {
  onBack: () => void;
  onNavigate: (view: any) => void;
  onNeedOnboarding?: () => void;
  /** Gerçek oturum kapatma (App merkezî handleLogout) → giriş ekranına düşer. */
  onLogout?: () => void;
}

// --- HELPERS ---

function todayISO(): string {
  return localDateISO();
}

function getWeekDates(base = new Date()): Date[] {
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(base.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDateISO(d: Date): string {
  return localDateISO(d);
}

function bookingToPendingRequest(b: PitchBookingFull, autoApproveMinutes: number) {
  const created = b.created_at ? new Date(b.created_at).getTime() : Date.now();
  const deadline = created + autoApproveMinutes * 60 * 1000;
  const timerSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  const courtName = b.courts?.name ?? 'Saha';
  const start = (b.start_time ?? '').slice(0, 5);
  const end = (b.end_time ?? '').slice(0, 5);
  return {
    id: b.id,
    bookingId: b.id,
    title: b.customer_name || b.title || 'Rezervasyon Talebi',
    subtitle: `${courtName} (${start} - ${end})`,
    timerSeconds,
    status: 'PENDING' as const,
    source: b.source,
  };
}

const INITIAL_PENDING_REQUESTS: ReturnType<typeof bookingToPendingRequest>[] = [];

const MatchCountdownItem: React.FC<{
    request: any;
    onApprove: () => void;
    onReject: () => void;
}> = ({ request, onApprove, onReject }) => {
    const [timeLeft, setTimeLeft] = useState(request.timerSeconds || (request.timerMinutes ? request.timerMinutes * 60 : 0));

    // OP-P1-9: istemci sayacı SADECE GÖRSEL geri sayımdır — sıfıra inince
    // otomatik onaylamaz. Otomatik onay kararı sunucu cron'una aittir
    // (auto_approve_pending_bookings), ki o auto_approve_enabled toggle'ına ve
    // dakikaya saygılıdır. Eski istemci-onayı toggle'ı yok sayıyor ve yalnız
    // ekran açıkken çalışıyordu (çelişkili/eksik onay). Erken onay hâlâ elle.
    useEffect(() => {
        if (request.status !== 'PENDING') return;
        const timerId = setInterval(() => {
            setTimeLeft((prev: number) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timerId);
    }, [request.id, request.status]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    const isApproved = request.status === 'APPROVED';

    return (
        <div className={`border p-4 rounded-xl flex flex-col gap-3 transition-colors ${isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-[#0A0E14] border-white/5'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className={`text-sm font-bold ${isApproved ? 'text-emerald-400' : 'text-white'}`}>{request.title}</p>
                    <p className="text-xs text-gray-400">{request.subtitle}</p>
                </div>
                {request.status === 'PENDING' && timeLeft > 0 && (
                    <div className="flex gap-2">
                        <button onClick={onApprove} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg hover:bg-emerald-500/30">Erken Onayla</button>
                        <button onClick={onReject} className="px-3 py-1.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg hover:bg-red-500/30">Reddet</button>
                    </div>
                )}
            </div>
            
            <div className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${request.status === 'PENDING' && timeLeft > 0 ? 'bg-orange-500/10 border-orange-500/20' : isApproved ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-red-500/10 border-red-500/20'}`}>
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        {request.status === 'PENDING' ? 'Maçın onaylanması için kalan süre' : 'Talep Durumu'}
                    </span>
                    {request.status === 'PENDING' && timeLeft > 0 ? (
                        <span className="text-sm font-black text-orange-400 flex items-center gap-1">
                            <Clock size={14} className="animate-pulse" /> 
                            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </span>
                    ) : isApproved ? (
                        <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                            <Check size={14} /> {timeLeft === 0 ? 'Otomatik Onaylandı' : 'Onaylandı'}
                        </span>
                    ) : (
                        <span className="text-sm font-black text-red-400 flex items-center gap-1">
                            <X size={14} /> Reddedildi
                        </span>
                    )}
                </div>
                {request.status === 'PENDING' && timeLeft > 0 && (
                    <span className="text-[9px] font-medium text-gray-500 max-w-[120px] text-right">
                        Süre bitince otomatik onaylanacaktır.
                    </span>
                )}
            </div>
        </div>
    );
};

// Enhanced Calendar Data Structure
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

const AnimatedBarChart: React.FC<{ data: HourlyOccupancyCell[]; dataKey: 'revenue' | 'occupancy'; color: string; height?: number; maxValue?: number; onBarClick?: (data: any) => void; showGrid?: boolean }> = ({ data, dataKey, color, height = 160, maxValue, onBarClick, showGrid = true }) => {
    const max = maxValue || Math.max(...data.map(d => d[dataKey])) || 1;
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    return (
        <div className="w-full relative select-none" style={{ height: `${height}px` }}>
            {showGrid && (
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                    <div className="w-full h-px bg-gray-500/50 border-t border-dashed border-gray-500"></div>
                    <div className="w-full h-px bg-gray-500/50 border-t border-dashed border-gray-500"></div>
                    <div className="w-full h-px bg-gray-500/50 border-t border-dashed border-gray-500"></div>
                    <div className="w-full h-px bg-gray-500/50 border-t border-dashed border-gray-500"></div>
                </div>
            )}

            <div className="flex items-end justify-between h-full pt-4 pb-6 gap-1.5">
                {data.map((item, index) => {
                    const value = item[dataKey];
                    const percentage = (value / max) * 100;
                    const isActive = activeIndex === index;
                    const isZero = value === 0;

                    return (
                        <div 
                            key={index} 
                            className="flex-1 h-full flex flex-col justify-end group relative cursor-pointer"
                            onClick={() => {
                                setActiveIndex(index);
                                onBarClick && onBarClick(item);
                            }}
                        >
                            <div 
                                className={`w-full rounded-t-sm relative transition-all duration-300 ease-out origin-bottom ${isZero ? 'bg-white/5 h-1' : ''}`}
                                style={{ 
                                    height: isZero ? '4px' : `${percentage}%`,
                                    backgroundColor: isActive ? '#FACC15' : color, 
                                    opacity: isActive ? 1 : 0.8,
                                    transform: 'scaleY(1)', 
                                    animation: `growUp 0.6s ease-out ${index * 0.05}s backwards`
                                }}
                            >
                                {dataKey === 'occupancy' && !isZero && (
                                    <div className="absolute inset-0 flex flex-col justify-evenly opacity-30">
                                        <div className="h-px w-full bg-black/50"></div>
                                        <div className="h-px w-full bg-black/50"></div>
                                    </div>
                                )}
                            </div>
                            {index % 2 === 0 && (
                                <span className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-medium ${isActive ? 'text-white font-bold' : 'text-gray-500'}`}>
                                    {item.time.split(':')[0]}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <style>{`@keyframes growUp { from { transform: scaleY(0); } to { transform: scaleY(1); } }`}</style>
        </div>
    );
};

const FinancialCalendarView: React.FC<{
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
    const weekDates = useMemo(() => getWeekDates(), []);
    const todayIndex = useMemo(() => {
        const today = todayISO();
        const idx = weekDates.findIndex((d) => formatDateISO(d) === today);
        return idx >= 0 ? idx : 0;
    }, [weekDates]);

    const [selectedDate, setSelectedDate] = useState(todayIndex);
    const [selectedMonthlyDay, setSelectedMonthlyDay] = useState(new Date().getDate());
    const [selectedCourtId, setSelectedCourtId] = useState(courts[0]?.id ?? '');
    const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
    const [isQuickCreateOpen, setIsQuickCreateOpen] = useState<string | null>(null);
    const [flashDealModalOpen, setFlashDealModalOpen] = useState<string | null>(null);
    const [closeSlotModalOpen, setCloseSlotModalOpen] = useState<string | null>(null);
    const [specialPriceModalOpen, setSpecialPriceModalOpen] = useState<string | null>(null);
    const [isMonthlyView, setIsMonthlyView] = useState(false);
    // OW-E (P4): TESİS (satır=saat, sütun=kort) ve HAFTA (satır=kort, sütun=7 gün)
    // görünümleri — GÜN'e paralel modlar. Aynı anda yalnız biri açık.
    const [facilityView, setFacilityView] = useState(false);
    const [weekView, setWeekView] = useState(false);
    const [facilityRefreshKey, setFacilityRefreshKey] = useState(0);
    const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
    const [isAddingSlot, setIsAddingSlot] = useState(false);
    const [isLoadingBookings, setIsLoadingBookings] = useState(false);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subMenuId, setSubMenuId] = useState<string | null>(null);
    const [subActionBusy, setSubActionBusy] = useState(false);
    const [flashDeals, setFlashDeals] = useState<FlashDeal[]>([]);
    const [closedSlots, setClosedSlots] = useState<PitchAvailabilityException[]>([]);

    const [bookings, setBookings] = useState<CalendarBooking[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PARTIAL' | 'PENDING'>('PENDING');

    const isRealPitch = !!pitchId && !pitchId.startsWith('mock-');
    const selectedDateISO = formatDateISO(weekDates[selectedDate] ?? new Date());
    // WP6: seçili günün çalışma penceresi (owner ayarı = takvim penceresi = tüketici).
    const dayHours = useMemo(
        () => resolveWorkingHoursForDate(workingHours as any, selectedDateISO),
        [workingHours, selectedDateISO],
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
        if (status === 'CANCELLED' && !window.confirm('Bu abonelik iptal edilsin mi? Bu işlem geri alınamaz.')) return;
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

    const getSlotPrice = (time: string) => {
        const hour = parseInt(time.split('.')[0], 10);
        const defaultPrice = resolveHourlyPrice(hour, pricingPolicy);
        const deal = findFlashDealForSlot(time, selectedCourtId, flashDeals);
        return deal ? deal.deal_price : defaultPrice;
    };

    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const timeSlots = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}.00`);

    const currentBookings = useMemo(() => {
        return bookings.filter((b) => b.pitchId === selectedCourtId);
    }, [bookings, selectedCourtId]);

    const displaySlots = currentBookings;

    const dailyCollected = currentBookings.reduce((acc, curr) => acc + curr.paid, 0);
    const dailyTotal = currentBookings.reduce((acc, curr) => acc + curr.price, 0);
    const dailyPending = dailyTotal - dailyCollected;
    // OP-P1-6 + WP6: rezervasyon SAYISI değil kapladığı SAAT toplamı; payda = GERÇEK
    // çalışma penceresi (owner'ın o güne ayarladığı açık saat sayısı).
    const bookedHours = currentBookings.reduce((acc, curr) => acc + (curr.duration || 1), 0);
    const openHours = dayHours.closed ? 0 : openHourCount(dayHours.open, dayHours.close);
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

    const handleQuickCreate = async (time: string) => {
        setIsQuickCreateOpen(time);
        setCustomerName('');
        setCustomerPhone('');
        setPaymentStatus('PENDING');
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
                    <div className="flex justify-between gap-1">
                        {days.map((d, i) => (
                            <button 
                                key={i}
                                onClick={() => setSelectedDate(i)}
                                className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-0.5 transition-all border ${selectedDate === i ? 'bg-white/10 text-white border-white/20 shadow-lg scale-105' : 'bg-[#161B22] border-transparent text-gray-500 hover:bg-white/5'}`}
                            >
                                <span className="text-[9px] font-black uppercase">{d}</span>
                                <span className="text-sm font-bold">{weekDates[i]?.getDate() ?? i + 1}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex bg-[#161B22] p-1 rounded-xl overflow-x-auto">
                            {activeCourts.length === 0 ? (
                                <span className="text-xs text-gray-500 px-3 py-2">Saha ekleyin (Menü → Sahalarım)</span>
                            ) : activeCourts.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedCourtId(p.id)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap px-2 ${selectedCourtId === p.id ? 'bg-[#2D3748] text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                        {/* OW-E (P4): TESİS görünümü — çok kortlu tesiste tek bakışta. */}
                        {activeCourts.length > 1 && (
                            <button
                                onClick={() => { setFacilityView((v) => !v); setWeekView(false); setIsMonthlyView(false); }}
                                className={`h-full px-3 border rounded-xl transition-colors flex items-center justify-center gap-2 ${facilityView ? 'bg-blue-500 text-white border-blue-500' : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                                title="Tesis görünümü (tüm kortlar)"
                            >
                                <List size={20} />
                                {facilityView && <span className="text-[10px] font-black uppercase">Tesis</span>}
                            </button>
                        )}
                        {/* OW-E (P4): HAFTA görünümü — kort×7 gün doluluk ısı-haritası. */}
                        {activeCourts.length > 0 && (
                            <button
                                onClick={() => { setWeekView((v) => !v); setFacilityView(false); setIsMonthlyView(false); }}
                                className={`h-full px-3 border rounded-xl transition-colors flex items-center justify-center gap-2 ${weekView ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                                title="Hafta görünümü (doluluk ısı-haritası)"
                            >
                                <CalendarRange size={20} />
                                {weekView && <span className="text-[10px] font-black uppercase">Hafta</span>}
                            </button>
                        )}
                        <button
                            onClick={() => { setIsMonthlyView(!isMonthlyView); setFacilityView(false); setWeekView(false); }}
                            className={`h-full px-3 border rounded-xl transition-colors flex items-center justify-center gap-2 ${isMonthlyView ? 'bg-[#FACC15] text-black border-[#FACC15]' : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <CalendarDays size={20} />
                            {isMonthlyView && <span className="text-[10px] font-black uppercase">Aylık</span>}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-2 pb-32">
                {facilityView ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <OwnerFacilityScheduleView
                            pitchId={pitchId}
                            isRealPitch={isRealPitch}
                            selectedDateISO={selectedDateISO}
                            refreshKey={facilityRefreshKey}
                            onQuickBook={(courtId, time) => {
                                if (readOnly) { notify('Hesabınız salt okunur modda.', 'warning'); return; }
                                setSelectedCourtId(courtId);
                                setIsQuickCreateOpen(time);
                            }}
                            onBookingTap={(bookingId) => {
                                const b = bookings.find((x) => x.id === bookingId);
                                if (b) setSelectedBooking(b);
                            }}
                        />
                    </div>
                ) : weekView ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <OwnerFacilityWeekView
                            pitchId={pitchId}
                            isRealPitch={isRealPitch}
                            selectedDateISO={selectedDateISO}
                            refreshKey={facilityRefreshKey}
                            onSelectDay={(dateISO) => {
                                const idx = weekDates.findIndex((d) => formatDateISO(d) === dateISO);
                                if (idx >= 0) setSelectedDate(idx);
                                setWeekView(false);
                            }}
                        />
                    </div>
                ) : isMonthlyView ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-[#161B22] rounded-3xl border border-white/10 p-6 mb-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white italic">
                                    {new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()}
                                </h3>
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
                            <div className="grid grid-cols-7 gap-2">
                                {Array.from({ length: 31 }, (_, i) => {
                                    const day = i + 1;
                                    const isToday = day === new Date().getDate();
                                    const isSelected = selectedMonthlyDay === day;
                                    
                                    return (
                                        <button 
                                            key={i}
                                            onClick={() => setSelectedMonthlyDay(day)}
                                            className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all border ${
                                                isSelected ? 'bg-white/10 text-white border-white/30 shadow-lg scale-110 z-10' : 
                                                'text-gray-500 border-transparent hover:bg-white/5'
                                            }`}
                                        >
                                            <span className={`text-xs font-bold ${isToday ? 'text-white' : ''}`}>{day}</span>
                                        </button>
                                    );
                                })}
                            </div>
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
                    timeSlots.map((time) => {
                        const coverage = getSlotCoverage(time);
                        const booking = coverage?.booking ?? null;
                        const isContinuation = !!coverage && !coverage.isStart;
                        const isSub = booking?.type === 'SUB';
                        const subStyles = { bg: 'bg-blue-900/30', border: 'border-blue-500/50', text: 'text-blue-400', bar: 'bg-blue-500' };
                        const styles = booking ? (isSub ? subStyles : getStatusStyles(booking.status)) : null;
                        
                        const currentPrice = getSlotPrice(time);
                        const standardPrice = resolveHourlyPrice(parseInt(time.split('.')[0], 10), pricingPolicy);
                        const hasFlashDeal = currentPrice < standardPrice;
                        const slotClosed = isSlotClosed(time, selectedCourtId, closedSlots);
                        const nextTime = `${(parseInt(time.split('.')[0]) + 1).toString().padStart(2, '0')}.00`;
                        // WP6: bu saat çalışma penceresi içinde mi (owner ayarı).
                        const withinHours = !dayHours.closed && isHourWithinWorkingHours(parseInt(time.split('.')[0], 10), dayHours.open, dayHours.close);

                        return (
                            <div key={time} className="flex gap-4 group">
                                <div className="w-20 pt-4 flex flex-col items-center">
                                    <span className={`text-[11px] font-mono font-black tracking-tighter ${booking || slotClosed ? 'text-white' : withinHours ? 'text-gray-600' : 'text-gray-700'}`}>
                                        {time} - {nextTime}
                                    </span>
                                </div>

                            <div className="flex-1">
                                {slotClosed && !booking ? (
                                    <div className="h-16 rounded-xl border border-red-500/30 bg-red-950/30 flex items-center justify-center gap-2 text-red-400">
                                        <Lock size={16} />
                                        <span className="text-xs font-black uppercase tracking-wider">Kapalı</span>
                                    </div>
                                ) : !withinHours && !booking ? (
                                    <div className="h-16 rounded-xl border border-white/5 bg-white/[0.015] flex items-center justify-center gap-2 text-gray-600">
                                        <Clock size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Çalışma saati dışı</span>
                                    </div>
                                ) : booking ? (
                                    isContinuation ? (
                                    <button
                                        onClick={() => setSelectedBooking(booking)}
                                        className={`w-full h-16 rounded-xl border ${styles?.border} ${styles?.bg} flex items-center gap-3 px-4 text-left opacity-75 active:scale-[0.98]`}
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
                                    <div className="flex gap-2 h-16 w-full">
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
                                                <span className="text-[10px] text-gray-500 font-mono mt-0.5">{currentPrice}₺</span>
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
                                            <span className="text-[9px] font-bold">{currentPrice}₺</span>
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
                })
            )}
        </div>

            {/* Quick Create Modal Code (Same as before) */}
            {isQuickCreateOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] border-t border-white/10 p-6 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-white">Yeni Rezervasyon</h3>
                            <button onClick={() => setIsQuickCreateOpen(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        
                        <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 mb-6 text-center">
                            <p className="text-xs text-gray-500 uppercase font-bold">Seçilen Saat</p>
                            <p className="text-3xl font-black text-white mt-1 font-mono">{isQuickCreateOpen}</p>
                            <p className="text-sm font-bold text-gray-400 mt-2">Tutar: {isQuickCreateOpen ? getSlotPrice(isQuickCreateOpen) : 0}₺</p>
                        </div>

                        <div className="space-y-4 mb-6">
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
                                    className={`flex-1 py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PAID' ? 'bg-emerald-500 text-black border-emerald-500 font-black' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                                >
                                    Tam Ödendi
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setPaymentStatus('PARTIAL')}
                                    className={`flex-1 py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PARTIAL' ? 'bg-yellow-500 text-black border-yellow-500 font-black' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20'}`}
                                >
                                    Kapora
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setPaymentStatus('PENDING')}
                                    className={`flex-1 py-3 border rounded-xl text-xs font-bold transition-colors ${paymentStatus === 'PENDING' ? 'bg-red-500 text-white border-red-500 font-black' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
                                >
                                    Ödeme Bekliyor
                                </button>
                            </div>
                        </div>

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
                                    // OP-P3-25: sunucu-fiyatı getSlotPrice'tan (ölü 2000 fallback yok).
                                    const rateVal = isQuickCreateOpen ? getSlotPrice(isQuickCreateOpen) : 0;
                                    const paidAmount =
                                        paymentStatus === 'PAID' ? rateVal
                                        : paymentStatus === 'PARTIAL' ? Math.floor(rateVal * 0.25)
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
                                    setFacilityRefreshKey((k) => k + 1); // TESİS görünümünü tazele
                                    setIsQuickCreateOpen(null);
                                    setCustomerName('');
                                    setCustomerPhone('');
                                    setPaymentStatus('PENDING');
                                } catch (err) {
                                    notify(toTurkishError(err), 'error');
                                } finally {
                                    setIsAddingSlot(false);
                                }
                            }}
                            disabled={isAddingSlot}
                            className="w-full py-4 bg-[#FACC15] text-black font-black text-lg rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isAddingSlot ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                        </button>
                    </div>
                </div>
            )}

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
                    timeSlots={timeSlots}
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
                    onCancelled={loadBookings}
                    onNavigateQr={() => onNavigate?.('QR_SCANNER')}
                />
            )}
        </div>
    );
};


const PitchOccupancyGrid: React.FC<{ data: HourlyOccupancyCell[]; courtNames: string[] }> = ({ data, courtNames }) => {
    const pitches = courtNames.length > 0 ? courtNames : ['Henüz saha yok'];
    // Başlık ve hücreler AYNI grid şablonunu paylaşır → saat etiketleri her dikdörtgenin
    // sol köşesine tam oturur, kayma olmaz. İlk sütun saha adı, kalan sütunlar saatler.
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `5rem repeat(${data.length}, minmax(0, 1fr))`,
        columnGap: '2px',
    };

    return (
        <div className="w-full overflow-x-auto custom-scrollbar pb-2">
            <div className="min-w-[820px]">
                {/* Başlık: saatler — her etiket kendi sütununun SOL kenarında (dikdörtgenin başlangıç köşesi). */}
                <div style={gridStyle} className="mb-1.5 h-4 items-end">
                    <div />
                    {data.map((item, idx) => (
                        <div key={idx} className="relative h-4">
                            <span className="absolute left-0 bottom-0 -translate-x-1/2 text-[8px] font-black text-gray-500 tabular-nums leading-none">
                                {item.time.split(':')[0]}
                            </span>
                        </div>
                    ))}
                    {/* Son köşe: kapanış saati (ör. 24) — son dikdörtgenin sağ köşesi. */}
                </div>

                {/* Satırlar: sahalar */}
                <div className="space-y-2">
                    {pitches.map((pitchName, pitchIdx) => (
                        <div key={pitchIdx} style={gridStyle} className="items-center group">
                            <div className="pr-2 text-[10px] font-bold text-gray-400 truncate group-hover:text-white transition-colors">
                                {pitchName}
                            </div>
                            {data.map((item, timeIdx) => {
                                const bookingType = item.pitches[pitchIdx];
                                const isOccupied = bookingType !== null;
                                const startH = item.time.split(':')[0];
                                const endH = ((parseInt(startH, 10) + 1) % 24).toString().padStart(2, '0');

                                let bgColor = 'bg-white/5';
                                let borderColor = 'border-white/5';
                                let shadow = '';

                                if (bookingType === 'SUB') {
                                    bgColor = 'bg-blue-500/40';
                                    borderColor = 'border-blue-500/50';
                                    shadow = 'shadow-[0_0_10px_rgba(59,130,246,0.2)]';
                                } else if (bookingType === 'DAILY') {
                                    bgColor = 'bg-emerald-500/40';
                                    borderColor = 'border-emerald-500/50';
                                    shadow = 'shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                                }

                                return (
                                    <div
                                        key={timeIdx}
                                        className={`h-8 rounded-md transition-all duration-300 border ${bgColor} ${borderColor} ${shadow} ${!isOccupied ? 'hover:bg-white/10' : ''}`}
                                        title={`${pitchName} · ${startH}:00-${endH}:00 · ${bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ'}`}
                                    ></div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-6 px-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-500/50"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Abonman</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-500/50"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Günlük</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-white/5 border border-white/5"></div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Boş</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface RealPendingBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  price: number;
  deposit_amount: number;
  source: string;
  courts: { name: string } | null;
}

const RealPendingBookings: React.FC<{ pitchId: string | null }> = ({ pitchId }) => {
    const notify = useOwnerToast();
    const [rows, setRows] = useState<RealPendingBooking[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = React.useCallback(async () => {
        if (!pitchId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('pitch_bookings')
                .select('id, booking_date, start_time, end_time, customer_name, price, deposit_amount, source, courts(name)')
                .eq('pitch_id', pitchId)
                .eq('status', 'PENDING')
                .in('source', ['APP_BOOKING', 'APP_MATCH'])
                .order('booking_date', { ascending: true })
                .order('start_time', { ascending: true });
            if (error) throw error;
            setRows((data ?? []) as unknown as RealPendingBooking[]);
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setLoading(false);
        }
    }, [pitchId, notify]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!pitchId) return;
        const channel = supabase
            .channel(`owner-pending-${pitchId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pitch_bookings', filter: `pitch_id=eq.${pitchId}` }, () => load())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [pitchId, load]);

    const handle = async (id: string, action: 'APPROVE' | 'REJECT') => {
        setBusyId(id);
        try {
            if (action === 'APPROVE') {
                await approveBooking(id);
            } else {
                await rejectBooking(id, 'Tesis sahibi rezervasyonu onaylamadı.');
            }
            setRows(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            notify(toTurkishError(err), 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (!pitchId) return null;

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Clock size={16} className="text-[#FACC15]" /> Uygulama Talepleri
                    {rows.length > 0 && <span className="bg-[#FACC15] text-black text-[10px] px-2 py-0.5 rounded-full">{rows.length}</span>}
                </h3>
                <button onClick={load} className="text-gray-400 hover:text-white" title="Yenile"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
            {loading ? (
                <div className="bg-[#161B22] border border-white/5 rounded-2xl">
                    <LoadingState message="Yükleniyor..." size="sm" />
                </div>
            ) : rows.length === 0 ? (
                <div className="bg-[#161B22] border border-white/5 rounded-2xl">
                    <EmptyState title="Bekleyen Talep Yok" message="Onay bekleyen uygulama rezervasyonu bulunmuyor." />
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map(b => (
                        <div key={b.id} className="bg-[#161B22] border border-orange-500/20 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="text-sm font-black text-white">{b.courts?.name ?? 'Saha'} · {b.start_time.slice(0,5)}-{b.end_time.slice(0,5)}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{new Date(b.booking_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}{b.price > 0 ? ` · ₺${b.price}` : ''}</p>
                                </div>
                                <span className="text-[9px] font-black px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 uppercase">Bekliyor</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    disabled={busyId === b.id}
                                    onClick={() => handle(b.id, 'REJECT')}
                                    className="py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black uppercase hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                    Reddet
                                </button>
                                <button
                                    disabled={busyId === b.id}
                                    onClick={() => handle(b.id, 'APPROVE')}
                                    className="py-2.5 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-xs font-black uppercase hover:bg-[#39FF14]/20 transition-colors disabled:opacity-50"
                                >
                                    {busyId === b.id ? '...' : 'Onayla'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

interface PendingActionsViewProps {
    pendingRequests: any[];
    realPitchId?: string | null;
    autoApprove?: boolean;
    onToggleAutoApprove?: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onBack: () => void;
}

const PendingActionsView: React.FC<PendingActionsViewProps> = ({ pendingRequests, realPitchId, autoApprove, onToggleAutoApprove, onApprove, onReject, onBack }) => {
    const notify = useOwnerToast();
    const [subTab, setSubTab] = useState<'REQUESTS' | 'PUBLIC_MATCHES'>('REQUESTS');
    const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
    const [publicMatches, setPublicMatches] = useState<Array<{
        id: string;
        title: string;
        pitchName: string;
        time: string;
        price: number;
        maxPlayers: number;
        joinedPlayers: number;
        status: string;
    }>>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);

    const loadPublicMatches = React.useCallback(async () => {
        if (!realPitchId) {
            setPublicMatches([]);
            return;
        }
        setMatchesLoading(true);
        try {
            const rows = await getPitchAppMatches(realPitchId);
            setPublicMatches(rows);
        } catch (err) {
            notify(toTurkishError(err), 'error');
            setPublicMatches([]);
        } finally {
            setMatchesLoading(false);
        }
    }, [realPitchId, notify]);

    useEffect(() => {
        if (subTab === 'PUBLIC_MATCHES') loadPublicMatches();
    }, [subTab, loadPublicMatches]);

    const activeRequests = pendingRequests.filter(r => r.status === 'PENDING' && !r.source?.startsWith('APP_'));

    return (
        <div className="flex-1 bg-[#0A0E14] text-slate-200 font-sans flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-[#161B22] border-b border-white/5 flex items-center gap-3">
                <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-base font-black text-white italic uppercase tracking-tight">TALEPLER & AÇIK MAÇLAR</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Sahada oluşturulan organizasyonlar</p>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex p-1.5 bg-[#161B22] m-4 rounded-2xl border border-white/5 shadow-inner">
                <button
                    onClick={() => setSubTab('REQUESTS')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        subTab === 'REQUESTS' 
                        ? 'bg-[#FACC15] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Clock size={16} /> Talepler ({activeRequests.length})
                </button>
                <button
                    onClick={() => setSubTab('PUBLIC_MATCHES')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        subTab === 'PUBLIC_MATCHES' 
                        ? 'bg-[#FACC15] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Users size={16} /> Oyuncu Maçları ({publicMatches.length})
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24">
                {subTab === 'REQUESTS' && realPitchId && onToggleAutoApprove && (
                    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-black text-white">Otomatik Onay</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                {autoApprove
                                    ? 'Açık: talepler süre sonunda otomatik onaylanır.'
                                    : 'Kapalı: her talebi elle onaylaman gerekir.'}
                            </p>
                        </div>
                        <button
                            onClick={onToggleAutoApprove}
                            className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${autoApprove ? 'bg-[#39FF14]' : 'bg-gray-600'}`}
                            aria-label="Otomatik onay aç/kapa"
                        >
                            <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${autoApprove ? 'translate-x-6' : ''}`} />
                        </button>
                    </div>
                )}
                {subTab === 'REQUESTS' && <RealPendingBookings pitchId={realPitchId ?? null} />}
                {subTab === 'REQUESTS' ? (
                    activeRequests.length > 0 ? (
                        <div className="space-y-4">
                            {activeRequests.map((req) => (
                                <div key={req.id} className="bg-[#161B22] border border-white/5 rounded-3xl p-5 shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 bg-yellow-500 h-full"></div>
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <h4 className="text-base font-black text-white">{req.title}</h4>
                                            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">{req.subtitle}</p>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-xl text-[10px] text-yellow-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>
                                            Onay Bekliyor
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pl-2">
                                        <button
                                            onClick={() => onApprove(req.id)}
                                            className="flex-1 py-3 bg-green-500 text-black font-black text-xs rounded-xl hover:bg-green-400 active:scale-95 transition-all shadow-lg shadow-green-900/10"
                                        >
                                            REZERVE ET & ONAYLA
                                        </button>
                                        <button
                                            onClick={() => onReject(req.id)}
                                            className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-xs rounded-xl hover:bg-red-500 hover:text-white active:scale-95 transition-all"
                                        >
                                            REDDET
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Clock size={48} className="text-gray-600 mb-4" />
                            <p className="text-base font-bold text-gray-400">Bekleyen Rezervasyon Talebi Bulunmuyor</p>
                            <p className="text-xs text-gray-500 mt-1 max-w-[280px]">Oyuncular uygulamanız üzerinden yer ayırttığında burada listelenecektir.</p>
                        </div>
                    )
                ) : publicMatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Users size={48} className="text-gray-600 mb-4" />
                        <p className="text-base font-bold text-gray-400">
                            {matchesLoading ? 'Yükleniyor...' : 'Bu tesiste açık oyuncu maçı yok'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 max-w-[280px]">
                            Uygulama üzerinden bu sahaya bağlı maçlar burada listelenir.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {publicMatches.map((match) => {
                            const isFull = match.maxPlayers > 0 && match.joinedPlayers >= match.maxPlayers;
                            const percentage = match.maxPlayers > 0
                                ? Math.round((match.joinedPlayers / match.maxPlayers) * 100)
                                : 0;

                            return (
                                <div 
                                    key={match.id} 
                                    className="bg-[#161B22] border border-white/5 rounded-3xl p-5 shadow-xl relative overflow-hidden group hover:border-[#FACC15]/30 transition-all animate-in fade-in duration-300"
                                >
                                    <div className={`absolute top-0 left-0 w-1 h-full ${isFull ? 'bg-emerald-500' : 'bg-[#FACC15]'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <span className="text-[9px] font-black uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-400 tracking-widest">{match.pitchName}</span>
                                            <h4 className="text-base font-black text-white mt-2 leading-tight">{match.title}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">{match.time}</p>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                                            match.status === 'COMPLETED' || match.status === 'READY'
                                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                                            : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                                        }`}>
                                            {match.status === 'COMPLETED' ? 'TAMAMLANDI' : isFull ? 'MAÇ HAZIR' : 'KADRO KURULUYOR'}
                                        </div>
                                    </div>

                                    <div className="mb-2 pl-2 space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase">
                                            <span className="text-gray-500">Kadro Doluluk</span>
                                            <span className={isFull ? 'text-emerald-400' : 'text-white'}>{match.joinedPlayers} / {match.maxPlayers || '—'} OYUNCU</span>
                                        </div>
                                        {match.maxPlayers > 0 && (
                                            <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.3)]'}`} 
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pl-2 pt-4 border-t border-white/5">
                                        <span className="text-sm font-black text-emerald-400 font-mono">
                                            {match.price > 0 ? `₺${match.price.toLocaleString('tr-TR')}` : 'Ücretsiz'}
                                        </span>
                                        <button 
                                            onClick={() => setSelectedMatch(match)}
                                            className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider"
                                        >
                                            DETAY
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Selected Match Details Modal */}
            {selectedMatch && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-[32px] border border-white/10 p-6 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-black text-white italic uppercase tracking-tight">{selectedMatch.title}</h3>
                                <p className="text-xs text-gray-400 mt-1 uppercase font-bold">{selectedMatch.pitchName} • {selectedMatch.time}</p>
                            </div>
                            <button onClick={() => setSelectedMatch(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl mb-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Durum</span>
                                <span className="text-white font-black">{selectedMatch.status}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Oyuncu</span>
                                <span className="text-white font-black">{selectedMatch.joinedPlayers} / {selectedMatch.maxPlayers || '—'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 font-bold uppercase text-[10px]">Ücret</span>
                                <span className="text-emerald-400 font-black font-mono">₺{Number(selectedMatch.price || 0).toLocaleString('tr-TR')}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSelectedMatch(null)}
                            className="w-full py-4 bg-[#FACC15] text-black font-black text-sm rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all uppercase tracking-wider text-center"
                        >
                            KAPAT
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

 const OwnerPanelInner: React.FC<OwnerPanelProps> = ({ onBack, onNavigate, onNeedOnboarding, onLogout }) => {
  const notify = useOwnerToast();
  const { setIsNotificationsOpen, setIsRoleSwitcherOpen, myRoles } = useAppStore();
  const canSwitchRole = hasMultipleSwitchableRoles(myRoles);
  const [activeTab, setActiveTab] = useState<OwnerTab>('HOME'); 
  const [courts, setCourts] = useState<PitchCourt[]>([]);
  const [dailySummary, setDailySummary] = useState<OwnerDailySummary | null>(null);
  const [todayBookings, setTodayBookings] = useState<PitchBookingFull[]>([]);
  const [courtStats, setCourtStats] = useState<CourtDailyStats[]>([]);
  const [hourlyOccupancy, setHourlyOccupancy] = useState<HourlyOccupancyCell[]>(() => buildEmptyHourlyGrid());
  const [autoApproveMinutes, setAutoApproveMinutes] = useState(35);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  const [pendingRequests, setPendingRequests] = useState<any[]>(INITIAL_PENDING_REQUESTS);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showOccupancyModal, setShowOccupancyModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showBankAccountList, setShowBankAccountList] = useState(false);
  const [showWithdrawals, setShowWithdrawals] = useState(false);
  const [ownerAccount, setOwnerAccount] = useState<OwnerAccount | null>(null);
  const { isReadOnly, isPastDue, can, requireFeature, guardWrite, maxFacilities, maxCourts, maxStaff } =
    useOwnerEntitlements(ownerAccount, notify);

  const handleTabSelect = (tab: OwnerTab) => {
    // Finans & Ekip her owner'a açık — plan kilidi yok.
    setActiveTab(tab);
  };
  const [showPricingPolicy, setShowPricingPolicy] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
      const saved = localStorage.getItem('owner_notificationsEnabled');
      return saved ? JSON.parse(saved) : true;
  });
  const [activeWidgets, setActiveWidgets] = useState<WidgetType[]>(() => {
      const saved = localStorage.getItem('owner_activeWidgets');
      return saved ? JSON.parse(saved) : [
          'QUICK_STATS',
          'QUICK_ACTIONS',
          'OCCUPANCY_ANALYSIS',
          'PENDING_REQUESTS'
      ];
  });
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [showOperations, setShowOperations] = useState(false);
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

  const refreshDashboard = React.useCallback(async (pitchId: string, approveMins: number, courtList?: PitchCourt[]) => {
    try {
      const [summary, bookings, pending] = await Promise.all([
        getOwnerDailySummary(pitchId),
        getPitchBookings(pitchId, todayISO()),
        getPendingBookings(pitchId),
      ]);
      setDailySummary(summary);
      setTodayBookings(bookings);
      const activeCourtRows = (courtList ?? courts).filter((c) => c.is_active !== false);
      const courtMeta = activeCourtRows.map((c) => ({ id: c.id, name: c.name }));
      setCourtStats(computeCourtDailyStats(bookings, courtMeta, todayOpenHoursRef.current));
      setHourlyOccupancy(buildHourlyOccupancyGrid(bookings, courtMeta));
      setPendingRequests(pending.map((b) => bookingToPendingRequest(b, approveMins)));
    } catch (err) {
      notify(toTurkishError(err), 'error');
    }
  }, [courts, notify]);

  const applyPitch = React.useCallback(async (pitch: OwnerPitch, demo: boolean, uid: string) => {
    const facilityCourts = (pitch.courts ?? []).filter((c) => c.is_active !== false);
    // ── HIZLI YOL: kortlar, saatler ve tarifeler pitch objesinde hazır; ANINDA uygula.
    // Ödeme/banka/hesap ayarları AYRI sorgulardan gelir. Bunları beklemek, yavaş
    // bağlantıda kortları/takvimi gereksizce bloklar (owner "Saha ekleyin" görür
    // — 4 kortu olmasına rağmen). Çekirdek operasyon ekranı bir saniye beklemez;
    // finansal ayarlar arkada yüklenip facilityData'ya yamalanır.
    setRealPitchId(pitch.id);
    setIsDemoMode(demo || !!pitch.is_demo);
    setCourts(facilityCourts);
    setAutoApproveMinutes(pitch.auto_approve_minutes ?? 35);
    setIsFacilityOpen(pitch.is_open ?? true);
    setFacilityData({
      id: pitch.id,
      ownerId: uid,
      name: pitch.name ?? 'Tesisim',
      description: pitch.description ?? '',
      images: pitch.images?.length ? pitch.images : pitch.image ? [pitch.image] : [],
      amenities: Array.isArray(pitch.amenities) ? pitch.amenities : [],
      isFacilityOpen: pitch.is_open ?? true,
      pricingPolicy: (pitch.pitch_tariffs ?? []).map((t: PitchTariff) => ({
        startTime: String(t.start_time ?? '08:00'),
        endTime: String(t.end_time ?? '17:00'),
        price: Number(t.price_per_hour ?? 0),
        price_per_hour: Number(t.price_per_hour ?? 0),
      })),
      bankAccounts: [],
      workingHours: Array.isArray(pitch.working_hours) && pitch.working_hours.length ? pitch.working_hours : [],
      district: pitch.district,
      city: pitch.city,
      address: pitch.address,
      verificationStatus: pitch.verification_status ?? 'pending',
      pricingMode: pitch.pricing_mode ?? 'FULL',
      paymentOptions: { online: true, deposit: false, cash: true },
      paramMerchantId: '',
      paramApiKey: '',
      paramClientId: '',
    });

    // Rezervasyon özetleri (HOME) — kortlar zaten set edildi, bloklamadan yükle.
    void refreshDashboard(pitch.id, pitch.auto_approve_minutes ?? 35, facilityCourts);

    // ── YAVAŞ YOL: ödeme/banka/hesap ayarları — TAMAMEN arkada (await EDİLMEZ).
    // applyPitch bunu beklemez; yükleme efekti isLoading'i çekirdek veri gelir
    // gelmez kapatır. Yavaş/bozuk bağlantıda 3 finansal-ayar sorgusu TÜM paneli
    // (HOME iskeleti) kilitlemesin. Başarısız olsa da kortlar/takvim/HOME çalışır.
    void (async () => {
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
      refreshDashboard(realPitchId, autoApproveMinutes);
    }, 'panel');
  }, [realPitchId, autoApproveMinutes, refreshDashboard]);

  // Mock fallback kaldırıldı — tesis yoksa onboarding ekranı gösterilir

  const dynamicTotalRevenue = dailySummary?.collected_today ?? todayBookings.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
  const dynamicOccupancyRatio = dailySummary && dailySummary.total_courts > 0
    ? computeOverallOccupancy(todayBookings, dailySummary.active_courts || dailySummary.total_courts, todayOpenHoursRef.current)
    : computeOverallOccupancy(todayBookings, courts.length, todayOpenHoursRef.current);

  const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length;
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
        message: `Yönetici önizleme — ${facilityData?.name ?? 'tesis'} yönetiliyor (kendi tesisiniz değil)`,
      });
    }
    if (isDemoMode) {
      list.push({
        id: 'demo',
        tone: 'demo',
        message: 'DEMO MODU — OYNA Demo Arena (gerçek veri değil)',
      });
    }
    if (!isDemoMode && facilityData?.verificationStatus === 'pending') {
      list.push({
        id: 'verification',
        tone: 'info',
        message: 'Tesisiniz onay bekliyor — PitchDiscovery\'de görünmez',
      });
    }
    if (!isDemoMode && facilityData?.verificationStatus === 'rejected') {
      list.push({
        id: 'rejected',
        tone: 'danger',
        message: 'Tesis başvurunuz reddedildi — ayarlardan güncelleyin',
      });
    }
    return list;
  }, [isAdminPreview, isDemoMode, facilityData?.verificationStatus, facilityData?.name, ownerAccount, isPastDue]);

  const homeKpis = useMemo((): OwnerKpiItem[] => [
    {
      id: 'revenue',
      label: 'Bugünkü Ciro',
      value: `${dynamicTotalRevenue.toLocaleString('tr-TR')}₺`,
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
      id: 'pending',
      label: 'Onay Bekleyen',
      value: String(pendingCount),
      accent: pendingCount > 0 ? 'amber' : 'slate',
      icon: kpiIcons.clock,
      onClick: pendingCount > 0 ? () => setActiveTab('PENDING_ACTIONS') : undefined,
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
  ], [dynamicTotalRevenue, dynamicOccupancyRatio, pendingCount, confirmedToday]);

  useEffect(() => {
      localStorage.setItem('owner_notificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
      localStorage.setItem('owner_activeWidgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  useEffect(() => {
      if (facilityData?.id && !facilityData.id.startsWith('mock-')) return;
      localStorage.setItem('owner_facilityData', JSON.stringify({
          ...facilityData,
          isFacilityOpen
      }));
  }, [facilityData, isFacilityOpen]);

  const toggleFacilityStatus = async () => {
    if (!guardWrite()) return;
    if (!facilityData?.id) return;
    if (!isDemoMode && facilityData.verificationStatus !== 'approved') {
      notify('Tesis admin onayından sonra yayına alınabilir.', 'warning');
      return;
    }

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

  const [autoApprove, setAutoApprove] = useState(true);
  useEffect(() => {
    if (!realPitchId) return;
    supabase
      .from('pitches')
      .select('auto_approve_enabled, auto_approve_minutes')
      .eq('id', realPitchId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const row = data as { auto_approve_enabled?: boolean; auto_approve_minutes?: number };
        setAutoApprove(row.auto_approve_enabled ?? true);
        if (row.auto_approve_minutes != null) setAutoApproveMinutes(row.auto_approve_minutes);
      });
  }, [realPitchId]);

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
      verificationStatus: facilityData?.verificationStatus ?? 'pending',
      bankAccountCount: facilityData?.bankAccounts?.length ?? 0,
      tariffCount: facilityData?.pricingPolicy?.length ?? 0,
      autoApproveEnabled: autoApprove,
      autoApproveMinutes,
      availableBalance: menuBalance,
      paramConfigured: Boolean(
        facilityData?.paramMerchantId &&
          facilityData?.paramApiKey &&
          facilityData?.paramClientId,
      ),
      courtCount: courts.filter((c) => c.is_active !== false).length,
    }),
    [
      isFacilityOpen,
      facilityData,
      autoApprove,
      autoApproveMinutes,
      menuBalance,
      courts,
    ],
  );

  const toggleAutoApprove = async () => {
    if (!guardWrite()) return;
    const next = !autoApprove;
    setAutoApprove(next);
    if (!realPitchId) return;
    try {
      await updatePitchOperationsSettings(realPitchId, { auto_approve_enabled: next });
    } catch (err) {
      setAutoApprove(!next);
      notify(toTurkishError(err), 'error');
    }
  };

  const handleProcessRequest = async (id: string, action: 'APPROVE' | 'REJECT') => {
      if (!guardWrite()) return;
      setPendingRequests((prev: any[]) => prev.map(req =>
          req.id === id ? { ...req, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : req
      ));
      if (!realPitchId) return;
      try {
          if (action === 'APPROVE') {
              await approveBooking(id);
          } else {
              await rejectBooking(id, 'Tesis sahibi tarafından reddedildi.');
          }
          await refreshDashboard(realPitchId, autoApproveMinutes);
      } catch (err) {
          notify(toTurkishError(err), 'error');
          if (realPitchId) await refreshDashboard(realPitchId, autoApproveMinutes);
      }
  };

  if (needsOnboarding && !isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A1F2C] text-white p-8 text-center">
        <Building2 size={64} className="text-[#FACC15] mb-6" />
        <h1 className="text-2xl font-black mb-3">Tesisinizi OYNA&apos;ya Ekleyin</h1>
        <p className="text-gray-400 text-sm max-w-sm mb-8">
          Ücretli işletme paneline erişmek için tesis kaydını tamamlayın. Demo verisi kaldırıldıysa gerçek tesisinizi oluşturun.
        </p>
        <button
          onClick={() => onNeedOnboarding?.()}
          className="px-8 py-4 bg-[#FACC15] text-black font-black rounded-2xl mb-4"
        >
          TESİS KAYDI BAŞLAT
        </button>
        <button onClick={onBack} className="text-gray-500 text-sm font-bold">Geri Dön</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#1A1F2C] text-slate-200 font-sans selection:bg-blue-500 selection:text-white relative">
      <OwnerStatusBar banners={statusBanners} />
      
      {/* Header logic adjustment for Menu view */}
      {activeTab !== 'CALENDAR' && activeTab !== 'MORE' && (
          <header className="px-6 py-4 pt-safe bg-[#1A1F2C] border-b border-white/5 flex justify-between items-center sticky top-0 z-30">
              <div className="flex items-center gap-3">
                  <button onClick={() => onBack()} className="p-2 rounded-lg hover:bg-[#252B3B] text-gray-400 transition-colors">
                      <ArrowLeft size={20} />
                  </button>
                  <div className="flex flex-col relative">
                      {ownedFacilities.length > 1 && !isDemoMode ? (
                        <button
                          type="button"
                          onClick={() => setShowFacilityPicker((v) => !v)}
                          className="flex items-center gap-1 text-left"
                        >
                          <h1 className="text-sm font-bold text-white tracking-wide">OYNA İŞLETME</h1>
                          <ChevronDown size={14} className="text-gray-400" />
                          <p className="text-[10px] text-emerald-400 font-medium">{facilityData?.name ?? 'Tesisim'}</p>
                        </button>
                      ) : (
                        <>
                          <h1 className="text-sm font-bold text-white tracking-wide text-shadow">OYNA İŞLETME</h1>
                          <p className="text-[10px] text-gray-500 font-medium">{facilityData?.name ?? 'Tesisim'}</p>
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
                              {f.district ? <span className="block text-[10px] text-gray-500 font-normal">{f.district}</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
              </div>
              <button 
                onClick={() => setIsNotificationsOpen(true)}
                className="p-2 rounded-lg hover:bg-[#252B3B] text-gray-400 relative"
              >
                  <Bell size={20} />
                  {pendingCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-[#1A1F2C]"></span>}
              </button>
          </header>
      )}

      {/* Simplified Header for Menu View */}
      {activeTab === 'MORE' && (
          <header className="px-6 py-4 bg-[#1A1F2C] border-b border-white/5 flex items-center sticky top-0 z-30">
              <h1 className="text-lg font-black text-white tracking-wide">MENÜ & AYARLAR</h1>
          </header>
      )}

      {activeTab === 'HOME' && isLoading && <OwnerHomeSkeleton />}

      {activeTab === 'HOME' && !isLoading && (
          <main className="flex-1 px-6 pt-6 overflow-y-auto custom-scrollbar pb-32">
              <OwnerCommandStrip
                pendingCount={pendingCount}
                isFacilityOpen={isFacilityOpen}
                onPendingClick={pendingCount > 0 ? () => setActiveTab('PENDING_ACTIONS') : undefined}
                onCalendarClick={() => setActiveTab('CALENDAR')}
              />

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
                        <QrCode size={24} className="text-white" />
                      </div>
                      <span className="text-sm font-black italic text-white">SKOR GİR</span>
                      <span className="text-[10px] font-bold text-blue-100 mt-1 uppercase tracking-widest">QR veya Manuel</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('CALENDAR')}
                      className="flex flex-col items-center justify-center p-6 bg-[#161B22] rounded-3xl border border-white/5 hover:border-white/10 transition-all group active:scale-95"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Plus size={24} className="text-white" />
                      </div>
                      <span className="text-sm font-black italic text-white">YENİ KAYIT</span>
                      <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-widest">Rezervasyon</span>
                    </button>
                  </div>
              )}

              {activeWidgets.includes('OCCUPANCY_ANALYSIS') && (
                  <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
                    <h3 className="font-bold text-white text-base flex items-center gap-2 mb-6">
                        <BarChartIcon size={18} className="text-indigo-500" /> Saha Doluluk Analizi
                    </h3>
                    <PitchOccupancyGrid data={hourlyOccupancy} courtNames={courts.map(c => c.name)} />
                  </div>
              )}

              {activeWidgets.includes('PENDING_REQUESTS') && (
                  <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
                      <h3 className="font-bold text-white text-base flex items-center gap-2 mb-4">
                          <Clock size={18} className="text-yellow-500" /> Onay Bekleyen Talepler
                      </h3>
                      {pendingCount > 0 ? (
                          <div className="space-y-4">
                              {pendingRequests.filter((r: any) => r.status === 'PENDING').slice(0, 3).map((req: any) => (
                                  <MatchCountdownItem 
                                      key={req.id}
                                      request={req}
                                      onApprove={() => handleProcessRequest(req.id, 'APPROVE')}
                                      onReject={() => handleProcessRequest(req.id, 'REJECT')}
                                  />
                              ))}
                              {pendingCount > 3 && (
                                  <button onClick={() => setActiveTab('PENDING_ACTIONS')} className="w-full py-2 text-xs font-bold text-blue-400 hover:text-blue-300 text-center">Tümünü Gör ({pendingCount})</button>
                              )}
                          </div>
                      ) : (
                          <p className="text-sm text-gray-500 text-center py-4">Bekleyen talep bulunmuyor.</p>
                      )}
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
          readOnly={isReadOnly}
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
                pricingPolicy: (pitch.pitch_tariffs ?? []).map((t: PitchTariff) => ({
                  startTime: String(t.start_time ?? '08:00'),
                  endTime: String(t.end_time ?? '17:00'),
                  price: Number(t.price_per_hour ?? 0),
                  price_per_hour: Number(t.price_per_hour ?? 0),
                })),
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
          readOnly={isReadOnly}
          maxCourts={maxCourts}
        />
      )}
      {/* Finans & Ekip her owner'a açık — plan/abonelik kilidi yok (karar: owner abonelik ödemez). */}
      {activeTab === 'FINANCE' && (
        <OwnerFinanceView
          pitchId={realPitchId ?? facilityData?.id ?? ''}
          isDemoMode={isDemoMode}
          readOnly={isReadOnly}
          onOpenCalendar={() => setActiveTab('CALENDAR')}
        />
      )}
      {activeTab === 'TEAM' && (
        <OwnerTeamView
          pitchId={realPitchId ?? facilityData?.id ?? ''}
          isDemoMode={isDemoMode}
          readOnly={isReadOnly}
          maxStaff={maxStaff}
        />
      )}
      {activeTab === 'PENDING_ACTIONS' && (
          <PendingActionsView 
              pendingRequests={pendingRequests}
              realPitchId={realPitchId}
              autoApprove={autoApprove}
              onToggleAutoApprove={toggleAutoApprove}
              onApprove={(id) => handleProcessRequest(id, 'APPROVE')} 
              onReject={(id) => handleProcessRequest(id, 'REJECT')}
              onBack={() => setActiveTab('HOME')}
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
            if (guardWrite()) setShowEditProfile(true);
          }}
          onWorkingHours={() => {
            if (guardWrite()) setShowWorkingHours(true);
          }}
          onOperations={() => {
            if (guardWrite()) setShowOperations(true);
          }}
          onBankAccounts={() => {
            if (guardWrite()) setShowBankAccountList(true);
          }}
          onWithdrawals={() => setShowWithdrawals(true)}
          onPricingPolicy={() => {
            if (guardWrite()) setShowPricingPolicy(true);
          }}
          onSecurity={() => setShowSecurity(true)}
          onSupport={() => setShowSupport(true)}
          onLogout={() => setShowLogoutConfirm(true)}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={() => setNotificationsEnabled(!notificationsEnabled)}
          onWidgetSettings={() => setShowWidgetSettings(true)}
          onPitches={() => {
            if (guardWrite()) setActiveTab('PITCHES');
          }}
          onSwitchRole={() => setIsRoleSwitcherOpen(true)}
          canSwitchRole={canSwitchRole}
          isReadOnly={isReadOnly}
        />
      )}

      {/* MODALS */}
      {showEditProfile && (
        <OwnerFacilitySettingsModal
          onClose={() => setShowEditProfile(false)}
          facilityId={facilityData?.id}
          initialData={facilityData}
          onSave={(data) => setFacilityData((prev: any) => ({ ...prev, ...data }))}
          onOpenCourts={() => {
            setShowEditProfile(false);
            if (guardWrite()) setActiveTab('PITCHES');
          }}
          onOpenPricing={() => {
            setShowEditProfile(false);
            if (guardWrite()) setShowPricingPolicy(true);
          }}
          onOpenHours={() => {
            setShowEditProfile(false);
            if (guardWrite()) setShowWorkingHours(true);
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
      {showOperations && (
        <OwnerOperationsSettingsModal
          onClose={() => setShowOperations(false)}
          facilityId={facilityData?.id ?? ''}
          onUpdated={({ autoApproveEnabled, autoApproveMinutes: mins }) => {
            setAutoApprove(autoApproveEnabled);
            setAutoApproveMinutes(mins);
          }}
        />
      )}
      {showBankAccountList && (
        <OwnerBankAccountsModal
          pitchId={facilityData?.id ?? ''}
          onClose={() => setShowBankAccountList(false)}
          onUpdated={(accounts) =>
            setFacilityData((prev: any) => (prev ? { ...prev, bankAccounts: accounts } : prev))
          }
          readOnly={isReadOnly}
        />
      )}
      {showWithdrawals && (
        <OwnerWithdrawalsModal
          onClose={() => setShowWithdrawals(false)}
          facilityId={facilityData?.id}
          readOnly={isReadOnly}
        />
      )}
      {showPricingPolicy && (
        <OwnerPricingPolicyModal
          onClose={() => setShowPricingPolicy(false)}
          facilityId={facilityData?.id}
          onSave={(policy) => setFacilityData((prev: any) => ({ ...prev, pricingPolicy: policy }))}
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
        <OwnerLogoutModal onClose={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); (onLogout ?? onBack)(); }} />
      )}

      {showRevenueModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-8">
                      <h3 className="text-2xl font-black text-white italic tracking-tight">CİRO DETAYLARI</h3>
                      <button onClick={() => setShowRevenueModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="space-y-4">
                      {courtStats.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-6">Bugün için saha bazlı ciro verisi yok.</p>
                      ) : courtStats.map((item) => (
                          <div key={item.courtId} className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-400">{item.courtName}</span>
                              <span className="text-lg font-black text-emerald-400">{item.collected.toLocaleString('tr-TR')}₺</span>
                          </div>
                      ))}
                      <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                          <span className="text-base font-black text-white">TOPLAM TAHSİLAT</span>
                          <span className="text-2xl font-black text-emerald-500">{dynamicTotalRevenue.toLocaleString('tr-TR')}₺</span>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showOccupancyModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-8">
                      <h3 className="text-2xl font-black text-white italic tracking-tight">DOLULUK DETAYI</h3>
                      <button onClick={() => setShowOccupancyModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="space-y-6">
                      {courtStats.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-6">Bugün için doluluk verisi yok.</p>
                      ) : courtStats.map((item) => (
                          <div key={item.courtId} className="space-y-2">
                              <div className="flex justify-between items-end">
                                  <span className="text-sm font-bold text-white">{item.courtName}</span>
                                  <span className={`text-sm font-black ${item.occupancyPercent < 50 ? 'text-red-500' : 'text-emerald-500'}`}>%{item.occupancyPercent}</span>
                              </div>
                              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${item.occupancyPercent < 50 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${item.occupancyPercent}%` }}></div>
                              </div>
                              <p className="text-[10px] text-gray-500">{item.bookedHours}/{item.totalHours} saat dolu</p>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}


      <OwnerBottomNav
        activeTab={activeTab}
        pendingCount={pendingCount}
        financeLocked={false}
        teamLocked={false}
        onSelect={(tab) => {
          if (tab === 'MORE') setActiveTab('MORE');
          else handleTabSelect(tab);
        }}
      />
    </div>
  );
};

const OwnerPanel: React.FC<OwnerPanelProps> = (props) => (
  <OwnerToastProvider>
    <OwnerPanelInner {...props} />
  </OwnerToastProvider>
);

export default OwnerPanel;
