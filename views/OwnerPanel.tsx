
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Wallet, TrendingUp, Calendar, AlertCircle, Settings, 
  MessageSquare, Clock, XCircle, Home, Users, CheckCircle2, ChevronRight, Bell, 
  MoreHorizontal, Shield, Hand, DollarSign, Filter, RefreshCw, X, Search, ChevronDown, BarChart as BarChartIcon, ArrowUpRight, Zap, Phone, Plus, User, Lock, CreditCard, Banknote, Trash2, Edit3, Tag, Percent, CalendarDays, TrendingDown, Send, Receipt, ClipboardList, Briefcase, UserCheck, Flame, Building2, Image as ImageIcon, MapPin, Globe, HelpCircle, LogOut, FileText, Camera, Save, Type, List, Check, QrCode, PieChart as PieChartIcon, Activity, ZapOff, CreditCard as CardIcon, Coins, Trophy, Star, Target, ChevronLeft, ImagePlus, GripVertical, LayoutDashboard
} from 'lucide-react';

import { OWNER_TRANSACTIONS, PITCHES } from '../constants';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import {
  getOwnerPitches,
  saveTariffs,
  saveWorkingHours,
  togglePitchOpen,
  requestWithdrawal,
  getOwnerBalance,
  toTurkishError,
  type TariffInput,
} from '../services/pitchOwnerService';

interface OwnerPanelProps {
  onBack: () => void;
  onNavigate: (view: any) => void;
}

// --- MOCK DATA ---

const HOURLY_DATA = [
    { time: '00:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '01:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '02:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '03:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '04:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '05:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '06:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '07:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '08:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '09:00', occupancy: 1, pitches: ['DAILY', null, null, null] },
    { time: '10:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '11:00', occupancy: 2, pitches: ['DAILY', 'SUB', null, null] },
    { time: '12:00', occupancy: 1, pitches: [null, null, 'DAILY', null] },
    { time: '13:00', occupancy: 0, pitches: [null, null, null, null] },
    { time: '14:00', occupancy: 2, pitches: ['SUB', null, 'DAILY', null] },
    { time: '15:00', occupancy: 1, pitches: [null, 'SUB', null, null] },
    { time: '16:00', occupancy: 4, pitches: ['DAILY', 'SUB', 'DAILY', 'SUB'] },
    { time: '17:00', occupancy: 3, pitches: ['SUB', 'DAILY', 'SUB', null] },
    { time: '18:00', occupancy: 4, pitches: ['DAILY', 'DAILY', 'SUB', 'SUB'] },
    { time: '19:00', occupancy: 4, pitches: ['SUB', 'SUB', 'DAILY', 'DAILY'] },
    { time: '20:00', occupancy: 4, pitches: ['DAILY', 'SUB', 'DAILY', 'SUB'] },
    { time: '21:00', occupancy: 3, pitches: ['SUB', 'DAILY', null, 'DAILY'] },
    { time: '22:00', occupancy: 2, pitches: ['DAILY', null, null, 'SUB'] },
    { time: '23:00', occupancy: 0, pitches: [null, null, null, null] },
];

const INITIAL_PENDING_REQUESTS = [
    {
        id: 'req1',
        title: 'Ahmet Kuru',
        subtitle: 'Saha 1 (17:00 - 18:00)',
        timerSeconds: 25 * 60 + 49,
        status: 'PENDING'
    },
    {
        id: 'req2',
        title: 'Vadi Gücü FC',
        subtitle: 'Saha 2 (21:00 - 22:00)',
        timerSeconds: 35 * 60,
        status: 'PENDING'
    }
];

const MatchCountdownItem: React.FC<{
    request: any;
    onApprove: () => void;
    onReject: () => void;
}> = ({ request, onApprove, onReject }) => {
    const [timeLeft, setTimeLeft] = useState(request.timerSeconds || (request.timerMinutes ? request.timerMinutes * 60 : 0));

    useEffect(() => {
        if (timeLeft <= 0 || request.status !== 'PENDING') return;
        const timerId = setInterval(() => {
            setTimeLeft((prev: number) => {
                if (prev <= 1) {
                    onApprove();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, request.status, onApprove]);

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

// Mock Expenses
const EXPENSES = [
    { id: 'e1', title: 'Elektrik Faturası', date: 'Bugün', amount: 4500, category: 'Fatura' },
    { id: 'e2', title: 'Saha Bakımı (Granül)', date: 'Dün', amount: 1200, category: 'Bakım' },
    { id: 'e3', title: 'Personel Avans', date: '22 Mart', amount: 2000, category: 'Personel' },
];

// Mock Debtors (Veresiye)
const DEBTORS = [
    { id: 'd1', name: 'Ahmet Yılmaz', phone: '555-123-4567', amount: 400, lastMatch: '20 Mart' },
    { id: 'd2', name: 'Vadi Gücü FC', phone: '555-987-6543', amount: 1200, lastMatch: '18 Mart' },
];

// Mock Staff Members (Metrics removed)
const STAFF_MEMBERS = [
    { id: 's1', name: 'Murat S.', role: 'Tesis Müdürü', status: 'ON_DUTY', avatar: 'https://i.pravatar.cc/150?u=murat' },
    { id: 's2', name: 'Sinan K.', role: 'Saha Sorumlusu', status: 'ON_DUTY', avatar: 'https://i.pravatar.cc/150?u=sinan' },
    { id: 's3', name: 'Hülya T.', role: 'Kafeterya', status: 'OFF_DUTY', avatar: 'https://i.pravatar.cc/150?u=hulya' },
];

// Mock Team Tasks
const TEAM_TASKS = [
    { id: 't1', title: 'Saha 1 Aydınlatma Kontrolü', assignedTo: 'Sinan K.', priority: 'HIGH', status: 'PENDING', time: '18:00' },
    { id: 't2', title: 'Soyunma Odası Temizliği', assignedTo: 'Hülya T.', priority: 'MEDIUM', status: 'COMPLETED', time: '14:30' },
    { id: 't3', title: 'Yeni File Montajı', assignedTo: 'Sinan K.', priority: 'LOW', status: 'PENDING', time: 'Yarın' },
    { id: 't4', title: 'Kasa Kapanış Raporu', assignedTo: 'Murat S.', priority: 'HIGH', status: 'PENDING', time: '23:30' },
];

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

const CALENDAR_BOOKINGS: CalendarBooking[] = [
    { id: 'b1', time: '17:00', duration: 1, user: 'Ahmet Yılmaz', type: 'APP', status: 'PAID', price: 2000, paid: 2000, note: '', pitchId: '1' },
    { id: 'b2', time: '18:00', duration: 1, user: 'Mehmet Demir', type: 'PHONE', status: 'PARTIAL', price: 3200, paid: 500, note: 'Elden ödeyecek', pitchId: '1' },
    { id: 'b3', time: '19:00', duration: 1, user: 'Kaplanlar FC', type: 'SUB', status: 'PAID', price: 3200, paid: 3200, note: 'Abone', pitchId: '1' },
    { id: 'b4', time: '20:00', duration: 1, user: 'Misafir', type: 'APP', status: 'PENDING', price: 3200, paid: 0, note: 'Ödeme bekleniyor', pitchId: '1' },
    { id: 'b5', time: '19:00', duration: 1, user: 'Vadi Gücü', type: 'APP', status: 'PAID', price: 3200, paid: 3200, note: '', pitchId: '2' },
    { id: 'b6', time: '21:00', duration: 1, user: 'Gece Kuşları', type: 'APP', status: 'PAID', price: 3200, paid: 3200, note: '', pitchId: '1' },
    { id: 'b7', time: '22:00', duration: 1, user: 'Son Dakika FC', type: 'PHONE', status: 'PENDING', price: 3200, paid: 0, note: '', pitchId: '1' },
    { id: 'b8', time: '13:00', duration: 1, user: 'Öğle Grubu', type: 'APP', status: 'PAID', price: 2000, paid: 2000, note: '', pitchId: '1' },
    { id: 'b9', time: '14:00', duration: 1, user: 'Kurumsal Maç', type: 'PHONE', status: 'PAID', price: 2000, paid: 2000, note: '', pitchId: '1' },
    { id: 'b10', time: '15:00', duration: 1, user: 'Genç Yetenekler', type: 'APP', status: 'PARTIAL', price: 2000, paid: 1000, note: '', pitchId: '1' },
    { id: 'b11', time: '10:00', duration: 1, user: 'Sabah Sporu', type: 'SUB', status: 'PAID', price: 1500, paid: 1500, note: '', pitchId: '1' },
];

const WEEKLY_REVENUE_DATA = [
    { day: 'Pzt', revenue: 12000 },
    { day: 'Sal', revenue: 14500 },
    { day: 'Çar', revenue: 11000 },
    { day: 'Per', revenue: 16000 },
    { day: 'Cum', revenue: 22000 },
    { day: 'Cmt', revenue: 28000 },
    { day: 'Paz', revenue: 24000 },
];

const EXPENSE_DISTRIBUTION = [
    { name: 'Elektrik', value: 4500, color: '#00F5FF' },
    { name: 'Personel', value: 8000, color: '#FF00FF' },
    { name: 'Bakım', value: 2500, color: '#FFFF00' },
    { name: 'Diğer', value: 1500, color: '#00FF00' },
];

const PAYMENT_METHODS = [
    { id: 'cash', name: 'Nakit', amount: 4500, count: 12, icon: <Banknote size={20} />, details: 'Elden alınan ödemeler. Hemen kasaya girer.' },
    { id: 'card', name: 'Kredi Kartı', amount: 7200, count: 18, icon: <CardIcon size={20} />, details: 'POS cihazı üzerinden yapılan çekimler. T+1 gününde hesaba geçer.' },
    { id: 'transfer', name: 'Havale/EFT', amount: 1900, count: 5, icon: <Coins size={20} />, details: 'Banka hesabına doğrudan gönderilen tutarlar. Dekont kontrolü gerektirir.' },
];

const SUBSCRIPTION_RATIO = [
    { name: 'Abone', value: 65, color: '#3b82f6' }, // Blue
    { name: 'Normal', value: 35, color: '#10b981' }, // Green
];

const HEATMAP_DATA = [
    { hour: '00:00', intensity: 0 }, { hour: '01:00', intensity: 0 }, { hour: '02:00', intensity: 0 },
    { hour: '03:00', intensity: 0 }, { hour: '04:00', intensity: 0 }, { hour: '05:00', intensity: 0 },
    { hour: '06:00', intensity: 0 }, { hour: '07:00', intensity: 0 }, { hour: '08:00', intensity: 5 },
    { hour: '09:00', intensity: 20 }, { hour: '10:00', intensity: 10 }, { hour: '11:00', intensity: 30 },
    { hour: '12:00', intensity: 40 }, { hour: '13:00', intensity: 20 }, { hour: '14:00', intensity: 50 },
    { hour: '15:00', intensity: 40 }, { hour: '16:00', intensity: 70 }, { hour: '17:00', intensity: 80 },
    { hour: '18:00', intensity: 100 }, { hour: '19:00', intensity: 100 }, { hour: '20:00', intensity: 100 },
    { hour: '21:00', intensity: 90 }, { hour: '22:00', intensity: 60 }, { hour: '23:00', intensity: 20 },
];

type OwnerTab = 'HOME' | 'CALENDAR' | 'FINANCE' | 'TEAM' | 'MORE' | 'PENDING_ACTIONS';

type WidgetType = 'QUICK_STATS' | 'QUICK_ACTIONS' | 'OCCUPANCY_ANALYSIS' | 'PENDING_REQUESTS' | 'WEATHER_INFO' | 'STAFF_STATUS' | 'MAINTENANCE_ALERTS';

const WIDGETS: { id: WidgetType; title: string; description: string; icon: any }[] = [
    { id: 'QUICK_STATS', title: 'Hızlı İstatistikler', description: 'Günlük ciro ve doluluk oranını gösterir.', icon: BarChartIcon },
    { id: 'QUICK_ACTIONS', title: 'Hızlı İşlemler', description: 'QR okutma ve yeni kayıt oluşturma butonları.', icon: Zap },
    { id: 'OCCUPANCY_ANALYSIS', title: 'Saha Doluluk Analizi', description: 'Sahaların saatlik doluluk durumunu gösterir.', icon: Activity },
    { id: 'PENDING_REQUESTS', title: 'Onay Bekleyen Talepler', description: 'Bekleyen rezervasyon taleplerini listeler.', icon: Clock }
];

const INTERNAL_PITCHES = [
    { id: '1', name: 'Saha 1' },
    { id: '2', name: 'Saha 2' },
    { id: '3', name: 'Saha 3' },
    { id: '4', name: 'Saha 4' }
];

const AVAILABLE_AMENITIES = ['Duş', 'Otopark', 'Kafe', 'WiFi', 'Kamera Kaydı', 'Mescit', 'Krampon Kiralama', 'Büfe'];

// --- COMPONENTS ---

const AnimatedBarChart: React.FC<{ data: typeof HOURLY_DATA; dataKey: 'revenue' | 'occupancy'; color: string; height?: number; maxValue?: number; onBarClick?: (data: any) => void; showGrid?: boolean }> = ({ data, dataKey, color, height = 160, maxValue, onBarClick, showGrid = true }) => {
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
                                    backgroundColor: isActive ? '#FFFF00' : color, 
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

const LogoutConfirmationModal: React.FC<{ onClose: () => void; onConfirm: () => void }> = ({ onClose, onConfirm }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-[#161B22] w-full max-w-sm rounded-[40px] border border-white/10 p-8 text-center animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                    <LogOut size={40} />
                </div>
                <h3 className="text-2xl font-black text-white italic mb-2">GÜVENLİ ÇIKIŞ</h3>
                <p className="text-gray-400 text-sm mb-8 leading-relaxed">Oturumunuzu sonlandırmak istediğinize emin misiniz?</p>
                
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={onClose}
                        className="py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-all"
                    >
                        İPTAL
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="py-4 bg-red-500 text-white font-black rounded-2xl shadow-xl shadow-red-900/20 hover:bg-red-400 transition-all"
                    >
                        ÇIKIŞ YAP
                    </button>
                </div>
            </div>
        </div>
    );
};

interface Tariff {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    price: number;
    deposit: number;
}

const PricingPolicyModal: React.FC<{ onClose: () => void; facilityId: string; initialPrices?: any; onSave: (tariffs: any) => void }> = ({ onClose, facilityId, initialPrices, onSave }) => {
    const [tariffs, setTariffs] = useState<Tariff[]>(() => {
        if (Array.isArray(initialPrices)) return initialPrices;
        return [
            { id: '1', name: 'Gündüz Tarifesi', startTime: '08:00', endTime: '17:00', price: 2000, deposit: 500 },
            { id: '2', name: 'Akşam Tarifesi', startTime: '18:00', endTime: '00:00', price: 3200, deposit: 1000 },
            { id: '3', name: 'Hafta Sonu Sabit', startTime: '08:00', endTime: '00:00', price: 3500, deposit: 1500 }
        ];
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!facilityId) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const isRealPitch = !facilityId.startsWith('mock-');
            if (isRealPitch) {
                // Tarife adından gün/tip çıkarımı (modal gün seçimi içermiyor)
                const mapped: TariffInput[] = tariffs.map((t, idx) => {
                    const lower = t.name.toLocaleLowerCase('tr-TR');
                    const isWeekend = lower.includes('hafta sonu') || lower.includes('weekend') || lower.includes('cumartesi') || lower.includes('pazar');
                    return {
                        name: t.name,
                        tariff_type: isWeekend ? 'WEEKEND' : 'WEEKDAY',
                        applies_to_days: isWeekend ? [6, 7] : [1, 2, 3, 4, 5],
                        start_time: t.startTime,
                        end_time: t.endTime,
                        price_per_hour: Number(t.price) || 0,
                        deposit_amount: Number(t.deposit) || 0,
                        sort_order: idx,
                    };
                });
                await saveTariffs(facilityId, mapped);
            }
            onSave(tariffs);
            setIsSaving(false);
            onClose();
        } catch (error) {
            console.error("Fiyatlandırma kaydedilirken hata:", error);
            setSaveError(toTurkishError(error));
            setIsSaving(false);
        }
    };

    const addTariff = () => {
        setTariffs([...tariffs, {
            id: Date.now().toString(),
            name: 'Yeni Tarife',
            startTime: '08:00',
            endTime: '00:00',
            price: 0,
            deposit: 0
        }]);
    };

    const updateTariff = (id: string, field: keyof Tariff, value: string | number) => {
        setTariffs(tariffs.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const removeTariff = (id: string) => {
        setTariffs(tariffs.filter(t => t.id !== id));
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
                <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white">
                    <X size={20} />
                </button>
                <h2 className="text-white font-bold text-lg italic">Fiyatlandırma Politikası</h2>
                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="p-2 px-4 rounded-xl bg-[#FFFF00] text-black font-bold text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50"
                >
                    {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
                    <AlertCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-200 leading-relaxed font-medium">
                        Fiyat değişiklikleri mevcut rezervasyonları etkilemez, sadece yeni yapılacak kayıtlar için geçerli olur. Her tarife için saat aralığı, saatlik ücret ve kapora tutarı belirleyebilirsiniz.
                    </p>
                </div>

                {saveError && (
                    <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" /> {saveError}
                    </div>
                )}

                <div className="space-y-4">
                    {tariffs.map((tariff) => (
                        <div key={tariff.id} className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-4 relative group">
                            <button 
                                onClick={() => removeTariff(tariff.id)}
                                className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={16} />
                            </button>
                            
                            <div className="flex items-center gap-3 text-gray-400 border-b border-white/5 pb-4 pr-10">
                                <Tag size={20} className="text-[#FFFF00]" />
                                <input 
                                    type="text" 
                                    value={tariff.name}
                                    onChange={(e) => updateTariff(tariff.id, 'name', e.target.value)}
                                    className="bg-transparent text-sm font-black uppercase tracking-widest text-white outline-none w-full"
                                    placeholder="Tarife Adı"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Başlangıç Saati</label>
                                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl">
                                        <Clock size={16} className="text-gray-400" />
                                        <input 
                                            type="time" 
                                            value={tariff.startTime}
                                            onChange={(e) => updateTariff(tariff.id, 'startTime', e.target.value)}
                                            className="bg-transparent text-white text-sm font-bold outline-none w-full"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Bitiş Saati</label>
                                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl">
                                        <Clock size={16} className="text-gray-400" />
                                        <input 
                                            type="time" 
                                            value={tariff.endTime}
                                            onChange={(e) => updateTariff(tariff.id, 'endTime', e.target.value)}
                                            className="bg-transparent text-white text-sm font-bold outline-none w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Saatlik Ücret</label>
                                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl focus-within:border-[#FFFF00]/50 transition-colors">
                                        <input 
                                            type="number" 
                                            value={tariff.price}
                                            onChange={(e) => updateTariff(tariff.id, 'price', parseInt(e.target.value) || 0)}
                                            className="bg-transparent text-white text-lg font-black outline-none w-full"
                                        />
                                        <span className="text-sm font-bold text-gray-400">₺</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Kapora Tutarı</label>
                                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl focus-within:border-[#FFFF00]/50 transition-colors">
                                        <input 
                                            type="number" 
                                            value={tariff.deposit}
                                            onChange={(e) => updateTariff(tariff.id, 'deposit', parseInt(e.target.value) || 0)}
                                            className="bg-transparent text-white text-lg font-black outline-none w-full"
                                        />
                                        <span className="text-sm font-bold text-gray-400">₺</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button 
                    onClick={addTariff}
                    className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5 hover:text-white hover:border-white/20 transition-all"
                >
                    <Plus size={18} /> YENİ TARİFE EKLE
                </button>
            </div>
        </div>
    );
};

const BankOperationsModal: React.FC<{ onClose: () => void; facilityId: string }> = ({ onClose, facilityId }) => {
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [iban, setIban] = useState('');
    const [ibanPhoto, setIbanPhoto] = useState<string | null>(null);
    const [ibanPhotoFile, setIbanPhotoFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);
    const [availableBalance, setAvailableBalance] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isRealPitch = !!facilityId && !facilityId.startsWith('mock-');

    useEffect(() => {
        let active = true;
        if (!isRealPitch) {
            setAvailableBalance(12500); // demo modu
            return;
        }
        getOwnerBalance(facilityId)
            .then(bal => { if (active) setAvailableBalance(bal.available); })
            .catch(() => { if (active) setAvailableBalance(0); });
        return () => { active = false; };
    }, [facilityId, isRealPitch]);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIbanPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setIbanPhoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleWithdraw = async () => {
        if (!withdrawAmount || !iban) return;
        const amount = Number(withdrawAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setWithdrawError('Geçerli bir tutar girin.');
            return;
        }
        if (amount > availableBalance) {
            setWithdrawError('Çekmek istediğiniz tutar bakiyenizden fazla.');
            return;
        }
        setIsProcessing(true);
        setWithdrawError(null);
        try {
            if (isRealPitch) {
                await requestWithdrawal(facilityId, amount, iban, ibanPhotoFile ?? undefined);
            } else {
                await new Promise(r => setTimeout(r, 800)); // demo modu
            }
            setWithdrawSuccess(true);
            setIsProcessing(false);
            setTimeout(() => onClose(), 1300);
        } catch (error) {
            console.error("İşlem hatası:", error);
            setWithdrawError(toTurkishError(error));
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#0A0D14] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                        <X size={20} />
                    </button>
                    <h2 className="text-white font-bold text-lg">Banka İşlemleri</h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 max-w-2xl mx-auto w-full space-y-8">
                
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 p-6 rounded-3xl border border-blue-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Wallet size={80} />
                    </div>
                    <p className="text-blue-200 text-sm font-bold mb-1">Çekilebilir Bakiye</p>
                    <h3 className="text-4xl font-black text-white tracking-tight">₺{availableBalance.toLocaleString('tr-TR')}</h3>
                </div>

                {/* Withdraw Form */}
                <div className="space-y-6">
                    <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors shadow-sm">
                        <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Çekilecek Tutar (TL)</label>
                        <input 
                            type="number" 
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            className="w-full bg-transparent text-white font-bold text-2xl outline-none placeholder:text-gray-600"
                            placeholder="0.00"
                            max={availableBalance}
                        />
                    </div>

                    <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors shadow-sm">
                        <label className="text-xs font-bold text-gray-400 uppercase block mb-2">IBAN Numarası</label>
                        <input 
                            type="text" 
                            value={iban}
                            onChange={(e) => setIban(e.target.value)}
                            className="w-full bg-transparent text-white font-mono text-lg outline-none placeholder:text-gray-600 tracking-wider"
                            placeholder="TR00 0000 0000 0000 0000 0000 00"
                        />
                    </div>

                    <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5 shadow-sm">
                        <label className="text-xs font-bold text-gray-400 uppercase block mb-3">IBAN Fotoğrafı (İsteğe Bağlı)</label>
                        
                        {ibanPhoto ? (
                            <div className="relative w-full h-48 rounded-xl overflow-hidden border border-white/10 group">
                                <img src={ibanPhoto} alt="IBAN" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button 
                                        onClick={() => { setIbanPhoto(null); setIbanPhotoFile(null); }}
                                        className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-white hover:border-white/30 transition-colors cursor-pointer bg-black/20"
                            >
                                <Camera size={32} />
                                <span className="text-sm font-bold">Fotoğraf Çek veya Yükle</span>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handlePhotoUpload} 
                                    accept="image/*" 
                                    capture="environment"
                                    className="hidden" 
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                            İşleminizin daha hızlı onaylanması için IBAN numaranızın yer aldığı banka kartınızın veya dekontunuzun fotoğrafını yükleyebilirsiniz.
                        </p>
                    </div>
                </div>

                {withdrawError && (
                    <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" /> {withdrawError}
                    </div>
                )}
                {withdrawSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 size={16} className="shrink-0" /> Para çekme talebiniz alındı. Onay sonrası bilgilendirileceksiniz.
                    </div>
                )}

                <button 
                    onClick={handleWithdraw}
                    disabled={isProcessing || withdrawSuccess || !withdrawAmount || !iban || Number(withdrawAmount) > availableBalance || Number(withdrawAmount) <= 0}
                    className="w-full py-4 rounded-2xl bg-[#FFFF00] text-black font-black text-lg flex items-center justify-center gap-2 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_20px_rgba(255,255,0,0.2)]"
                >
                    {isProcessing ? 'İŞLENİYOR...' : <><Banknote size={24} /> PARA ÇEK</>}
                </button>
            </div>
        </div>
    );
};

const WorkingHoursModal: React.FC<{ onClose: () => void; facilityId: string; isOpen: boolean; onToggleOpen: () => void; initialHours?: any[]; onSave: (days: any) => void }> = ({ onClose, facilityId, isOpen, onToggleOpen, initialHours, onSave }) => {
    const [days, setDays] = useState(initialHours || [
        { name: 'Pazartesi', open: '08:00', close: '00:00' },
        { name: 'Salı', open: '08:00', close: '00:00' },
        { name: 'Çarşamba', open: '08:00', close: '00:00' },
        { name: 'Perşembe', open: '08:00', close: '00:00' },
        { name: 'Cuma', open: '08:00', close: '02:00' },
        { name: 'Cumartesi', open: '08:00', close: '02:00' },
        { name: 'Pazar', open: '08:00', close: '00:00' },
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!facilityId) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            if (!facilityId.startsWith('mock-')) {
                await saveWorkingHours(facilityId, days);
            }
            onSave(days);
            setIsSaving(false);
            onClose();
        } catch (error) {
            console.error("Çalışma saatleri kaydedilirken hata:", error);
            setSaveError(toTurkishError(error));
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
                <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white">
                    <X size={20} />
                </button>
                <h2 className="text-white font-bold text-lg italic">Çalışma Saatleri</h2>
                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="p-2 px-4 rounded-xl bg-[#FFFF00] text-black font-bold text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50"
                >
                    {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {saveError && (
                    <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" /> {saveError}
                    </div>
                )}
                {/* Manual Toggle */}
                <div className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white italic">TESİS DURUMU</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Anlık olarak tesisi kapatın</p>
                    </div>
                    <button 
                        onClick={onToggleOpen}
                        className={`w-20 h-10 rounded-full relative transition-all duration-500 ${isOpen ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
                    >
                        <div className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-all duration-500 flex items-center justify-center ${isOpen ? 'right-1' : 'left-1'}`}>
                            {isOpen ? <Check size={16} className="text-emerald-500" /> : <X size={16} className="text-red-500" />}
                        </div>
                    </button>
                </div>

                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">HAFTALIK PROGRAM</h4>
                    {days.map(day => (
                        <div key={day.name} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{day.name}</span>
                            <div className="flex items-center gap-3">
                                <div className="bg-[#0A0E14] px-3 py-2 rounded-xl border border-white/5 text-xs font-mono text-gray-300">{day.open}</div>
                                <div className="w-2 h-px bg-gray-700"></div>
                                <div className="bg-[#0A0E14] px-3 py-2 rounded-xl border border-white/5 text-xs font-mono text-gray-300">{day.close}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface PaymentSettingsModalProps {
  onClose: () => void;
  facilityId: string;
  initialData?: any;
  onSave: (data: any) => void;
}

const PaymentSettingsModal: React.FC<PaymentSettingsModalProps> = ({ onClose, facilityId, initialData, onSave }) => {
  const [online, setOnline] = useState(initialData?.paymentOptions?.online ?? true);
  const [deposit, setDeposit] = useState(initialData?.paymentOptions?.deposit ?? false);
  const [cash, setCash] = useState(initialData?.paymentOptions?.cash ?? true);

  const [paramMerchantId, setParamMerchantId] = useState(initialData?.paramMerchantId || '');
  const [paramApiKey, setParamApiKey] = useState(initialData?.paramApiKey || '');
  const [paramClientId, setParamClientId] = useState(initialData?.paramClientId || '');

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onSave({
        paymentOptions: { online, deposit, cash },
        paramMerchantId,
        paramApiKey,
        paramClientId
      });
      setIsSaving(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
      <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top">
        <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white">
          <X size={20} />
        </button>
        <h2 className="text-white font-black text-lg italic uppercase tracking-tighter">PARAM ENTEGRASYONU</h2>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="p-2 px-5 rounded-xl bg-[#FFFF00] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
        >
          {isSaving ? '...' : 'KAYDET'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-xl mx-auto w-full space-y-6">
        <div className="bg-gradient-to-r from-yellow-500/10 to-transparent p-5 rounded-3xl border border-yellow-500/20 flex items-start gap-3">
          <AlertCircle size={20} className="text-[#FFFF00] shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-100/80 leading-relaxed font-bold uppercase tracking-wide">
            Param Payment Gateway Entegrasyonu. Seçilen ödeme yöntemlerine göre oyuncular rezervasyon yaparken ilgili ödeme akışına yönlendirilir.
          </p>
        </div>

        {/* 3 Payment Options Switches */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Ödeme Yöntemi Tercihleri</h3>
          
          <div className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-4">
            {/* Online */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h4 className="text-sm font-black text-white italic uppercase tracking-tight">%100 ONLİNE ÖDEME</h4>
                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">Rezervasyon esnasında tüm tutar tahsil edilir</p>
              </div>
              <button 
                onClick={() => setOnline(!online)}
                className={`w-14 h-8 rounded-full relative transition-all duration-300 ${online ? 'bg-[#FFFF00]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-black rounded-full transition-all duration-300 ${online ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            {/* Deposit */}
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <div>
                <h4 className="text-sm font-black text-white italic uppercase tracking-tight">KAPORA İLE ÖDEME</h4>
                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">Yalnızca belirlenen kapora tutarı online alınır</p>
              </div>
              <button 
                onClick={() => setDeposit(!deposit)}
                className={`w-14 h-8 rounded-full relative transition-all duration-300 ${deposit ? 'bg-[#FFFF00]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-black rounded-full transition-all duration-300 ${deposit ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            {/* Cash */}
            <div className="flex items-center justify-between pt-3">
              <div>
                <h4 className="text-sm font-black text-white italic uppercase tracking-tight">SAHADA NAKİT/KART</h4>
                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">Ödeme doğrudan sahada elden tahsil edilir</p>
              </div>
              <button 
                onClick={() => setCash(!cash)}
                className={`w-14 h-8 rounded-full relative transition-all duration-300 ${cash ? 'bg-[#FFFF00]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-black rounded-full transition-all duration-300 ${cash ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Param Credentials Box (Visible if Online or Deposit is true) */}
        {(online || deposit) && (
          <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">PARAM SANAL POS BİLGİLERİ</h3>
            
            <div className="bg-[#161B22] p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Merchant ID (Üye İşyeri No)</label>
                <input 
                  type="text" 
                  value={paramMerchantId}
                  onChange={(e) => setParamMerchantId(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 focus:border-[#FFFF00]/40 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none transition-colors"
                  placeholder="Örn: 104523"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Param API Key</label>
                <input 
                  type="password" 
                  value={paramApiKey}
                  onChange={(e) => setParamApiKey(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 focus:border-[#FFFF00]/40 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none transition-colors"
                  placeholder="••••••••••••••••••••••••••••••••"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Client ID (İstemci No)</label>
                <input 
                  type="text" 
                  value={paramClientId}
                  onChange={(e) => setParamClientId(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 focus:border-[#FFFF00]/40 rounded-xl px-4 py-3 text-white text-sm font-mono outline-none transition-colors"
                  placeholder="Örn: CLI-89472"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const EXTENDED_AMENITIES = [
    'Duş', 'Otopark', 'Kafe', 'WiFi', 'Kamera Kaydı', 'Mescit', 'Krampon Kiralama', 'Büfe',
    'Hakem', 'Kaleci', 'Top Kiralama', 'Forma Kiralama', 'Tribün', 'Engelli Erişimi', 'Kredi Kartı Geçerli',
    'Yapay Çim', 'Doğal Çim', 'Kapalı Saha', 'Açık Saha', 'Isıtma', 'Soğutma', 'Soyunma Odası', 'Kilitli Dolap'
];

const EditFacilityModal: React.FC<{ onClose: () => void; facilityId: string; initialData?: any; onSave: (data: any) => void }> = ({ onClose, facilityId, initialData, onSave }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'amenities' | 'pitches'>('general');
    
    // General Info State
    const [facilityName, setFacilityName] = useState(initialData?.name || 'Arena Sport Center');
    const [description, setDescription] = useState(initialData?.description || 'İstanbulun kalbinde, profesyonel standartlarda halı saha deneyimi. 7/24 açık, güvenli ve konforlu.');
    const [images, setImages] = useState(initialData?.images || PITCHES[0].images);

    // Amenities State
    const [amenities, setAmenities] = useState<string[]>(initialData?.amenities || PITCHES[0].amenities);
    const [customAmenity, setCustomAmenity] = useState('');
    const [availableAmenities, setAvailableAmenities] = useState<string[]>(EXTENDED_AMENITIES);

    // Pitches State
    const [pitches, setPitches] = useState(INTERNAL_PITCHES.map(p => ({
        ...p,
        description: '',
        images: [] as string[],
        isActive: true
    })));
    const [selectedPitchId, setSelectedPitchId] = useState(INTERNAL_PITCHES[0].id);

    const [isSaving, setIsSaving] = useState(false);
    const [draggedItem, setDraggedItem] = useState<{ index: number, pitchId?: string } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ index: number, pitchId?: string } | null>(null);

    // --- Image Handlers ---
    const handleRemoveImage = (index: number, pitchId?: string) => {
        if (pitchId) {
            setPitches(pitches.map(p => p.id === pitchId ? { ...p, images: p.images.filter((_, i) => i !== index) } : p));
        } else {
            setImages(images.filter((_, i) => i !== index));
        }
    };

    const handleAddImage = (pitchId?: string) => {
        const newImg = 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&q=80&w=1000';
        if (pitchId) {
            setPitches(pitches.map(p => p.id === pitchId ? { ...p, images: [...p.images, newImg] } : p));
        } else {
            setImages([...images, newImg]);
        }
    };

    const moveImage = (index: number, direction: 'left' | 'right', pitchId?: string) => {
        const targetArray = pitchId ? pitches.find(p => p.id === pitchId)?.images : images;
        if (!targetArray) return;
        
        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= targetArray.length) return;

        const newArray = [...targetArray];
        const temp = newArray[index];
        newArray[index] = newArray[newIndex];
        newArray[newIndex] = temp;

        if (pitchId) {
            setPitches(pitches.map(p => p.id === pitchId ? { ...p, images: newArray } : p));
        } else {
            setImages(newArray);
        }
    };

    // --- Amenity Handlers ---
    const toggleAmenity = (amenity: string) => {
        if (amenities.includes(amenity)) {
            setAmenities(amenities.filter(a => a !== amenity));
        } else {
            setAmenities([...amenities, amenity]);
        }
    };

    const handleAddCustomAmenity = () => {
        if (customAmenity.trim() && !availableAmenities.includes(customAmenity.trim())) {
            setAvailableAmenities([...availableAmenities, customAmenity.trim()]);
            setAmenities([...amenities, customAmenity.trim()]);
            setCustomAmenity('');
        }
    };

    // --- Pitch Handlers ---
    const updatePitchDescription = (id: string, desc: string) => {
        setPitches(pitches.map(p => p.id === id ? { ...p, description: desc } : p));
    };

    const togglePitchActive = (id: string) => {
        setPitches(pitches.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
    };

    const handleSave = async () => {
        if (!facilityId) return;
        setIsSaving(true);
        try {
            // Mock save
            setTimeout(() => {
                onSave({
                    name: facilityName,
                    description,
                    images,
                    amenities,
                    pitches
                });
                setIsSaving(false);
                onClose();
            }, 1000);
        } catch (error) {
            console.error("Tesis bilgileri kaydedilirken hata:", error);
            setIsSaving(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number, pitchId?: string) => {
        setDraggedItem({ index, pitchId });
        e.dataTransfer.effectAllowed = 'move';
        // Hide the default drag image
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragEnter = (e: React.DragEvent, index: number, pitchId?: string) => {
        e.preventDefault();
        setDragOverItem({ index, pitchId });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, index: number, pitchId?: string) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.pitchId !== pitchId || draggedItem.index === index) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        const targetArray = pitchId ? pitches.find(p => p.id === pitchId)?.images : images;
        if (!targetArray) return;

        const newArray = [...targetArray];
        const draggedImage = newArray[draggedItem.index];
        newArray.splice(draggedItem.index, 1);
        newArray.splice(index, 0, draggedImage);

        if (pitchId) {
            setPitches(pitches.map(p => p.id === pitchId ? { ...p, images: newArray } : p));
        } else {
            setImages(newArray);
        }

        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const renderImageGallery = (imgArray: string[], pitchId?: string) => (
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
            {/* Add Button */}
            <button 
                onClick={() => handleAddImage(pitchId)}
                className="shrink-0 w-32 h-40 bg-[#161B22] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-white/30 transition-all snap-start"
            >
                <ImagePlus size={24} />
                <span className="text-[10px] font-bold">FOTOĞRAF EKLE</span>
            </button>

            {imgArray.map((img, idx) => (
                <div 
                    key={idx} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx, pitchId)}
                    onDragEnter={(e) => handleDragEnter(e, idx, pitchId)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx, pitchId)}
                    onDragEnd={handleDragEnd}
                    className={`shrink-0 w-64 h-40 relative rounded-2xl overflow-hidden group snap-center border transition-all duration-200 ${
                        dragOverItem?.index === idx && dragOverItem?.pitchId === pitchId 
                            ? 'border-[#FFFF00] scale-105 shadow-[0_0_15px_rgba(255,255,0,0.3)]' 
                            : 'border-white/5'
                    } ${draggedItem?.index === idx && draggedItem?.pitchId === pitchId ? 'opacity-50' : 'opacity-100'}`}
                >
                    <img src={img} className="w-full h-full object-cover" alt={`Gallery ${idx}`} />
                    
                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                        <div className="flex justify-between w-full">
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => moveImage(idx, 'left', pitchId)}
                                    disabled={idx === 0}
                                    className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/80 disabled:opacity-30"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button 
                                    onClick={() => moveImage(idx, 'right', pitchId)}
                                    disabled={idx === imgArray.length - 1}
                                    className="p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/80 disabled:opacity-30"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                            <button 
                                onClick={() => handleRemoveImage(idx, pitchId)}
                                className="p-1.5 bg-red-500/80 text-white rounded-lg hover:bg-red-500"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div className="flex justify-center">
                            <div className="bg-black/50 px-2 py-1 rounded text-[10px] font-bold text-white/70 flex items-center gap-1 cursor-grab active:cursor-grabbing">
                                <GripVertical size={12} /> Sürükle Bırak
                            </div>
                        </div>
                    </div>
                    {idx === 0 && !pitchId && <div className="absolute top-2 left-2 bg-[#FFFF00] text-black text-[9px] font-black px-2 py-0.5 rounded shadow-lg">KAPAK FOTOĞRAFI</div>}
                </div>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 bg-[#0A0D14] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                        <X size={20} />
                    </button>
                    <h2 className="text-white font-bold text-lg">Tesis Yönetimi</h2>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => alert("Kullanıcı Önizlemesi (Müşteri ekranında nasıl göründüğünüzü test edin) yakında aktif olacak.")}
                        className="px-4 py-2.5 rounded-xl border border-blue-500/30 text-blue-400 font-bold text-sm flex items-center gap-2 hover:bg-blue-500/10 transition-colors"
                    >
                        <UserCheck size={18} /> ÖNİZLEME
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="px-6 py-2.5 rounded-xl bg-[#FFFF00] text-black font-bold text-sm flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(255,255,0,0.3)]"
                    >
                        {isSaving ? 'KAYDEDİLİYOR...' : <><Save size={18} /> DEĞİŞİKLİKLERİ KAYDET</>}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-[#161B22] px-4">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-[#FFFF00] text-[#FFFF00]' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    Genel Bilgiler
                </button>
                <button 
                    onClick={() => setActiveTab('amenities')}
                    className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'amenities' ? 'border-[#FFFF00] text-[#FFFF00]' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    İmkanlar & Hizmetler
                </button>
                <button 
                    onClick={() => setActiveTab('pitches')}
                    className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'pitches' ? 'border-[#FFFF00] text-[#FFFF00]' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    Saha Detayları
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 max-w-5xl mx-auto w-full">
                
                {/* TAB 1: GENERAL INFO */}
                {activeTab === 'general' && (
                    <div className="space-y-10 animate-in fade-in duration-300">
                        <section>
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-white mb-1">Tesis Fotoğrafları</h3>
                                <p className="text-sm text-gray-400">Tesisinizin genel görünümünü yansıtan fotoğraflar ekleyin. İlk fotoğraf kapak görseli olarak kullanılacaktır.</p>
                            </div>
                            {renderImageGallery(images)}
                        </section>

                        <section className="space-y-6">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-white mb-1">Temel Bilgiler</h3>
                                <p className="text-sm text-gray-400">Müşterilerin tesisinizi bulurken göreceği temel detaylar.</p>
                            </div>
                            <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors shadow-sm">
                                <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Tesis Adı</label>
                                <input 
                                    type="text" 
                                    value={facilityName}
                                    onChange={(e) => setFacilityName(e.target.value)}
                                    className="w-full bg-transparent text-white font-bold text-lg outline-none placeholder:text-gray-600"
                                    placeholder="Örn: Arena Sport Center"
                                />
                            </div>
                            <div className="bg-[#161B22] p-5 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors shadow-sm">
                                <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Hakkımızda / Açıklama</label>
                                <textarea 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={5}
                                    className="w-full bg-transparent text-base text-gray-300 outline-none resize-none leading-relaxed placeholder:text-gray-600"
                                    placeholder="Tesisinizi öne çıkaran özellikleri, konum avantajlarını ve genel atmosferi anlatın..."
                                />
                            </div>
                        </section>
                    </div>
                )}

                {/* TAB 2: AMENITIES */}
                {activeTab === 'amenities' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-1">Tesis İmkanları</h3>
                            <p className="text-sm text-gray-400">Müşterilerinize sunduğunuz tüm hizmetleri ve olanakları seçin. Ne kadar çok imkan sunarsanız, o kadar çok tercih edilirsiniz.</p>
                        </div>
                        
                        <div className="bg-[#161B22] p-6 rounded-3xl border border-white/5">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {availableAmenities.map((item) => {
                                    const isSelected = amenities.includes(item);
                                    return (
                                        <button
                                            key={item}
                                            onClick={() => toggleAmenity(item)}
                                            className={`p-4 rounded-2xl flex items-center justify-between text-sm font-bold transition-all border ${
                                                isSelected 
                                                ? 'bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]' 
                                                : 'bg-black/20 text-gray-400 border-white/5 hover:bg-white/5 hover:text-gray-200'
                                            }`}
                                        >
                                            {item}
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${isSelected ? 'bg-green-500 border-green-500 text-black' : 'border-gray-600'}`}>
                                                {isSelected && <Check size={12} strokeWidth={3} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-8 pt-8 border-t border-white/5">
                                <h4 className="text-sm font-bold text-white mb-4">Listede Olmayan Bir İmkan Ekle</h4>
                                <div className="flex gap-3">
                                    <input 
                                        type="text" 
                                        value={customAmenity}
                                        onChange={(e) => setCustomAmenity(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomAmenity()}
                                        placeholder="Örn: VIP Loca, Ücretsiz Çay..."
                                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-white/30 transition-colors"
                                    />
                                    <button 
                                        onClick={handleAddCustomAmenity}
                                        disabled={!customAmenity.trim()}
                                        className="px-6 py-3 bg-white/10 text-white font-bold text-sm rounded-xl hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <Plus size={18} /> EKLE
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: PITCHES */}
                {activeTab === 'pitches' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-1">Saha Detayları</h3>
                            <p className="text-sm text-gray-400">Tesisinizdeki her bir saha için özel fotoğraflar ve açıklamalar ekleyerek müşterilerinize daha net bilgi verin.</p>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {pitches.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPitchId(p.id)}
                                    className={`px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                        selectedPitchId === p.id 
                                        ? 'bg-[#FFFF00] text-black shadow-[0_0_10px_rgba(255,255,0,0.2)]' 
                                        : 'bg-[#161B22] text-gray-400 hover:bg-white/5 border border-white/5'
                                    }`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>

                        {pitches.map(pitch => pitch.id === selectedPitchId && (
                            <div key={pitch.id} className="bg-[#161B22] p-6 rounded-3xl border border-white/5 space-y-8 animate-in fade-in">
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                            <ImageIcon size={20} className="text-blue-400" /> 
                                            {pitch.name} Fotoğrafları
                                        </h4>
                                        <div className="flex items-center gap-3 bg-black/30 p-2 pr-4 rounded-full border border-white/5">
                                            <button 
                                                onClick={() => togglePitchActive(pitch.id)}
                                                className={`w-12 h-6 rounded-full relative transition-all duration-300 ${pitch.isActive ? 'bg-emerald-500' : 'bg-red-500/50'}`}
                                            >
                                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 ${pitch.isActive ? 'right-0.5' : 'left-0.5'}`} />
                                            </button>
                                            <span className={`text-xs font-black uppercase tracking-wider ${pitch.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pitch.isActive ? 'Saha Aktif' : 'Bakımda (Gizli)'}
                                            </span>
                                        </div>
                                    </div>
                                    {renderImageGallery(pitch.images, pitch.id)}
                                </div>

                                <div>
                                    <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <Type size={20} className="text-yellow-400" /> 
                                        {pitch.name} Açıklaması
                                    </h4>
                                    <div className="bg-black/30 p-5 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors">
                                        <textarea 
                                            value={pitch.description}
                                            onChange={(e) => updatePitchDescription(pitch.id, e.target.value)}
                                            rows={4}
                                            className="w-full bg-transparent text-sm text-gray-300 outline-none resize-none leading-relaxed placeholder:text-gray-600"
                                            placeholder={`${pitch.name} için özel detaylar (örn: Yeni zemin, kapalı saha, tribün kapasitesi vs.)`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const FinancialCalendarView: React.FC<{ facilityId: string; pricingPolicy?: any[] }> = ({ facilityId, pricingPolicy }) => {
    const [selectedDate, setSelectedDate] = useState(0);
    const [selectedMonthlyDay, setSelectedMonthlyDay] = useState(24);
    const [selectedPitchId, setSelectedPitchId] = useState(INTERNAL_PITCHES[0].id);
    const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
    const [isQuickCreateOpen, setIsQuickCreateOpen] = useState<string | null>(null);
    const [repriceModalOpen, setRepriceModalOpen] = useState<string | null>(null);
    const [customPrice, setCustomPrice] = useState('2000');
    const [specialRates, setSpecialRates] = useState<Record<string, number>>({});
    const [isMonthlyView, setIsMonthlyView] = useState(false);
    const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
    const [realTimeSlots, setRealTimeSlots] = useState<any[]>([]);
    const [isAddingSlot, setIsAddingSlot] = useState(false);

    // New states for reservation creation
    const [bookings, setBookings] = useState<CalendarBooking[]>(CALENDAR_BOOKINGS);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PARTIAL' | 'PENDING'>('PENDING');
    const [isRecurringPrice, setIsRecurringPrice] = useState(false);

    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const timeSlots = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}.00`);

    // Mock slots
    useEffect(() => {
        setRealTimeSlots([]);
    }, [facilityId]);

    const currentBookings = useMemo(() => {
        return bookings.filter(b => {
            const pitchMatch = b.pitchId === selectedPitchId;
            const dateMatch = b.date ? b.date === (24 + selectedDate).toString() : true; // Mock date matching
            return pitchMatch && dateMatch;
        });
    }, [bookings, selectedPitchId, selectedDate]);
    
    // Combine mock bookings with real slots (for visualization)
    const displaySlots = useMemo(() => {
        const combined = [...currentBookings];
        
        // Add real slots that are not already in bookings
        realTimeSlots.forEach(slot => {
            const timeFormatted = slot.time.replace(':', '.');
            if (!combined.find(b => b.time === timeFormatted)) {
                // This is a free slot in our mock logic, but it exists in Firestore
            }
        });
        
        return combined;
    }, [currentBookings, realTimeSlots]);

    const dailyCollected = currentBookings.reduce((acc, curr) => acc + curr.paid, 0);
    const dailyTotal = currentBookings.reduce((acc, curr) => acc + curr.price, 0);
    const dailyPending = dailyTotal - dailyCollected;
    const occupancyRate = Math.round((currentBookings.length / timeSlots.length) * 100);

    const getBooking = (time: string) => currentBookings.find(b => b.time === time || b.time === time.replace('.', ':'));
    const getRealSlot = (time: string) => realTimeSlots.find(s => s.time === time.replace('.', ':'));

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

    const handleSavePrice = () => {
        if (repriceModalOpen) {
            setSpecialRates(prev => ({
                ...prev,
                [repriceModalOpen]: parseInt(customPrice)
            }));
            setRepriceModalOpen(null);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0A0E14] relative">
            <div className="sticky top-0 z-20 bg-[#0A0E14] border-b border-white/10 shadow-2xl">
                <div className="grid grid-cols-3 gap-2 p-4 pb-2 border-b border-white/5 bg-[#161B22]">
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
                                <span className="text-sm font-bold">{24 + i}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex bg-[#161B22] p-1 rounded-xl">
                            {INTERNAL_PITCHES.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPitchId(p.id)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectedPitchId === p.id ? 'bg-[#2D3748] text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => setIsMonthlyView(!isMonthlyView)}
                            className={`h-full px-3 border rounded-xl transition-colors flex items-center justify-center gap-2 ${isMonthlyView ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <CalendarDays size={20} />
                            {isMonthlyView && <span className="text-[10px] font-black uppercase">Aylık</span>}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-2 pb-32">
                {isMonthlyView ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-[#161B22] rounded-3xl border border-white/10 p-6 mb-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white italic">MART 2024</h3>
                                <button 
                                    onClick={() => setIsSubscriptionModalOpen(true)}
                                    className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/20"
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
                                    const isToday = day === 24;
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
                            {[
                                { id: 's1', user: 'Vadi Gücü FC', day: 'Pazartesi', time: '21.00', pitch: 'Saha 1' },
                                { id: 's2', user: 'Kaplanlar', day: 'Çarşamba', time: '19.00', pitch: 'Saha 2' }
                            ].map(sub => (
                                <div key={sub.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex justify-between items-center group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                            <RefreshCw size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-white">{sub.user}</p>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase">{sub.day} • {sub.time} • {sub.pitch}</p>
                                        </div>
                                    </div>
                                    <button className="p-2 text-gray-600 hover:text-white transition-colors">
                                        <MoreHorizontal size={20} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    timeSlots.map((time, idx) => {
                        const booking = getBooking(time);
                        const isSub = booking?.type === 'SUB';
                        const subStyles = { bg: 'bg-blue-900/30', border: 'border-blue-500/50', text: 'text-blue-400', bar: 'bg-blue-500' };
                        const styles = booking ? (isSub ? subStyles : getStatusStyles(booking.status)) : null;
                        
                        const hour = parseInt(time.split('.')[0]);
                        let defaultPrice = 2000;
                        
                        if (pricingPolicy && pricingPolicy.length > 0) {
                            const matchedPolicy = pricingPolicy.find(p => {
                                const startH = parseInt(p.startTime.split(':')[0]);
                                let endH = parseInt(p.endTime.split(':')[0]);
                                if (endH === 0) endH = 24;
                                
                                if (startH <= endH) {
                                    return hour >= startH && hour < endH;
                                } else {
                                    return hour >= startH || hour < endH;
                                }
                            });
                            if (matchedPolicy) defaultPrice = matchedPolicy.price;
                        } else {
                            if (hour >= 18 && hour < 23) defaultPrice = 3200;
                            else if (hour >= 13 && hour < 16) defaultPrice = 2000;
                        }
                        
                        const currentPrice = specialRates[time] || defaultPrice;
                        
                        // Override booking price if present to reflect the policy
                        if (booking && defaultPrice) {
                            booking.price = defaultPrice;
                        }
                        const nextTime = `${(parseInt(time.split('.')[0]) + 1).toString().padStart(2, '0')}.00`;
                        
                        return (
                            <div key={time} className="flex gap-4 group">
                                <div className="w-20 pt-4 flex flex-col items-center">
                                    <span className={`text-[11px] font-mono font-black tracking-tighter ${booking ? 'text-white' : 'text-gray-600'}`}>
                                        {time} - {nextTime}
                                    </span>
                                </div>

                            <div className="flex-1">
                                {booking ? (
                                    <button 
                                        onClick={() => setSelectedBooking(booking)}
                                        className={`w-full relative overflow-hidden rounded-xl border ${styles?.bg} ${styles?.border} transition-all active:scale-[0.98] text-left`}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${styles?.bar}`}></div>
                                        <div className="p-3 pl-5 flex justify-between items-center">
                                            <div>
                                                <p className="text-sm font-bold text-white leading-tight">{booking.user}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${styles?.text} bg-black/20`}>
                                                        {booking.status === 'PAID' ? 'ÖDENDİ' : 'BEKLEYEN'}
                                                    </span>
                                                    {booking.note && <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{booking.note}</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-white font-mono">{booking.price}₺</p>
                                            </div>
                                        </div>
                                    </button>
                                ) : (
                                    <div className="flex gap-2 h-16 w-full">
                                        <button 
                                            onClick={() => handleQuickCreate(time)}
                                            disabled={isAddingSlot || getRealSlot(time) !== undefined}
                                            className={`flex-1 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 relative overflow-hidden ${
                                                getRealSlot(time) 
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                                : 'border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 text-gray-600 hover:text-emerald-400 group/add'
                                            }`}
                                        >
                                            <div className="relative z-10 flex flex-col items-center">
                                                <div className="flex items-center gap-1">
                                                    {getRealSlot(time) ? <CheckCircle2 size={16} /> : <Plus size={16} className="group-hover/add:scale-110 transition-transform" />}
                                                    <span className="text-xs font-bold uppercase tracking-wider">
                                                        {getRealSlot(time) ? 'YAYINDA' : 'BOŞ'}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-gray-500 font-mono mt-0.5">{currentPrice}₺</span>
                                            </div>
                                        </button>

                                        <button 
                                            onClick={() => { setRepriceModalOpen(time); setCustomPrice(currentPrice.toString()); }}
                                            className={`w-20 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 transition-all ${
                                                currentPrice > 2000 
                                                ? 'bg-yellow-900/20 text-yellow-500 border-yellow-500/30 hover:bg-yellow-900/40' 
                                                : currentPrice < 2000
                                                ? 'bg-green-900/20 text-green-500 border-green-500/30 hover:bg-green-900/40'
                                                : 'bg-[#161B22] text-gray-500 hover:text-white'
                                            }`}
                                        >
                                            {currentPrice > 2000 ? <Flame size={14} /> : currentPrice < 2000 ? <Percent size={14} /> : <Tag size={14} />}
                                            <span className="text-[10px] font-bold">{currentPrice}₺</span>
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
                            <p className="text-sm font-bold text-gray-400 mt-2">Tutar: {specialRates[isQuickCreateOpen] || 2000}₺</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="bg-[#0A0E14] flex flex-col px-4 py-3 rounded-xl border border-white/10 focus-within:border-[#FFFF00] transition-colors gap-3">
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
                            onClick={() => {
                                if (!isQuickCreateOpen) return;
                                const rateVal = specialRates[isQuickCreateOpen] || 2000;
                                const newBooking: CalendarBooking = {
                                    id: `new-${Date.now()}`,
                                    pitchId: selectedPitchId,
                                    time: isQuickCreateOpen,
                                    date: (24 + selectedDate).toString(), // Store the selected date
                                    duration: 1,
                                    user: customerName.trim() || 'Misafir Oyuncu',
                                    status: paymentStatus,
                                    price: rateVal,
                                    paid: paymentStatus === 'PAID' ? rateVal : paymentStatus === 'PARTIAL' ? Math.floor(rateVal * 0.25) : 0,
                                    type: 'DAILY',
                                    note: customerPhone ? `Tel: ${customerPhone}` : (paymentStatus === 'PARTIAL' ? 'Kapora Alındı' : paymentStatus === 'PAID' ? 'Tam Ödendi' : 'Ödeme Bekliyor')
                                };
                                setBookings(prev => [...prev, newBooking]);
                                setIsQuickCreateOpen(null);
                                setCustomerName('');
                                setCustomerPhone('');
                                setPaymentStatus('PENDING');
                            }}
                            className="w-full py-4 bg-[#FFFF00] text-black font-black text-lg rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all"
                        >
                            KAYDET
                        </button>
                    </div>
                </div>
            )}

            {/* Reprice Modal (Activated) */}
            {repriceModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] border-t border-white/10 p-6 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-black text-white">Fiyatlandırma</h3>
                                <p className="text-xs text-gray-400 mt-1">{repriceModalOpen} • Saatlik Ücret</p>
                            </div>
                            <button onClick={() => setRepriceModalOpen(null)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="bg-[#0A0E14] p-6 rounded-3xl border border-white/10 mb-6 text-center">
                            <label className="text-xs text-gray-500 font-bold uppercase mb-2 block">Yeni Fiyat</label>
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-2xl font-black text-gray-500">₺</span>
                                <input 
                                    type="number" 
                                    value={customPrice}
                                    onChange={(e) => setCustomPrice(e.target.value)}
                                    className="bg-transparent text-5xl font-black text-white outline-none w-40 text-center border-b border-white/20 focus:border-[#FFFF00] transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <button 
                                onClick={() => setCustomPrice('2400')}
                                className="py-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl text-xs font-bold hover:bg-yellow-500 hover:text-black transition-colors flex flex-col items-center gap-1"
                            >
                                <Zap size={14} /> Prime Time
                            </button>
                            <button 
                                onClick={() => setCustomPrice('1600')}
                                className="py-3 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl text-xs font-bold hover:bg-green-500 hover:text-white transition-colors flex flex-col items-center gap-1"
                            >
                                <Percent size={14} /> İndirimli
                            </button>
                            <button 
                                onClick={() => setCustomPrice('2000')}
                                className="py-3 bg-gray-800 border border-white/10 text-gray-400 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-colors flex flex-col items-center gap-1"
                            >
                                <RefreshCw size={14} /> Standart
                            </button>
                        </div>

                        <div className="flex items-center justify-between bg-[#0A0E14] p-4 rounded-2xl border border-white/5 mb-6">
                            <div>
                                <p className="text-xs font-black text-white uppercase tracking-wide">DÜZENLİ FİYAT YAP</p>
                                <p className="text-[9px] text-gray-500 font-bold mt-1">Sadece bu güne mi, her haftaya mı özel?</p>
                            </div>
                            <button 
                                onClick={() => setIsRecurringPrice(!isRecurringPrice)}
                                className={`w-12 h-6 rounded-full relative transition-all duration-300 ${isRecurringPrice ? 'bg-[#FFFF00]' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-0.5 w-5 h-5 bg-black rounded-full transition-all duration-300 ${isRecurringPrice ? 'right-0.5' : 'left-0.5'}`} />
                            </button>
                        </div>

                        <button 
                            onClick={handleSavePrice}
                            className="w-full py-4 bg-white text-black font-black text-lg rounded-2xl hover:bg-gray-200 active:scale-95 transition-all"
                        >
                            GÜNCELLE
                        </button>
                    </div>
                </div>
            )}

            {/* Subscription Modal */}
            {isSubscriptionModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-white italic tracking-tight">YENİ ABONMAN</h3>
                            <button onClick={() => setIsSubscriptionModalOpen(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">MÜŞTERİ BİLGİSİ</label>
                                <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
                                    <User size={20} className="text-gray-500" />
                                    <input type="text" placeholder="Ad Soyad / Takım Adı" className="bg-transparent w-full outline-none text-white font-bold" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">GÜN</label>
                                    <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                                        <select className="bg-transparent w-full outline-none text-white font-bold appearance-none">
                                            {days.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">SAAT</label>
                                    <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                                        <select className="bg-transparent w-full outline-none text-white font-bold appearance-none">
                                            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">SÜRE (AY)</label>
                                <div className="flex gap-2">
                                    {[1, 3, 6, 12].map(m => (
                                        <button key={m} className="flex-1 py-3 bg-[#0A0E14] border border-white/5 rounded-xl text-xs font-bold hover:border-blue-500 transition-colors">
                                            {m} Ay
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={() => setIsSubscriptionModalOpen(false)}
                                className="w-full h-16 bg-blue-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-900/20 hover:bg-blue-500 transition-all mt-4"
                            >
                                ABONMANI OLUŞTUR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const TeamView = () => {
    const [teamTab, setTeamTab] = useState<'TASKS' | 'STAFF'>('TASKS');
    const [tasks, setTasks] = useState(TEAM_TASKS);
    const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);

    const toggleTask = (id: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' } : t));
    };

    const onDutyStaff = STAFF_MEMBERS.filter(s => s.status === 'ON_DUTY');

    return (
        <div className="p-6 pb-32 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
            
            {/* Shift Summary - Mission Control Style */}
            <div className="relative group mb-8">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[32px] opacity-20 blur transition duration-1000"></div>
                <div className="relative bg-[#161B22] border border-white/10 rounded-[32px] p-6 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <Users size={120} className="text-indigo-500" />
                    </div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">OPERASYON MERKEZİ</p>
                                <h2 className="text-3xl font-black text-white italic tracking-tight">EKİP DURUMU</h2>
                            </div>
                            <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></span>
                                <span className="text-[10px] font-black text-green-400 uppercase">TESİS AKTİF</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className="flex -space-x-4">
                                {onDutyStaff.map(s => (
                                    <div key={s.id} className="relative group/avatar">
                                        <img 
                                            src={s.avatar} 
                                            className="w-14 h-14 rounded-2xl border-4 border-[#161B22] object-cover shadow-xl transition-transform group-hover/avatar:-translate-y-1" 
                                            alt={s.name} 
                                        />
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#161B22]"></div>
                                    </div>
                                ))}
                                <button className="w-14 h-14 rounded-2xl border-4 border-[#161B22] bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10 transition-colors">
                                    <Plus size={20} />
                                </button>
                            </div>
                            <div className="h-10 w-px bg-white/10"></div>
                            <div>
                                <p className="text-xl font-black text-white">{onDutyStaff.length} Personel</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Şu an görevde</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs - Cyberpunk Style */}
            <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-8 border border-white/5 shadow-inner">
                <button 
                    onClick={() => setTeamTab('TASKS')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        teamTab === 'TASKS' 
                        ? 'bg-indigo-500/10 text-indigo-400 shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <ClipboardList size={16} /> Görevler
                </button>
                <button 
                    onClick={() => setTeamTab('STAFF')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        teamTab === 'STAFF' 
                        ? 'bg-purple-500/10 text-purple-400 shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Users size={16} /> Personel
                </button>
            </div>

            {/* Content Area */}
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {teamTab === 'TASKS' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center px-2">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">GÜNLÜK OPERASYON</h3>
                            <button 
                                onClick={() => setIsAddTaskModalOpen(true)}
                                className="text-[10px] bg-indigo-500 text-white font-black px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
                            >
                                <Plus size={14} /> YENİ GÖREV
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4">
                            {tasks.map(task => (
                                <div 
                                    key={task.id}
                                    className={`relative group bg-[#161B22] p-5 rounded-[28px] border transition-all ${
                                        task.status === 'COMPLETED' 
                                        ? 'border-emerald-500/20 opacity-60' 
                                        : 'border-white/5 hover:border-indigo-500/40 shadow-xl'
                                    }`}
                                >
                                    <div className="flex items-start gap-4">
                                        <button 
                                            onClick={() => toggleTask(task.id)}
                                            className={`mt-1 w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${
                                                task.status === 'COMPLETED' 
                                                ? 'bg-emerald-500 border-emerald-500 rotate-[360deg]' 
                                                : 'border-gray-700 bg-transparent hover:border-indigo-500'
                                            }`}
                                        >
                                            {task.status === 'COMPLETED' && <Check size={18} className="text-black" />}
                                        </button>
                                        
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className={`font-black text-base leading-tight ${task.status === 'COMPLETED' ? 'text-emerald-400/70 line-through' : 'text-white'}`}>
                                                    {task.title}
                                                </h4>
                                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                                                    task.priority === 'HIGH' 
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                                    : task.priority === 'MEDIUM'
                                                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                                    : 'bg-gray-800 text-gray-500'
                                                }`}>
                                                    {task.priority}
                                                </span>
                                            </div>
                                            
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold">
                                                    <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
                                                        <User size={10} />
                                                    </div>
                                                    {task.assignedTo}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold">
                                                    <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
                                                        <Clock size={10} />
                                                    </div>
                                                    {task.time}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <button className="p-2 text-gray-600 hover:text-white transition-colors">
                                            <MoreHorizontal size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {teamTab === 'STAFF' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center px-2">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">EKİP ÜYELERİ</h3>
                            <button className="text-[10px] bg-purple-500 text-white font-black px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-purple-400 transition-all shadow-lg shadow-purple-900/20 active:scale-95">
                                <Plus size={14} /> DAVET ET
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4">
                            {STAFF_MEMBERS.map(member => (
                                <div key={member.id} className="bg-[#161B22] p-5 rounded-[32px] border border-white/5 hover:border-purple-500/30 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                        <Shield size={64} className="text-purple-500" />
                                    </div>
                                    
                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img 
                                                    src={member.avatar} 
                                                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/5 shadow-lg" 
                                                    alt={member.name} 
                                                />
                                                <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-[#161B22] ${member.status === 'ON_DUTY' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-white text-lg tracking-tight">{member.name}</h4>
                                                <p className="text-[10px] text-purple-400 font-black uppercase tracking-[0.1em] mt-0.5">{member.role}</p>
                                                
                                                {/* Performance Indicator - Mock */}
                                                <div className="flex items-center gap-3 mt-3">
                                                    <div className="flex items-center gap-1">
                                                        <Star size={10} className="text-yellow-500 fill-yellow-500" />
                                                        <span className="text-[10px] font-black text-white">4.9</span>
                                                    </div>
                                                    <div className="h-1 w-20 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '85%' }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col gap-2">
                                            <button className="w-10 h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center hover:bg-green-500/10 hover:text-green-400 transition-all border border-white/5">
                                                <MessageSquare size={18} />
                                            </button>
                                            <button className="w-10 h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center hover:bg-purple-500 hover:text-white transition-all border border-white/5">
                                                <Phone size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* Add Task Modal - Mock Implementation */}
            {isAddTaskModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-white italic tracking-tight">YENİ GÖREV</h3>
                            <button onClick={() => setIsAddTaskModalOpen(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">GÖREV BAŞLIĞI</label>
                                <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
                                    <ClipboardList size={20} className="text-gray-500" />
                                    <input type="text" placeholder="Örn: Saha 2 File Kontrolü" className="bg-transparent w-full outline-none text-white font-bold" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">SORUMLU</label>
                                    <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                                        <select className="bg-transparent w-full outline-none text-white font-bold appearance-none">
                                            {STAFF_MEMBERS.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">ÖNCELİK</label>
                                    <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl">
                                        <select className="bg-transparent w-full outline-none text-white font-bold appearance-none">
                                            <option value="HIGH">YÜKSEK</option>
                                            <option value="MEDIUM">ORTA</option>
                                            <option value="LOW">DÜŞÜK</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setIsAddTaskModalOpen(false)}
                                className="w-full h-16 bg-indigo-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-900/20 hover:bg-indigo-500 transition-all mt-4"
                            >
                                GÖREVİ OLUŞTUR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FinanceView: React.FC<{ hasDebt: boolean; isPayingDebt: boolean; onPayDebt: () => void }> = ({ hasDebt, isPayingDebt, onPayDebt }) => {
    const [financeTab, setFinanceTab] = useState<'INCOME' | 'EXPENSE' | 'DATA'>('INCOME');
    const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
    const [expenses, setExpenses] = useState(EXPENSES);
    const [expenseDistribution, setExpenseDistribution] = useState(EXPENSE_DISTRIBUTION);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    const [newExpense, setNewExpense] = useState({ title: '', amount: '', category: 'Diğer' });

    const totalIncome = 13600;
    const totalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const netProfit = totalIncome - totalExpense;

    const handleAddExpense = () => {
        if (!newExpense.title || !newExpense.amount) return;

        const amount = parseFloat(newExpense.amount);
        const expense = {
            id: `e${Date.now()}`,
            title: newExpense.title,
            date: 'Bugün',
            amount: amount,
            category: newExpense.category
        };

        setExpenses([expense, ...expenses]);

        // Update distribution
        setExpenseDistribution(prev => prev.map(item => {
            // Map 'Fatura' to 'Elektrik' or similar if needed, but let's try to match categories
            // The distribution has: Elektrik, Personel, Bakım, Diğer
            // If the category matches exactly or is a sub-type
            if (item.name === newExpense.category) {
                return { ...item, value: item.value + amount };
            }
            return item;
        }));

        setNewExpense({ title: '', amount: '', category: 'Diğer' });
        setIsAddExpenseModalOpen(false);
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#161B22] border border-white/20 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                    <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{label}</p>
                    <p className="text-sm font-black text-white">{payload[0].value.toLocaleString()}₺</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="p-6 pb-32 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
            {/* Main Stats Card - Cyberpunk Style */}
            <div className="relative group cursor-pointer mb-6" onClick={() => setFinanceTab('DATA')}>
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00F5FF] via-[#FF00FF] to-[#FFFF00] rounded-[32px] opacity-20 group-hover:opacity-40 blur transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-[#161B22] border border-white/10 rounded-[32px] p-6 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <Activity size={120} className="text-[#00F5FF]" />
                    </div>
                    
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-[#00F5FF] uppercase tracking-[0.2em] mb-1">NET KAZANÇ (AYLIK)</p>
                            <h2 className={`text-4xl font-black ${netProfit >= 0 ? 'text-white' : 'text-red-400'} tracking-tight flex items-baseline gap-2`}>
                                {netProfit.toLocaleString()}₺
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <TrendingUp size={12} /> %14
                                </span>
                            </h2>
                        </div>
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/10 group-hover:border-[#00F5FF]/50 transition-colors">
                            <TrendingUp size={24} className="text-[#00F5FF]" />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-8 relative z-10">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-[#00FF00]/30 transition-all">
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-black uppercase mb-1">
                                <div className="w-2 h-2 bg-[#00FF00] rounded-full shadow-[0_0_8px_#00FF00]"></div> Toplam Gelir
                            </div>
                            <p className="text-xl font-black text-white">{totalIncome.toLocaleString()}₺</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-[#FF00FF]/30 transition-all">
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-black uppercase mb-1">
                                <div className="w-2 h-2 bg-[#FF00FF] rounded-full shadow-[0_0_8px_#FF00FF]"></div> Toplam Gider
                            </div>
                            <p className="text-xl font-black text-white">{totalExpense.toLocaleString()}₺</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-8 border border-white/5 shadow-inner">
                {[
                    { id: 'INCOME', label: 'Akış', color: 'text-[#00F5FF]', bg: 'bg-[#00F5FF]/10' },
                    { id: 'EXPENSE', label: 'Giderler', color: 'text-[#FF00FF]', bg: 'bg-[#FF00FF]/10' },
                    { id: 'DATA', label: 'Veriler', color: 'text-[#00FF00]', bg: 'bg-[#00FF00]/10' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setFinanceTab(tab.id as any)} 
                        className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                            financeTab === tab.id 
                            ? `${tab.bg} ${tab.color} shadow-lg scale-[1.02]` 
                            : 'text-gray-500 hover:text-white'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {financeTab === 'DATA' && (
                    <div className="space-y-6">
                        {/* Weekly Revenue Bar Chart */}
                        <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 shadow-xl h-80">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <TrendingUp size={16} className="text-[#00F5FF]" /> HAFTALIK GELİR TRENDİ
                            </h3>
                            <div className="h-48 w-full flex items-end justify-between px-2 gap-3">
                                {WEEKLY_REVENUE_DATA.map((item, idx) => {
                                    const maxVal = 30000;
                                    const pct = (item.revenue / maxVal) * 100;
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                                            <div className="relative w-full flex flex-col justify-end h-full">
                                                {/* Tooltip */}
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10 shadow-lg">
                                                    {item.revenue.toLocaleString()}₺
                                                </div>
                                                {/* Bar */}
                                                <div 
                                                    className="w-full rounded-t-xl transition-all duration-1000 ease-out cursor-pointer hover:brightness-125 animate-in fade-in slide-in-from-bottom-4"
                                                    style={{ 
                                                        height: `${pct}%`, 
                                                        background: 'linear-gradient(to top, #005080 0%, #00F5FF 100%)',
                                                        boxShadow: '0 0 15px rgba(0, 245, 255, 0.2)'
                                                    }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{item.day}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Two Column Charts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Expense Distribution Donut */}
                            <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 shadow-xl">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <PieChartIcon size={16} className="text-[#FF00FF]" /> GİDER DAĞILIMI
                                </h3>
                                <div className="h-48 w-full relative flex items-center justify-center">
                                    <div className="relative w-40 h-40">
                                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                                            {expenseDistribution.map((entry, index) => {
                                                const total = expenseDistribution.reduce((sum, e) => sum + e.value, 0);
                                                const prevTotal = expenseDistribution.slice(0, index).reduce((sum, e) => sum + e.value, 0);
                                                const percentage = (entry.value / total) * 100;
                                                const prevPercentage = (prevTotal / total) * 100;
                                                const dashArray = `${percentage} ${100 - percentage}`;
                                                const dashOffset = -prevPercentage;
                                                
                                                return (
                                                    <circle
                                                        key={index}
                                                        cx="50"
                                                        cy="50"
                                                        r="40"
                                                        fill="transparent"
                                                        stroke={entry.color}
                                                        strokeWidth="15"
                                                        strokeDasharray={dashArray}
                                                        strokeDashoffset={dashOffset}
                                                        className="transition-all duration-1000 ease-out hover:stroke-width-20 cursor-pointer"
                                                    />
                                                );
                                            })}
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-[#161B22] rounded-full m-8 border border-white/5 shadow-inner">
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[10px] font-black text-gray-500 uppercase">Toplam</span>
                                        <span className="text-lg font-black text-white">{totalExpense.toLocaleString()}₺</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    {expenseDistribution.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                                            <span className="text-[10px] font-bold text-gray-400">{item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Subscription Ratio */}
                            <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 shadow-xl">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Users size={16} className="text-[#FFFF00]" /> ABONE / NORMAL ORANI
                                </h3>
                                <div className="space-y-6">
                                    {SUBSCRIPTION_RATIO.map((item, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-black text-white uppercase">{item.name}</span>
                                                <span className="text-sm font-black" style={{ color: item.color }}>%{item.value}</span>
                                            </div>
                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full rounded-full transition-all duration-1000 ease-out"
                                                    style={{ width: `${item.value}%`, backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                                        * Abonman gelirleri tesisin nakit akışını stabilize ederken, normal müşteriler kârlılığı artırır.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Peak Hours Heatmap */}
                        <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 shadow-xl overflow-hidden">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Flame size={16} className="text-orange-500" /> YOĞUNLUK ISI HARİTASI
                            </h3>
                            <div className="flex gap-1 h-24 items-end">
                                {HEATMAP_DATA.map((item, idx) => (
                                    <div 
                                        key={idx} 
                                        className="flex-1 rounded-t-sm group relative"
                                        style={{ 
                                            height: `${item.intensity}%`, 
                                            backgroundColor: item.intensity > 80 ? '#FF4444' : item.intensity > 50 ? '#FFAA00' : '#44FF44',
                                            opacity: 0.3 + (item.intensity / 100) * 0.7
                                        }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            %{item.intensity}
                                        </div>
                                        {idx % 3 === 0 && (
                                            <span className="absolute -bottom-5 left-0 text-[8px] font-black text-gray-600">{item.hour}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {financeTab === 'INCOME' && (
                    <div className="space-y-6">
                        {/* Payment Methods Section */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-2">ÖDEME YÖNTEMLERİ</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {PAYMENT_METHODS.map(method => (
                                    <div key={method.id} className="space-y-2">
                                        <button 
                                            onClick={() => setSelectedPayment(selectedPayment === method.id ? null : method.id)}
                                            className={`w-full bg-[#161B22] p-4 rounded-2xl border transition-all flex items-center justify-between group ${selectedPayment === method.id ? 'border-[#00F5FF] bg-[#00F5FF]/5' : 'border-white/5 hover:border-white/10'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${selectedPayment === method.id ? 'bg-[#00F5FF] text-black' : 'bg-white/5 text-gray-400 group-hover:text-white'}`}>
                                                    {method.icon}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-black text-white">{method.name}</p>
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase">{method.count} İşlem</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-4">
                                                <div>
                                                    <p className="text-lg font-black text-white">{method.amount.toLocaleString()}₺</p>
                                                    <p className="text-[10px] text-[#00F5FF] font-black uppercase">Detay Gör</p>
                                                </div>
                                                <ChevronDown size={20} className={`text-gray-600 transition-transform duration-300 ${selectedPayment === method.id ? 'rotate-180 text-[#00F5FF]' : ''}`} />
                                            </div>
                                        </button>
                                        
                                        {selectedPayment === method.id && (
                                            <div className="bg-[#0A0E14] border border-[#00F5FF]/20 p-4 rounded-2xl mx-2 animate-in slide-in-from-top-2 duration-300">
                                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                                    <span className="text-[#00F5FF] font-black uppercase mr-2">Bilgi:</span>
                                                    {method.details}
                                                </p>
                                                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-500 uppercase">Ortalama İşlem</span>
                                                    <span className="text-sm font-black text-white">{(method.amount / method.count).toFixed(0)}₺</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Transactions */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-2">SON İŞLEMLER</h3>
                            {OWNER_TRANSACTIONS.map(tx => (
                                <div key={tx.id} className="bg-[#161B22] p-5 rounded-3xl border border-white/5 flex justify-between items-center hover:bg-white/5 transition-all group">
                                    <div className="flex items-center gap-4">
                                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${tx.type === 'BOOKING' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                                             {tx.type === 'BOOKING' ? <Calendar size={20} /> : <DollarSign size={20} />}
                                         </div>
                                         <div>
                                             <p className="text-sm font-black text-white">{tx.user}</p>
                                             <p className="text-[10px] text-gray-500 font-bold uppercase">{tx.date} • {tx.type === 'BOOKING' ? 'Saha Rez.' : 'Kafeterya'}</p>
                                         </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-base font-black text-white">+{tx.amount}₺</p>
                                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-tighter">TAHSİL EDİLDİ</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {financeTab === 'EXPENSE' && (
                    <div className="space-y-4">
                        <div className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 mb-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">GİDER ANALİZİ</h3>
                                <button 
                                    onClick={() => setIsAddExpenseModalOpen(true)}
                                    className="p-2 bg-white/5 rounded-xl text-white hover:bg-white/10"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <div className="h-40 w-full">
                                <div className="h-full w-full flex items-end gap-3">
                                    {expenseDistribution.map((entry, index) => {
                                        const maxVal = Math.max(...expenseDistribution.map(d => d.value));
                                        const heightPct = (entry.value / maxVal) * 100;
                                        return (
                                            <div key={index} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                                                <div className="absolute -top-8 bg-black/80 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                    {entry.value.toLocaleString()}₺
                                                </div>
                                                <div 
                                                    className="w-full rounded-t-lg transition-all duration-500 hover:brightness-125"
                                                    style={{ height: `${heightPct}%`, backgroundColor: entry.color }}
                                                ></div>
                                                <span className="text-[9px] font-bold text-gray-500 mt-2 truncate w-full text-center">{entry.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        {expenses.map(expense => (
                            <div key={expense.id} className="bg-[#161B22] p-5 rounded-3xl border border-white/5 flex justify-between items-center group hover:border-red-500/30 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <ZapOff size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">{expense.title}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">{expense.date} • {expense.category}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-red-400">-{expense.amount}₺</p>
                                    <p className="text-[10px] text-gray-600 font-black uppercase">ÖDENDİ</p>
                                </div>
                            </div>
                        ))}

                        {/* Add Expense Modal */}
                        {isAddExpenseModalOpen && (
                            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                                <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-2xl font-black text-white italic tracking-tight">YENİ GİDER</h3>
                                        <button onClick={() => setIsAddExpenseModalOpen(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">GİDER BAŞLIĞI</label>
                                            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
                                                <FileText size={20} className="text-gray-500" />
                                                <input 
                                                    type="text" 
                                                    placeholder="Örn: Su Faturası" 
                                                    className="bg-transparent w-full outline-none text-white font-bold"
                                                    value={newExpense.title}
                                                    onChange={(e) => setNewExpense({...newExpense, title: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">TUTAR (₺)</label>
                                            <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center gap-3">
                                                <DollarSign size={20} className="text-gray-500" />
                                                <input 
                                                    type="number" 
                                                    placeholder="0.00" 
                                                    className="bg-transparent w-full outline-none text-white font-bold"
                                                    value={newExpense.amount}
                                                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">KATEGORİ</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {expenseDistribution.map(cat => (
                                                    <button 
                                                        key={cat.name}
                                                        onClick={() => setNewExpense({...newExpense, category: cat.name})}
                                                        className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all border ${newExpense.category === cat.name ? 'bg-white/10 border-white/20 text-white' : 'bg-[#0A0E14] border-white/5 text-gray-500'}`}
                                                    >
                                                        {cat.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleAddExpense}
                                            className="w-full h-16 bg-[#FF00FF] text-white font-black text-lg rounded-2xl shadow-xl shadow-pink-900/20 hover:bg-pink-500 transition-all mt-4"
                                        >
                                            GİDERİ KAYDET
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Content Area */}
            </div>
        </div>
    );
};

const MenuView: React.FC<{ 
    onNavigate: (view: any) => void; 
    onBack: () => void;
    onEditProfile: () => void;
    onWorkingHours: () => void;
    onBankAccounts: () => void;
    onPricingPolicy: () => void;
    onPaymentSettings: () => void;
    onLogout: () => void;
    notificationsEnabled: boolean;
    onToggleNotifications: () => void;
    onWidgetSettings: () => void;
}> = ({ 
    onNavigate, 
    onBack,
    onEditProfile, 
    onWorkingHours, 
    onBankAccounts, 
    onPricingPolicy, 
    onPaymentSettings,
    onLogout,
    notificationsEnabled,
    onToggleNotifications,
    onWidgetSettings
}) => {
    return (
        <div className="p-6 pb-32 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-10 duration-500">
            
            {/* Profile Header */}
            <div className="flex items-center gap-4 mb-8">
                <div className="relative">
                    <img src={PITCHES[0].image} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10" alt="Facility" />
                    <div className="absolute -bottom-2 -right-2 bg-[#FFFF00] text-black text-[10px] font-black px-2 py-0.5 rounded-lg border-2 border-[#1A1F2C]">
                        PRO
                    </div>
                </div>
                <div>
                    <h2 className="text-xl font-black text-white">Arena Sport Center</h2>
                    <p className="text-xs text-gray-400 font-medium">Beşiktaş, İstanbul</p>
                </div>
            </div>

            {/* Quick Switch Card */}
            <div 
              onClick={onBack}
              className="bg-gradient-to-r from-blue-900/30 to-[#161B22] p-5 rounded-[24px] border border-blue-500/20 mb-8 flex items-center justify-between group cursor-pointer hover:border-blue-500/50 hover:from-blue-900/50 transition-all active:scale-[0.98]"
            >
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                        <RefreshCw size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Oyuncu Moduna Geç</h3>
                        <p className="text-[10px] text-blue-300/70 font-medium">Oyuncu girişine yönlendir</p>
                    </div>
                </div>
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center transform group-hover:translate-x-1 transition-transform shadow-lg shadow-blue-500/30">
                    <ChevronRight size={16} />
                </div>
            </div>

            {/* Menu Sections */}
            <div className="space-y-6">
                
                {/* 1. İşletme Ayarları */}
                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">İŞLETME YÖNETİMİ</h3>
                    <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
                        <button 
                            onClick={onEditProfile}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <Edit3 size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Halı Sahamı Düzenle</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                        <button 
                            onClick={onWorkingHours}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <Clock size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Çalışma Saatleri</span>
                            </div>
                            <span className="text-[10px] font-bold text-green-400">AÇIK</span>
                        </button>
                        <button 
                            onClick={() => onNavigate('MATCHES')}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Trophy size={18} className="text-blue-400" />
                                <span className="text-sm font-bold text-white">Maçlar</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                    </div>
                </section>

                {/* 2. Finansal Ayarlar */}
                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">FİNANSAL</h3>
                    <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
                        <button 
                            onClick={onBankAccounts}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <Banknote size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Banka İşlemleri</span>
                            </div>
                            <span className="text-[10px] text-gray-500">Para Çek</span>
                        </button>
                        <button 
                            onClick={onPricingPolicy}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <Tag size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Fiyatlandırma Politikası</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                        <button 
                            onClick={onPaymentSettings}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <CreditCard size={18} className="text-[#FFFF00]" />
                                <span className="text-sm font-bold text-white">Param Ödeme Entegrasyonu</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                    </div>
                </section>

                {/* 3. Uygulama Ayarları */}
                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">UYGULAMA</h3>
                    <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
                        <button 
                            onClick={onWidgetSettings}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <LayoutDashboard size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Özet Widgetları</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                        <button 
                            onClick={onToggleNotifications}
                            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <Bell size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Bildirimler</span>
                            </div>
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${notificationsEnabled ? 'bg-green-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${notificationsEnabled ? 'right-0.5' : 'left-0.5'}`}></div>
                            </div>
                        </button>
                        <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <Shield size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Güvenlik & Şifre</span>
                            </div>
                            <ChevronRight size={16} className="text-gray-600" />
                        </button>
                        <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3">
                                <Globe size={18} className="text-gray-400" />
                                <span className="text-sm font-bold text-white">Dil / Language</span>
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">TR</span>
                        </button>
                    </div>
                </section>

                {/* 4. Destek ve Çıkış */}
                <section className="space-y-3">
                    <button className="w-full flex items-center justify-center gap-2 p-4 bg-white/5 border border-white/10 rounded-2xl text-gray-300 font-bold text-sm hover:bg-white/10 transition-colors">
                        <HelpCircle size={18} /> Destek Merkezi
                    </button>
                    <button 
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-500/20 transition-colors"
                    >
                        <LogOut size={18} /> Güvenli Çıkış
                    </button>
                </section>

                <div className="text-center pt-4">
                    <p className="text-[10px] text-gray-600 font-mono">OYNA Business v2.4.0</p>
                </div>
            </div>
        </div>
    );
};

const PitchOccupancyGrid: React.FC<{ data: typeof HOURLY_DATA }> = ({ data }) => {
    const pitches = ['Saha 1', 'Saha 2', 'Saha 3', 'Saha 4'];
    
    return (
        <div className="w-full overflow-x-auto custom-scrollbar pb-2">
            <div className="min-w-[800px]">
                {/* Header: Hours */}
                <div className="flex mb-2">
                    <div className="w-20 shrink-0"></div>
                    <div className="flex-1 flex justify-between px-2">
                        {data.map((item, idx) => (
                            <span key={idx} className="text-[8px] font-black text-gray-500 w-8 text-center">
                                {item.time.split(':')[0]}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Rows: Pitches */}
                <div className="space-y-2">
                    {pitches.map((pitchName, pitchIdx) => (
                        <div key={pitchIdx} className="flex items-center group">
                            <div className="w-20 shrink-0 text-[10px] font-bold text-gray-400 group-hover:text-white transition-colors">
                                {pitchName}
                            </div>
                            <div className="flex-1 flex justify-between px-2 gap-1">
                                {data.map((item, timeIdx) => {
                                    const bookingType = item.pitches[pitchIdx];
                                    const isOccupied = bookingType !== null;
                                    
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
                                            className={`flex-1 h-8 rounded-md transition-all duration-300 border ${bgColor} ${borderColor} ${shadow} ${!isOccupied ? 'hover:bg-white/10' : ''}`}
                                            title={`${pitchName} - ${item.time}: ${bookingType === 'SUB' ? 'ABONMAN' : bookingType === 'DAILY' ? 'GÜNLÜK' : 'BOŞ'}`}
                                        ></div>
                                    );
                                })}
                            </div>
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

const WidgetSettingsModal: React.FC<{
    onClose: () => void;
    activeWidgets: WidgetType[];
    onToggleWidget: (widget: WidgetType) => void;
}> = ({ onClose, activeWidgets, onToggleWidget }) => {
    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 flex flex-col max-h-[90vh] animate-in zoom-in duration-300">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black text-white italic tracking-tight">WİDGET AYARLARI</h3>
                    <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {WIDGETS.map(widget => {
                        const isActive = activeWidgets.includes(widget.id);
                        const Icon = widget.icon;
                        return (
                            <div key={widget.id} className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-500'}`}>
                                        <Icon size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">{widget.title}</h4>
                                        <p className="text-[10px] text-gray-500">{widget.description}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onToggleWidget(widget.id)}
                                    className={`w-12 h-6 rounded-full relative transition-colors ${isActive ? 'bg-blue-500' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isActive ? 'right-1' : 'left-1'}`}></div>
                                </button>
                            </div>
                        );
                    })}
                </div>
                
                <button 
                    onClick={onClose}
                    className="w-full h-14 mt-6 bg-blue-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-900/20 hover:bg-blue-500 transition-all"
                >
                    KAYDET
                </button>
            </div>
        </div>
    );
};

interface PendingActionsViewProps {
    pendingRequests: any[];
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onBack: () => void;
}

const PendingActionsView: React.FC<PendingActionsViewProps> = ({ pendingRequests, onApprove, onReject, onBack }) => {
    const [subTab, setSubTab] = useState<'REQUESTS' | 'PUBLIC_MATCHES'>('REQUESTS');
    const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

    // Maçları global store'dan al — MatchCreate ve diğer kaynaklardan eklenen tüm maçlar burada görünür
    const { adminMatches } = useAppStore();
    const publicMatches = adminMatches.map(m => ({
        id: m.id,
        title: m.title || 'İsimsiz Maç',
        pitchName: m.location || 'Saha',
        time: `${m.date || ''} ${m.time || ''}`.trim() || 'Tarih belirtilmedi',
        price: m.price || 0,
        maxPlayers: (m.slots?.length || 0) + (m.awaySlots?.length || 0),
        joinedPlayers: [...(m.slots || []), ...(m.awaySlots || [])].filter(s => s.status === 'TAKEN').length,
        creator: { name: m.creatorId || 'Kaptan', avatar: 'https://i.pravatar.cc/150?u=' + m.id },
        players: [...(m.slots || []), ...(m.awaySlots || [])]
            .filter(s => s.status === 'TAKEN' && s.player)
            .map(s => ({ name: s.player!.name || 'Oyuncu', avatar: s.player!.avatar || 'https://i.pravatar.cc/150?u=' + s.id })),
        type: 'OYUNCU_MACI',
        status: m.status === 'ACTIVE' ? 'FORMING' : (m.status || 'FORMING'),
    }));

    const activeRequests = pendingRequests.filter(r => r.status === 'PENDING');

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
                        ? 'bg-[#FFFF00] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Clock size={16} /> Talepler ({activeRequests.length})
                </button>
                <button
                    onClick={() => setSubTab('PUBLIC_MATCHES')}
                    className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                        subTab === 'PUBLIC_MATCHES' 
                        ? 'bg-[#FFFF00] text-black shadow-lg scale-[1.02]' 
                        : 'text-gray-500 hover:text-white'
                    }`}
                >
                    <Users size={16} /> Oyuncu Maçları ({publicMatches.length})
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-24">
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
                ) : (
                    <div className="space-y-4">
                        {publicMatches.map((match) => {
                            const isFull = match.joinedPlayers === match.maxPlayers;
                            const percentage = Math.round((match.joinedPlayers / match.maxPlayers) * 100);

                            return (
                                <div 
                                    key={match.id} 
                                    className="bg-[#161B22] border border-white/5 rounded-3xl p-5 shadow-xl relative overflow-hidden group hover:border-[#FFFF00]/30 transition-all animate-in fade-in duration-300"
                                >
                                    <div className={`absolute top-0 left-0 w-1 h-full ${isFull ? 'bg-emerald-500' : 'bg-[#FFFF00]'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-4 pl-2">
                                        <div>
                                            <span className="text-[9px] font-black uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-400 tracking-widest">{match.pitchName}</span>
                                            <h4 className="text-base font-black text-white mt-2 leading-tight">{match.title}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">{match.time}</p>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                                            match.status === 'READY' 
                                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                                            : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                                        }`}>
                                            {match.status === 'READY' ? 'MAÇ HAZIR' : 'KADRO KURULUYOR'}
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-5 pl-2 space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase">
                                            <span className="text-gray-500">Kadro Doluluk</span>
                                            <span className={isFull ? 'text-emerald-400' : 'text-white'}>{match.joinedPlayers} / {match.maxPlayers} OYUNCU</span>
                                        </div>
                                        <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-[#FFFF00] shadow-[0_0_8px_rgba(255,255,0,0.3)]'}`} 
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Joined Players Avatars & Creator */}
                                    <div className="flex justify-between items-center pl-2 pt-4 border-t border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {match.players.slice(0, 5).map((p, i) => (
                                                    <img key={i} src={p.avatar} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-[#161B22]" />
                                                ))}
                                                {match.players.length > 5 && (
                                                    <div className="w-7 h-7 rounded-full bg-black/40 border-2 border-[#161B22] flex items-center justify-center text-[9px] font-black text-gray-400">
                                                        +{match.players.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedMatch(match)}
                                            className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider"
                                        >
                                            KADROYU GÖR
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

                        <div className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl mb-6 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <img src={selectedMatch.creator.avatar} className="w-10 h-10 rounded-xl object-cover" />
                                <div>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Kurucu / Kaptan</p>
                                    <p className="text-sm font-black text-white">{selectedMatch.creator.name}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Toplam Bakiye</p>
                                <p className="text-base font-black text-emerald-400 font-mono">{(selectedMatch.joinedPlayers * selectedMatch.price).toLocaleString()}₺</p>
                            </div>
                        </div>

                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-1">KADRODAKİ OYUNCULAR ({selectedMatch.joinedPlayers})</h4>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 mb-6">
                            {selectedMatch.players.map((p: any, idx: number) => (
                                <div key={idx} className="bg-black/20 px-4 py-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></div>
                                        <span className="text-sm font-bold text-white">{p.name}</span>
                                    </div>
                                    <span className="text-[9px] font-black bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-400 uppercase">Katıldı</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedMatch(null)}
                                className="flex-1 py-4 bg-[#FFFF00] text-black font-black text-sm rounded-2xl hover:bg-yellow-300 active:scale-95 transition-all uppercase tracking-wider text-center"
                            >
                                KAPTANLA İLETİŞİME GEÇ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const OwnerPanel: React.FC<OwnerPanelProps> = ({ onBack, onNavigate }) => {
  const { setIsNotificationsOpen } = useAppStore();
  const [activeTab, setActiveTab] = useState<OwnerTab>('HOME'); 
  const [pendingRequests, setPendingRequests] = useState(() => {
      const saved = localStorage.getItem('owner_pendingRequests');
      return saved ? JSON.parse(saved) : INITIAL_PENDING_REQUESTS;
  });
  const [hasDebt, setHasDebt] = useState(() => {
      const saved = localStorage.getItem('owner_hasDebt');
      return saved ? JSON.parse(saved) : true;
  });
  const [isPayingDebt, setIsPayingDebt] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showOccupancyModal, setShowOccupancyModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showWorkingHours, setShowWorkingHours] = useState(false);
  const [showBankAccounts, setShowBankAccounts] = useState(false);
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

  // Gerçek tesisi (varsa) yükle ve mock facilityData üzerine bindir.
  // Böylece tüm modal kayıtları gerçek pitch id ile çalışır; tesis yoksa demo modu sürer.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;
        const pitches = await getOwnerPitches(uid);
        if (!active || !pitches.length) return;
        const p: any = pitches[0];
        setRealPitchId(p.id);
        setIsFacilityOpen(p.is_open ?? true);
        setFacilityData((prev: any) => ({
          ...(prev || {}),
          id: p.id,
          ownerId: uid,
          name: p.name ?? prev?.name,
          isFacilityOpen: p.is_open ?? true,
          workingHours: Array.isArray(p.working_hours) && p.working_hours.length ? p.working_hours : prev?.workingHours,
        }));
      } catch (err) {
        // Sessiz geç: demo/mock moduna düş
        console.warn('Gerçek tesis yüklenemedi, demo modu:', err);
      }
    })();
    return () => { active = false; };
  }, []);

  // Fetch facility data on mount
  useEffect(() => {
    // Firebase setup was declined or skipped, using mock mode with localStorage
    const uid = 'mock-user-id';
    
    // Use default mock data
    const defaultData = {
      ownerId: uid,
      name: 'Arena Sport Center',
      description: 'Tesis açıklaması buraya gelecek.',
      images: [PITCHES[0].image],
      amenities: ['Otopark', 'Kafe', 'Soyunma Odası', 'Duş'],
      isFacilityOpen: true,
      pricingPolicy: { daytime: 2000, prime: 3200, weekend: 3500 },
      bankAccounts: [],
      workingHours: [
        { name: 'Pazartesi', open: '08:00', close: '00:00' },
        { name: 'Salı', open: '08:00', close: '00:00' },
        { name: 'Çarşamba', open: '08:00', close: '00:00' },
        { name: 'Perşembe', open: '08:00', close: '00:00' },
        { name: 'Cuma', open: '08:00', close: '02:00' },
        { name: 'Cumartesi', open: '08:00', close: '02:00' },
        { name: 'Pazar', open: '08:00', close: '00:00' },
      ],
      createdAt: new Date()
    };
    
    const savedFacilityData = localStorage.getItem('owner_facilityData');
    if (savedFacilityData) {
        const parsed = JSON.parse(savedFacilityData);
        setFacilityData(parsed);
        setIsFacilityOpen(parsed.isFacilityOpen ?? true);
    } else {
        setFacilityData({ id: 'mock-facility-id', ...defaultData });
        setIsFacilityOpen(true);
    }
    setIsLoading(false);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
      localStorage.setItem('owner_pendingRequests', JSON.stringify(pendingRequests));
  }, [pendingRequests]);

  useEffect(() => {
      localStorage.setItem('owner_hasDebt', JSON.stringify(hasDebt));
  }, [hasDebt]);

  useEffect(() => {
      localStorage.setItem('owner_notificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
      localStorage.setItem('owner_activeWidgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  useEffect(() => {
      if (facilityData) {
          localStorage.setItem('owner_facilityData', JSON.stringify({
              ...facilityData,
              isFacilityOpen
          }));
      }
  }, [facilityData, isFacilityOpen]);

  const toggleFacilityStatus = async () => {
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
    }
  };

  const handleProcessRequest = (id: string, action: 'APPROVE' | 'REJECT') => {
      setPendingRequests((prev: any[]) => prev.map(req => 
          req.id === id ? { ...req, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : req
      ));
  };

  const handlePayDebt = () => {
      setIsPayingDebt(true);
      setTimeout(() => {
          setHasDebt(false);
          setIsPayingDebt(false);
      }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#1A1F2C] text-slate-200 font-sans selection:bg-blue-500 selection:text-white relative">
      
      {/* Header logic adjustment for Menu view */}
      {activeTab !== 'CALENDAR' && activeTab !== 'MORE' && (
          <header className="px-6 py-4 bg-[#1A1F2C] border-b border-white/5 flex justify-between items-center sticky top-0 z-30">
              <div className="flex items-center gap-3">
                  <button onClick={() => onBack()} className="p-2 rounded-lg hover:bg-[#252B3B] text-gray-400 transition-colors">
                      <ArrowLeft size={20} />
                  </button>
                  <div className="flex flex-col">
                      <h1 className="text-sm font-bold text-white tracking-wide text-shadow">OYNA İŞLETME</h1>
                      <p className="text-[10px] text-gray-500 font-medium">Arena Sport Center</p>
                  </div>
              </div>
              <button 
                onClick={() => setIsNotificationsOpen(true)}
                className="p-2 rounded-lg hover:bg-[#252B3B] text-gray-400 relative"
              >
                  <Bell size={20} />
                  {pendingRequests.length > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-[#1A1F2C]"></span>}
              </button>
          </header>
      )}

      {/* Simplified Header for Menu View */}
      {activeTab === 'MORE' && (
          <header className="px-6 py-4 bg-[#1A1F2C] border-b border-white/5 flex items-center sticky top-0 z-30">
              <h1 className="text-lg font-black text-white tracking-wide">MENÜ & AYARLAR</h1>
          </header>
      )}

      {activeTab === 'HOME' && (
          <main className="flex-1 px-6 pt-6 overflow-y-auto custom-scrollbar pb-32">
              {activeWidgets.includes('QUICK_STATS') && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button onClick={() => setShowRevenueModal(true)} className="text-left bg-gradient-to-br from-emerald-900/40 to-[#1A1F2C] p-5 rounded-2xl border border-emerald-500/20 relative overflow-hidden group hover:border-emerald-500/50 transition-all active:scale-95">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Wallet size={48} /></div>
                        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">Bugünkü Ciro <ArrowUpRight size={12} /></p>
                        <h3 className="text-3xl font-black text-white mt-1 group-hover:text-emerald-300 transition-colors">13.600₺</h3>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold mt-2 bg-emerald-500/10 w-fit px-2 py-0.5 rounded-lg">
                            <TrendingUp size={12} /> %12 Artış
                        </div>
                    </button>
                    <button 
                        onClick={() => setShowOccupancyModal(true)}
                        className="bg-[#1A1F2C] p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-emerald-500/50 transition-all active:scale-95 text-left"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Users size={48} /></div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">Doluluk <ArrowUpRight size={12} /></p>
                        <h3 className={`text-3xl font-black mt-1 transition-colors ${78 < 50 ? 'text-red-500 group-hover:text-red-400' : 'text-emerald-500 group-hover:text-emerald-400'}`}>%78</h3>
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold mt-2">4 Saat Boş</div>
                    </button>
                  </div>
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
                      <span className="text-sm font-black italic text-white">QR OKUT</span>
                      <span className="text-[10px] font-bold text-blue-100 mt-1 uppercase tracking-widest">Skor Girişi</span>
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
                    <PitchOccupancyGrid data={HOURLY_DATA} />
                  </div>
              )}

              {activeWidgets.includes('PENDING_REQUESTS') && (
                  <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
                      <h3 className="font-bold text-white text-base flex items-center gap-2 mb-4">
                          <Clock size={18} className="text-yellow-500" /> Onay Bekleyen Talepler
                      </h3>
                      {pendingRequests.length > 0 ? (
                          <div className="space-y-4">
                              {pendingRequests.slice(0, 3).map((req: any) => (
                                  <MatchCountdownItem 
                                      key={req.id}
                                      request={req}
                                      onApprove={() => handleProcessRequest(req.id, 'APPROVE')}
                                      onReject={() => handleProcessRequest(req.id, 'REJECT')}
                                  />
                              ))}
                              {pendingRequests.length > 3 && (
                                  <button onClick={() => setActiveTab('PENDING_ACTIONS')} className="w-full py-2 text-xs font-bold text-blue-400 hover:text-blue-300 text-center">Tümünü Gör ({pendingRequests.length})</button>
                              )}
                          </div>
                      ) : (
                          <p className="text-sm text-gray-500 text-center py-4">Bekleyen talep bulunmuyor.</p>
                      )}
                  </div>
              )}

          </main>
      )}

      {activeTab === 'CALENDAR' && <FinancialCalendarView facilityId={facilityData?.id} pricingPolicy={facilityData?.pricingPolicy} />}
      {activeTab === 'FINANCE' && <FinanceView hasDebt={hasDebt} isPayingDebt={isPayingDebt} onPayDebt={handlePayDebt} />}
      {activeTab === 'TEAM' && <TeamView />}
      {activeTab === 'PENDING_ACTIONS' && (
          <PendingActionsView 
              pendingRequests={pendingRequests} 
              onApprove={(id) => handleProcessRequest(id, 'APPROVE')} 
              onReject={(id) => handleProcessRequest(id, 'REJECT')}
              onBack={() => setActiveTab('HOME')}
          />
      )}
      {activeTab === 'MORE' && (
        <MenuView 
            onNavigate={onNavigate}
            onBack={onBack}
            onEditProfile={() => setShowEditProfile(true)}
            onWorkingHours={() => setShowWorkingHours(true)}
            onBankAccounts={() => setShowBankAccounts(true)}
            onPricingPolicy={() => setShowPricingPolicy(true)}
            onPaymentSettings={() => setShowPaymentSettings(true)}
            onLogout={() => setShowLogoutConfirm(true)}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={() => setNotificationsEnabled(!notificationsEnabled)}
            onWidgetSettings={() => setShowWidgetSettings(true)}
        />
      )}

      {/* MODALS */}
      {showEditProfile && (
        <EditFacilityModal 
          onClose={() => setShowEditProfile(false)} 
          facilityId={facilityData?.id} 
          initialData={facilityData}
          onSave={(data) => setFacilityData((prev: any) => ({ ...prev, ...data }))}
        />
      )}
      {showWorkingHours && (
          <WorkingHoursModal 
            onClose={() => setShowWorkingHours(false)} 
            facilityId={facilityData?.id}
            isOpen={isFacilityOpen} 
            onToggleOpen={toggleFacilityStatus} 
            initialHours={facilityData?.workingHours}
            onSave={(hours) => setFacilityData((prev: any) => ({ ...prev, workingHours: hours }))}
          />
      )}
      {showBankAccounts && (
        <BankOperationsModal 
          onClose={() => setShowBankAccounts(false)} 
          facilityId={facilityData?.id}
        />
      )}
      {showPricingPolicy && (
        <PricingPolicyModal 
          onClose={() => setShowPricingPolicy(false)} 
          facilityId={facilityData?.id}
          initialPrices={facilityData?.pricingPolicy}
          onSave={(policy) => setFacilityData((prev: any) => ({ ...prev, pricingPolicy: policy }))}
        />
      )}
      {showPaymentSettings && (
        <PaymentSettingsModal 
          onClose={() => setShowPaymentSettings(false)} 
          facilityId={facilityData?.id}
          initialData={facilityData}
          onSave={(paymentData) => setFacilityData((prev: any) => ({ ...prev, ...paymentData }))}
        />
      )}
      {showWidgetSettings && (
        <WidgetSettingsModal 
            onClose={() => setShowWidgetSettings(false)}
            activeWidgets={activeWidgets}
            onToggleWidget={toggleWidget}
        />
      )}
      {showLogoutConfirm && <LogoutConfirmationModal onClose={() => setShowLogoutConfirm(false)} onConfirm={() => onBack()} />}

      {showRevenueModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-[#161B22] w-full max-w-md rounded-[40px] border border-white/10 p-8 animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-8">
                      <h3 className="text-2xl font-black text-white italic tracking-tight">CİRO DETAYLARI</h3>
                      <button onClick={() => setShowRevenueModal(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="space-y-4">
                      {[
                          { label: 'Saha 1', amount: 5200 },
                          { label: 'Saha 2', amount: 4800 },
                          { label: 'Saha 3', amount: 2400 },
                          { label: 'Saha 4', amount: 3100 },
                          { label: 'Kafeterya', amount: 1200 }
                      ].map((item, idx) => (
                          <div key={idx} className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-400">{item.label}</span>
                              <span className="text-lg font-black text-emerald-400">{item.amount.toLocaleString()}₺</span>
                          </div>
                      ))}
                      <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                          <span className="text-base font-black text-white">TOPLAM</span>
                          <span className="text-2xl font-black text-emerald-500">13.600₺</span>
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
                      {[
                          { label: 'Saha 1', value: 85 },
                          { label: 'Saha 2', value: 70 },
                          { label: 'Saha 3', value: 45 },
                          { label: 'Saha 4', value: 60 }
                      ].map((item, idx) => (
                          <div key={idx} className="space-y-2">
                              <div className="flex justify-between items-end">
                                  <span className="text-sm font-bold text-white">{item.label}</span>
                                  <span className={`text-sm font-black ${item.value < 50 ? 'text-red-500' : 'text-emerald-500'}`}>%{item.value}</span>
                              </div>
                              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${item.value < 50 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${item.value}%` }}></div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[#1A1F2C] border-t border-white/5 px-6 py-3 flex justify-between items-center z-40 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <button onClick={() => setActiveTab('HOME')} className={`flex flex-col items-center gap-1 transition-colors px-2 py-1 rounded-lg ${activeTab === 'HOME' ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
              <Home size={20} />
              <span className="text-[10px] font-bold">Özet</span>
          </button>
          <button onClick={() => setActiveTab('CALENDAR')} className={`flex flex-col items-center gap-1 transition-colors px-2 py-1 rounded-lg ${activeTab === 'CALENDAR' ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
              <Calendar size={20} />
              <span className="text-[10px] font-bold">Takvim</span>
          </button>
          <button onClick={() => setActiveTab('FINANCE')} className={`flex flex-col items-center gap-1 transition-colors px-2 py-1 rounded-lg ${activeTab === 'FINANCE' ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
              <Wallet size={20} />
              <span className="text-[10px] font-bold">Finans</span>
          </button>
          <button onClick={() => setActiveTab('TEAM')} className={`flex flex-col items-center gap-1 transition-colors px-2 py-1 rounded-lg ${activeTab === 'TEAM' ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
              <Users size={20} />
              <span className="text-[10px] font-bold">Ekip</span>
          </button>
          <button onClick={() => setActiveTab('MORE')} className={`flex flex-col items-center gap-1 transition-colors px-2 py-1 rounded-lg ${activeTab === 'MORE' ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
              <MoreHorizontal size={20} />
              <span className="text-[10px] font-bold">Menü</span>
          </button>
      </nav>
    </div>
  );
};

export default OwnerPanel;
