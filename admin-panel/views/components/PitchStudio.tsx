/**
 * Saha Kurulum Merkezi — admin vitrin editörü.
 * Oyuncu uygulamasındaki Saha Vitrini'nde görünen HER ŞEY buradan kurulur ve
 * yönetilir: kimlik + konum pini, olanaklar, çalışma saatleri, kortlar,
 * tarifeler, fotoğraflar (pitch_media) ve yayın/öne çıkarma.
 * Owner tarafıyla aynı altyapıyı (PhotoManager, ShowcaseScoreCard,
 * ShowcasePreview, saveTariffs, upsertCourt) paylaşır — iki ayrı model yok.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, MapPin, Building2, Clock, LayoutGrid, Wallet, Image as ImageIcon,
  Sparkles, Check, Eye, Star, Lock, Loader2, Plus, Trash2, ShieldCheck, Percent,
  CalendarClock, ChevronLeft, ChevronRight, RefreshCcw, Coins, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { getFacilitySchedule, type FacilitySchedule } from '../../../services/facilitySchedule';
import { buildFacilityDayGrid } from '../../../shared/facilityScheduleModel';
import { FacilityScheduleGrid } from '../../../shared/FacilityScheduleGrid';
import { getPitchFinanceSummary, type FinanceSummary } from '../../../services/financeService';
import { monthLabel, shiftMonth, isMonthAfter, methodLabel } from '../../../shared/financeModel';
import { money, BreakdownList } from '../../../views/owner/finance/financeUi';
import { localDateISO } from '../../../views/owner/ownerCalendarHelpers';
import { createPitchAdmin, updatePitchAdmin, listOwnerCandidatesAdmin, toTurkishAdminError, type OwnerCandidate } from '../../services/adminService';
import { getTariffs, saveTariffs, getPitchRefundPolicy, setPitchRefundPolicy, type TariffInput } from '../../../services/pitchOwnerService';
import { setPitchPublished, setPitchShowcaseFlags, type PitchShowcaseFlags } from '../../../services/pitchContentService';
import { AMENITY_CATALOG, normalizeAmenity } from '../../../shared/amenities';
import PhotoManager from '../../../components/pitch-editor/PhotoManager';
import ShowcaseScoreCard from '../../../components/pitch-editor/ShowcaseScoreCard';
import ShowcasePreview from '../../../components/pitch-editor/ShowcasePreview';
import { PitchManager } from '../PitchManager';
import { useAdminToast } from '../context/AdminToastContext';
import { DEFAULT_WORKING_DAYS, type OwnerWorkingDay } from '../../../views/owner/menu/ownerMenuTypes';
import { ORDU_CENTER } from '../../../utils/orduData';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../../../components/map/mapBase';
import type { PitchCourt } from '../../../types';

interface PitchStudioProps {
  /** null → yeni tesis kurulumu; string → mevcut tesis düzenleme */
  pitchId: string | null;
  onClose: () => void;
  /** Liste yenilemesi için — oluşturma ve kayıt sonrası çağrılır */
  onSaved: () => void;
}

type StudioTab = 'identity' | 'amenities' | 'hours' | 'courts' | 'tariffs' | 'photos' | 'showcase' | 'schedule' | 'finance';

const DESC_MIN = 40;
const DESC_MAX = 500;
const MAX_COURTS = 10;

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#EF4444;transform:rotate(-45deg);border:3px solid #0A0E14;box-shadow:0 0 14px rgba(239,68,68,0.8);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const DraggablePin: React.FC<{ pos: [number, number]; onMove: (lat: number, lng: number) => void }> = ({ pos, onMove }) => {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return (
    <Marker
      position={pos}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const p = (e.target as L.Marker).getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
};

interface TariffRow extends TariffInput {
  /** UI satır anahtarı (DB id'si değil) */
  key: string;
}

const newTariffRow = (idx: number): TariffRow => ({
  key: `t_${Date.now()}_${idx}`,
  name: idx === 0 ? 'Standart' : `Tarife ${idx + 1}`,
  tariff_type: 'WEEKDAY',
  applies_to_days: [1, 2, 3, 4, 5],
  start_time: '08:00',
  end_time: '23:00',
  price_per_hour: 0,
  deposit_amount: 0,
  is_active: true,
  court_id: null,
});

export const PitchStudio: React.FC<PitchStudioProps> = ({ pitchId, onClose, onSaved }) => {
  const { success, error: toastError } = useAdminToast();
  const [id, setId] = useState<string | null>(pitchId);
  const isCreateMode = id === null;

  const [activeTab, setActiveTab] = useState<StudioTab>('identity');
  const [loading, setLoading] = useState(!!pitchId);
  const [saving, setSaving] = useState(false);

  // ── Kimlik & konum ──
  const [name, setName] = useState('');
  const [mapLabel, setMapLabel] = useState('');
  const [city, setCity] = useState('Ordu');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [latLng, setLatLng] = useState<[number, number] | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [pricePerMatch, setPricePerMatch] = useState<number>(0);
  // Saha sahibi (owner) seçimi. initialOwnerId ile karşılaştırılır: admin_update_pitch
  // owner devrini SUPER_ADMIN'e kilitler, o yüzden owner_id yalnız değiştiğinde gönderilir.
  const [ownerId, setOwnerId] = useState('');
  const [initialOwnerId, setInitialOwnerId] = useState('');
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerCandidate[]>([]);

  // ── Olanaklar ──
  const [amenities, setAmenities] = useState<string[]>([]);
  const [customAmenity, setCustomAmenity] = useState('');

  // ── Çalışma saatleri ──
  const [hours, setHours] = useState<OwnerWorkingDay[]>(DEFAULT_WORKING_DAYS);

  // ── Kortlar ──
  const [courts, setCourts] = useState<PitchCourt[]>([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);

  // ── Tarifeler ──
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [tariffsLoaded, setTariffsLoaded] = useState(false);
  const [savingTariffs, setSavingTariffs] = useState(false);

  // ── Takvim & Doluluk (admin gözetim, salt-okuma) ──
  const [scheduleDateISO, setScheduleDateISO] = useState(() => localDateISO());
  const [schedule, setSchedule] = useState<FacilitySchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // ── Finans (admin gözetim, salt-okuma; get_pitch_finance_summary owner/admin) ──
  const [financeMonth, setFinanceMonth] = useState(() => localDateISO().slice(0, 7));
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  // ── [S2.6/K6] İptal/iade politikası (saha override; admin de yönetebilir) ──
  const [refundCustom, setRefundCustom] = useState(false);
  const [refundFull, setRefundFull] = useState(24);
  const [refundHalf, setRefundHalf] = useState(6);
  const [refundPct, setRefundPct] = useState(50);
  const [refundLoaded, setRefundLoaded] = useState(false);
  const [savingRefund, setSavingRefund] = useState(false);

  // ── Vitrin ──
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [availabilityBadge, setAvailabilityBadge] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');
  const [showPreview, setShowPreview] = useState(false);
  const [scoreRefresh, setScoreRefresh] = useState(0);

  // Mevcut tesis: canlı veriyi yükle
  useEffect(() => {
    if (!pitchId) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('pitches')
        .select('name, map_label, city, district, address, latitude, longitude, description, amenities, working_hours, is_published, is_featured, flash_deals_enabled, show_availability_badge, is_active, verification_status, price_per_match, owner_id')
        .eq('id', pitchId)
        .single();
      if (!alive) return;
      if (error || !data) {
        toastError('Tesis verisi yüklenemedi.');
        setLoading(false);
        return;
      }
      setName(data.name ?? '');
      setMapLabel((data as { map_label?: string | null }).map_label ?? '');
      setCity(data.city ?? 'Ordu');
      setDistrict(data.district ?? '');
      setAddress(data.address ?? '');
      setDescription(data.description ?? '');
      if (data.latitude != null && data.longitude != null) setLatLng([data.latitude, data.longitude]);
      setAmenities(Array.isArray(data.amenities) ? (data.amenities as string[]).map(normalizeAmenity) : []);
      if (Array.isArray(data.working_hours) && data.working_hours.length === 7) {
        setHours((data.working_hours as OwnerWorkingDay[]).map((d) => ({
          name: String(d.name ?? ''),
          open: String(d.open ?? '08:00').slice(0, 5),
          close: String(d.close ?? '23:00').slice(0, 5),
          closed: Boolean(d.closed),
        })));
      }
      setIsPublished(data.is_published !== false);
      setIsFeatured(data.is_featured === true);
      setFlashEnabled((data as { flash_deals_enabled?: boolean | null }).flash_deals_enabled === true);
      setAvailabilityBadge((data as { show_availability_badge?: boolean | null }).show_availability_badge === true);
      setIsActive(data.is_active !== false);
      setVerificationStatus((data.verification_status as typeof verificationStatus) ?? 'approved');
      setPricePerMatch(Number(data.price_per_match ?? 0));
      setOwnerId((data.owner_id as string | null) ?? '');
      setInitialOwnerId((data.owner_id as string | null) ?? '');
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId]);

  // Saha sahibi adaylarını (OWNER rollü profiller) bir kez yükle.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const owners = await listOwnerCandidatesAdmin();
        if (alive) setOwnerCandidates(owners);
      } catch {
        /* sessiz geç — owner seçici opsiyonel */
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadCourts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('courts')
      .select('*')
      .eq('pitch_id', id)
      .order('sort_order', { ascending: true });
    setCourts((data ?? []) as PitchCourt[]);
    setCourtsLoaded(true);
  }, [id]);

  const loadTariffs = useCallback(async () => {
    if (!id) return;
    try {
      const rows = await getTariffs(id);
      setTariffs(rows.map((t, idx) => ({
        key: t.id || `t_${idx}`,
        name: t.name,
        tariff_type: t.tariff_type,
        applies_to_days: t.applies_to_days ?? [1, 2, 3, 4, 5],
        start_time: (t.start_time ?? '08:00').slice(0, 5),
        end_time: (t.end_time ?? '23:00').slice(0, 5),
        price_per_hour: t.price_per_hour,
        deposit_amount: t.deposit_amount ?? 0,
        is_active: t.is_active !== false,
        court_id: t.court_id ?? null,
        sort_order: t.sort_order ?? idx,
      })));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    }
    setTariffsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (activeTab === 'courts' && id && !courtsLoaded) void loadCourts();
    if (activeTab === 'tariffs' && id) {
      if (!tariffsLoaded) void loadTariffs();
      if (!courtsLoaded) void loadCourts(); // tarife → kort seçimi için
      if (!refundLoaded) {
        setRefundLoaded(true);
        getPitchRefundPolicy(id)
          .then((p) => {
            setRefundCustom(p.is_custom);
            setRefundFull(p.full_hours);
            setRefundHalf(p.half_hours);
            setRefundPct(p.half_pct);
          })
          .catch(() => { /* politika okunamadı — global varsayılan gösterilir */ });
      }
    }
  }, [activeTab, id, courtsLoaded, tariffsLoaded, refundLoaded, loadCourts, loadTariffs]);

  // [K6] Saha iptal/iade politikası kaydet — owner_set_pitch_refund_policy admin'e de açık.
  const handleSaveRefundPolicy = async () => {
    if (!id) return;
    if (refundCustom && refundHalf > refundFull) {
      toastError('Yarım-iade saati tam-iade saatinden büyük olamaz.');
      return;
    }
    setSavingRefund(true);
    try {
      await setPitchRefundPolicy(id, refundCustom
        ? { full_hours: refundFull, half_hours: refundHalf, half_pct: refundPct }
        : null);
      success(refundCustom ? 'İptal politikası kaydedildi.' : 'Global varsayılana dönüldü.');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingRefund(false);
    }
  };

  // Takvim & Doluluk sekmesi: get_facility_schedule (admin yetkili). Salt-okuma.
  const loadSchedule = useCallback(async () => {
    if (!id) return;
    setScheduleLoading(true); setScheduleError(null);
    try {
      setSchedule(await getFacilitySchedule(id, scheduleDateISO, scheduleDateISO));
    } catch (e) {
      setScheduleError(toTurkishAdminError(e));
    } finally {
      setScheduleLoading(false);
    }
  }, [id, scheduleDateISO]);

  useEffect(() => {
    if (activeTab === 'schedule' && id) void loadSchedule();
  }, [activeTab, id, loadSchedule]);

  // Finans sekmesi: get_pitch_finance_summary (admin yetkili). Salt-okuma.
  const loadFinance = useCallback(async () => {
    if (!id) return;
    setFinanceLoading(true); setFinanceError(null);
    try {
      setFinance(await getPitchFinanceSummary(id, financeMonth));
    } catch (e) {
      setFinanceError(toTurkishAdminError(e));
    } finally {
      setFinanceLoading(false);
    }
  }, [id, financeMonth]);

  useEffect(() => {
    if (activeTab === 'finance' && id) void loadFinance();
  }, [activeTab, id, loadFinance]);

  const scheduleGrid = useMemo(
    () => (schedule ? buildFacilityDayGrid(schedule, scheduleDateISO) : null),
    [schedule, scheduleDateISO],
  );

  const stepScheduleDate = (deltaDays: number) => {
    const d = new Date(scheduleDateISO + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    setScheduleDateISO(localDateISO(d));
  };
  const scheduleDateLabel = useMemo(() => {
    const d = new Date(scheduleDateISO + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [scheduleDateISO]);

  const descLen = description.trim().length;
  const identityValid = name.trim().length >= 3 && district.trim().length >= 2 && address.trim().length >= 5;

  const buildProfilePayload = () => ({
    name: name.trim(),
    map_label: mapLabel.trim(),
    city: city.trim() || 'Ordu',
    district: district.trim(),
    address: address.trim(),
    description: description.trim(),
    amenities,
    working_hours: hours,
    price_per_match: pricePerMatch,
    is_active: isActive,
    ...(latLng ? { latitude: latLng[0], longitude: latLng[1] } : {}),
    // owner_id yalnız oluşturmada ya da gerçekten değiştiğinde gönderilir. Aksi halde
    // admin_update_pitch'in owner devri kilidi (SUPER_ADMIN) normal kayıtları engellerdi.
    ...(isCreateMode || ownerId !== initialOwnerId ? { owner_id: ownerId } : {}),
  });

  const validateProfile = (): boolean => {
    if (!identityValid) {
      toastError('Tesis adı, ilçe ve adres zorunludur.');
      setActiveTab('identity');
      return false;
    }
    if (descLen > 0 && descLen < DESC_MIN) {
      toastError(`Açıklama en az ${DESC_MIN} karakter olmalı (${descLen}/${DESC_MIN}).`);
      setActiveTab('identity');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateProfile()) return;
    setSaving(true);
    try {
      // Yeni tesis vitrine kapalı doğar; Vitrin sekmesinden bilinçli yayınlanır.
      const newId = await createPitchAdmin({ ...buildProfilePayload(), is_published: false });
      setId(newId);
      setIsPublished(false);
      success('Tesis oluşturuldu — kort, tarife ve fotoğraf kurulumuna devam edin.');
      onSaved();
      setActiveTab('courts');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!id || !validateProfile()) return;
    setSaving(true);
    try {
      await updatePitchAdmin(id, buildProfilePayload());
      success('Tesis bilgileri kaydedildi.');
      setScoreRefresh((v) => v + 1);
      onSaved();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTariffs = async () => {
    if (!id) return;
    for (const t of tariffs) {
      if (!t.name.trim()) { toastError('Her tarifenin bir adı olmalı.'); return; }
      if (t.applies_to_days.length === 0) { toastError(`"${t.name}" tarifesi için en az bir gün seçin.`); return; }
      if (!(t.price_per_hour > 0)) { toastError(`"${t.name}" tarifesinde saatlik ücret 0'dan büyük olmalı.`); return; }
      if ((t.deposit_amount ?? 0) < 0) { toastError(`"${t.name}" tarifesinde kapora negatif olamaz.`); return; }
    }
    setSavingTariffs(true);
    try {
      await saveTariffs(id, tariffs.map(({ key: _key, ...t }, idx) => ({ ...t, sort_order: idx })));
      await updatePitchAdmin(id, { price_per_match: pricePerMatch });
      success('Tarifeler kaydedildi.');
      setScoreRefresh((v) => v + 1);
      onSaved();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSavingTariffs(false);
    }
  };

  const handleTogglePublished = async () => {
    if (!id) return;
    const next = !isPublished;
    setIsPublished(next);
    try {
      await setPitchPublished(id, next);
      success(next ? 'Tesis vitrinde görünür.' : 'Tesis vitrinden gizlendi.');
      onSaved();
    } catch (err) {
      setIsPublished(!next);
      toastError(toTurkishAdminError(err));
    }
  };

  // Üç admin rozet bayrağı (Öne Çıkan / flash izni / müsaitlik) tek yoldan;
  // DB trigger'ı bu kolonları admin-only kildeler, yazım admin_update_pitch RPC'sinden geçer.
  const handleToggleShowcaseFlag = async (
    key: keyof PitchShowcaseFlags,
    cur: boolean,
    setLocal: (v: boolean) => void,
    okMsg: [string, string],
  ) => {
    if (!id) return;
    const next = !cur;
    setLocal(next);
    try {
      await setPitchShowcaseFlags(id, { [key]: next });
      success(next ? okMsg[0] : okMsg[1]);
      onSaved();
    } catch (err) {
      setLocal(cur);
      toastError(toTurkishAdminError(err));
    }
  };

  const handleVerificationChange = async (status: 'pending' | 'approved' | 'rejected') => {
    if (!id) return;
    const prev = verificationStatus;
    setVerificationStatus(status);
    try {
      await updatePitchAdmin(id, { verification_status: status });
      success('Doğrulama durumu güncellendi.');
      onSaved();
    } catch (err) {
      setVerificationStatus(prev);
      toastError(toTurkishAdminError(err));
    }
  };

  const toggleAmenity = (item: string) => {
    setAmenities((prev) => (prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]));
  };

  const customAmenities = useMemo(
    () => amenities.filter((a) => !AMENITY_CATALOG.some((c) => c.value === a)),
    [amenities],
  );

  const toggleTariffDay = (rowKey: string, day: number) => {
    setTariffs((prev) => prev.map((t) => t.key !== rowKey ? t : {
      ...t,
      applies_to_days: t.applies_to_days.includes(day)
        ? t.applies_to_days.filter((d) => d !== day)
        : [...t.applies_to_days, day].sort((a, b) => a - b),
    }));
  };

  const patchTariff = (rowKey: string, patch: Partial<TariffRow>) => {
    setTariffs((prev) => prev.map((t) => (t.key === rowKey ? { ...t, ...patch } : t)));
  };

  const mapCenter: [number, number] = latLng ?? [ORDU_CENTER.lat, ORDU_CENTER.lng];

  const TABS: Array<{ id: StudioTab; label: string; icon: React.ElementType; requiresId: boolean }> = [
    { id: 'identity', label: 'Kimlik & Konum', icon: Building2, requiresId: false },
    { id: 'amenities', label: 'Olanaklar', icon: Sparkles, requiresId: false },
    { id: 'hours', label: 'Çalışma Saatleri', icon: Clock, requiresId: false },
    { id: 'courts', label: 'Kortlar', icon: LayoutGrid, requiresId: true },
    { id: 'tariffs', label: 'Tarifeler & Fiyat', icon: Wallet, requiresId: true },
    { id: 'schedule', label: 'Takvim & Doluluk', icon: CalendarClock, requiresId: true },
    { id: 'finance', label: 'Finans', icon: Coins, requiresId: true },
    { id: 'photos', label: 'Fotoğraflar', icon: ImageIcon, requiresId: true },
    { id: 'showcase', label: 'Vitrin & Yayın', icon: Eye, requiresId: true },
  ];

  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/40 transition-colors';
  const labelCls = 'text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5';

  return (
    <div className="fixed inset-0 z-[90] bg-[#0A0D14] flex flex-col">
      {/* Başlık */}
      <div className="h-14 shrink-0 bg-[#161B22] border-b border-white/5 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
            <Building2 size={15} className="text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white truncate">
              {isCreateMode ? 'Yeni Tesis Kurulumu' : `Saha Kurulum Merkezi — ${name || '…'}`}
            </h2>
            <p className="text-[10px] text-gray-500">Vitrinde görünen her şey buradan yönetilir</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab !== 'showcase' && (activeTab === 'identity' || activeTab === 'amenities' || activeTab === 'hours') && (
            <button
              type="button"
              onClick={() => void (isCreateMode ? handleCreate() : handleSaveProfile())}
              disabled={saving || loading}
              className="flex items-center gap-2 h-9 px-5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isCreateMode ? 'Tesisi Oluştur' : 'Kaydet'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sekme rayı */}
        <div className="w-14 md:w-52 shrink-0 bg-[#0D1117] border-r border-white/5 py-3 px-2 space-y-1 overflow-y-auto">
          {TABS.map((tab) => {
            const locked = tab.requiresId && isCreateMode;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={locked}
                title={locked ? 'Önce tesisi oluşturun' : tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-red-600/10 border border-red-500/20 text-white'
                    : 'border border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                } ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {locked ? <Lock size={14} className="shrink-0" /> : <Icon size={14} className={`shrink-0 ${activeTab === tab.id ? 'text-red-400' : ''}`} />}
                <span className="hidden md:inline text-[11px] font-bold uppercase tracking-wide">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> Tesis yükleniyor…
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {activeTab === 'identity' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Tesis Adı *</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Örn: Capo Arena" />
                      <div className="mt-2">
                        <label className={`${labelCls} flex items-center gap-1.5`}><MapPin size={11} /> Haritada Görünecek İsim</label>
                        <input value={mapLabel} onChange={(e) => setMapLabel(e.target.value)} className={inputCls} placeholder={name.trim() || 'Boş bırakılırsa tesis adı kullanılır'} maxLength={40} />
                        <p className="text-[10px] text-gray-500 mt-1">Harita pininde fiyat yerine bu isim görünür. Boşsa tesis adı kullanılır.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>İl</label>
                        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="Ordu" />
                      </div>
                      <div>
                        <label className={labelCls}>İlçe *</label>
                        <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputCls} placeholder="Altınordu" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Adres *</label>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Mahalle, cadde, no" />
                  </div>
                  <div>
                    <label className={labelCls}>Saha Sahibi</label>
                    <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                      <option value="">Sahipsiz (atanmadı)</option>
                      {ownerCandidates.map((o) => (
                        <option key={o.id} value={o.id}>{o.full_name || o.email || o.id.slice(0, 8)}</option>
                      ))}
                    </select>
                    {!isCreateMode && ownerId !== initialOwnerId && (
                      <p className="mt-1 text-[10px] font-bold text-amber-400">Sahiplik devri yalnız SUPER_ADMIN tarafından kaydedilebilir.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vitrin Açıklaması</label>
                      <span className={`text-[10px] font-bold ${descLen === 0 ? 'text-gray-600' : descLen < DESC_MIN ? 'text-red-400' : 'text-green-400'}`}>
                        {descLen}/{DESC_MAX} · en az {DESC_MIN}
                      </span>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                      rows={4}
                      className={`${inputCls} resize-none`}
                      placeholder="Zemin, aydınlatma, ulaşım ve öne çıkan imkanlar…"
                    />
                  </div>

                  <div className="pt-2">
                    <label className={`${labelCls} flex items-center gap-1.5`}><MapPin size={12} /> Konum Pini — vitrindeki mesafeler bu pinden hesaplanır</label>
                    <div className="h-72 rounded-2xl overflow-hidden border border-white/10">
                      <style>{OYNA_MAP_CSS}</style>
                      <MapContainer center={mapCenter} zoom={latLng ? 16 : 12} className="w-full h-full" {...oynaMapProps}>
                        <TileLayer url={OYNA_TILE_URL} {...oynaTileProps} />
                        <DraggablePin pos={mapCenter} onMove={(lat, lng) => setLatLng([Number(lat.toFixed(6)), Number(lng.toFixed(6))])} />
                      </MapContainer>
                    </div>
                    <p className={`mt-2 text-[11px] font-bold ${latLng ? 'text-green-400' : 'text-red-400'}`}>
                      {latLng ? `Pin: ${latLng[0].toFixed(5)}, ${latLng[1].toFixed(5)}` : 'Pin henüz yerleştirilmedi — vitrin için zorunlu'}
                    </p>
                  </div>

                  {!isCreateMode && (
                    <div className="flex items-center justify-between bg-black/30 border border-white/[0.06] rounded-xl p-4">
                      <div>
                        <p className="text-xs font-bold text-white">Tesis Aktif</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Pasif tesis rezervasyon alamaz.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsActive((v) => !v)}
                        className={`relative w-12 h-7 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${isActive ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'amenities' && (
                <>
                  <p className="text-xs text-gray-400">Vitrindeki "Tesis İmkanları" bölümünde görünür. Standart katalogdan seçin veya özel ekleyin.</p>
                  <div className="flex flex-wrap gap-2">
                    {AMENITY_CATALOG.map(({ value, icon: Icon }) => {
                      const active = amenities.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleAmenity(value)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            active
                              ? 'bg-green-500/15 border-green-500/40 text-green-300'
                              : 'bg-[#161B22] border-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          {active ? <Check size={12} /> : <Icon size={12} />}
                          {value}
                        </button>
                      );
                    })}
                  </div>
                  {customAmenities.length > 0 && (
                    <div>
                      <p className={labelCls}>Diğer</p>
                      <div className="flex flex-wrap gap-2">
                        {customAmenities.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleAmenity(item)}
                            className="px-4 py-2 rounded-xl text-xs font-bold border bg-green-500/10 border-green-500/30 text-green-300"
                          >
                            <Check size={12} className="inline mr-1" /> {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={customAmenity}
                      onChange={(e) => setCustomAmenity(e.target.value)}
                      placeholder="Özel olanak ekle"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = normalizeAmenity(customAmenity.trim());
                        if (!trimmed) return;
                        if (!amenities.includes(trimmed)) setAmenities((prev) => [...prev, trimmed]);
                        setCustomAmenity('');
                      }}
                      className="px-4 shrink-0 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl"
                    >
                      Ekle
                    </button>
                  </div>
                </>
              )}

              {activeTab === 'hours' && (
                <>
                  <p className="text-xs text-gray-400">Vitrindeki çalışma saatleri ve rezervasyon uygunluğu bu tabloya göre hesaplanır.</p>
                  <div className="space-y-2">
                    {hours.map((day, idx) => (
                      <div key={day.name} className={`flex items-center gap-3 bg-black/30 border border-white/[0.06] rounded-xl px-4 py-3 ${day.closed ? 'opacity-60' : ''}`}>
                        <span className="w-24 text-xs font-bold text-white shrink-0">{day.name}</span>
                        <input
                          type="time"
                          value={day.open}
                          disabled={day.closed}
                          onChange={(e) => setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, open: e.target.value } : d)))}
                          className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-40"
                        />
                        <span className="text-gray-600 text-xs">—</span>
                        <input
                          type="time"
                          value={day.close}
                          disabled={day.closed}
                          onChange={(e) => setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, close: e.target.value } : d)))}
                          className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-40"
                        />
                        <label className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!day.closed}
                            onChange={(e) => setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, closed: e.target.checked } : d)))}
                            className="accent-red-500"
                          />
                          Kapalı
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'courts' && id && (
                <div className="h-[calc(100vh-160px)] -m-2 rounded-2xl overflow-hidden border border-white/5">
                  <PitchManager
                    onBack={() => setActiveTab('identity')}
                    facilityId={id}
                    pitches={courts}
                    onUpdatePitches={(next) => { setCourts(next); setScoreRefresh((v) => v + 1); }}
                    maxCourts={MAX_COURTS}
                  />
                </div>
              )}

              {activeTab === 'tariffs' && id && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 max-w-md">
                      Vitrindeki fiyat ve kapora bu tarifelerden hesaplanır (SSOT: pitch_tariffs).
                      Fiyat/indirim üst sınırı yoktur; kapora tarifede tanımlanır.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTariffs((prev) => [...prev, newTariffRow(prev.length)])}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold rounded-xl shrink-0"
                    >
                      <Plus size={13} /> Tarife Ekle
                    </button>
                  </div>

                  {tariffs.length === 0 && tariffsLoaded && (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 text-xs text-amber-200">
                      Henüz tarife yok — vitrinde fiyat gösterilemez ve rezervasyon kaporası hesaplanamaz. En az bir tarife ekleyin.
                    </div>
                  )}

                  <div className="space-y-3">
                    {tariffs.map((t) => (
                      <div key={t.key} className={`bg-black/30 border rounded-2xl p-4 space-y-3 ${t.is_active === false ? 'border-white/[0.04] opacity-60' : 'border-white/[0.08]'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            value={t.name}
                            onChange={(e) => patchTariff(t.key, { name: e.target.value })}
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-red-500/40"
                            placeholder="Tarife adı"
                          />
                          <select
                            value={t.tariff_type}
                            onChange={(e) => patchTariff(t.key, { tariff_type: e.target.value as TariffRow['tariff_type'] })}
                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white"
                          >
                            <option value="WEEKDAY">Hafta İçi</option>
                            <option value="WEEKEND">Hafta Sonu</option>
                            <option value="HOLIDAY">Tatil</option>
                            <option value="SPECIAL">Özel</option>
                          </select>
                          <select
                            value={t.court_id ?? ''}
                            onChange={(e) => patchTariff(t.key, { court_id: e.target.value || null })}
                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white max-w-[140px]"
                            title="Kort kapsamı"
                          >
                            <option value="">Tüm kortlar</option>
                            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => setTariffs((prev) => prev.filter((x) => x.key !== t.key))}
                            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 shrink-0"
                            title="Tarifeyi sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {DAY_LABELS.map((label, i) => {
                            const day = i + 1;
                            const on = t.applies_to_days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleTariffDay(t.key, day)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                                  on ? 'bg-red-600/20 border-red-500/40 text-red-300' : 'bg-white/[0.03] border-white/10 text-gray-500'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className={labelCls}>Başlangıç</label>
                            <input type="time" value={t.start_time} onChange={(e) => patchTariff(t.key, { start_time: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white" />
                          </div>
                          <div>
                            <label className={labelCls}>Bitiş</label>
                            <input type="time" value={t.end_time} onChange={(e) => patchTariff(t.key, { end_time: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white" />
                          </div>
                          <div>
                            <label className={labelCls}>Saatlik Ücret (₺)</label>
                            <input type="number" min={0} value={t.price_per_hour || ''} onChange={(e) => patchTariff(t.key, { price_per_hour: Number(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" placeholder="2000" />
                          </div>
                          <div>
                            <label className={labelCls}>Kapora (₺)</label>
                            <input type="number" min={0} value={t.deposit_amount ?? 0} onChange={(e) => patchTariff(t.key, { deposit_amount: Number(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" placeholder="0" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* [K6] Saha bazlı iptal/iade politikası — oyuncunun ödeme/iptal ekranı buradan beslenir (SSOT) */}
                  <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white uppercase tracking-wide">İptal / İade Politikası</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                          Kapalıyken OYNA varsayılanı: ≥24s %100 · 6-24s %50 · &lt;6s iade yok. Oyuncu bu koşulları ödeme ve iptal ekranında görür.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRefundCustom((v) => !v)}
                        className={`shrink-0 w-12 h-7 rounded-full relative transition-colors ${refundCustom ? 'bg-emerald-500' : 'bg-gray-600'}`}
                        title="Özel politika"
                      >
                        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${refundCustom ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                    {refundCustom && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Tam iade (saat)</label>
                          <input type="number" min={0} max={720} value={refundFull} onChange={(e) => setRefundFull(Number(e.target.value) || 0)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" />
                        </div>
                        <div>
                          <label className={labelCls}>Yarım iade (saat)</label>
                          <input type="number" min={0} max={720} value={refundHalf} onChange={(e) => setRefundHalf(Number(e.target.value) || 0)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" />
                        </div>
                        <div>
                          <label className={labelCls}>Yarım iade (%)</label>
                          <input type="number" min={0} max={100} value={refundPct} onChange={(e) => setRefundPct(Number(e.target.value) || 0)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-gray-600">
                        {refundCustom
                          ? `≥${refundFull}s → %100 · ${refundHalf}-${refundFull}s → %${refundPct} · <${refundHalf}s → iade yok`
                          : 'Global varsayılan kullanılıyor.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleSaveRefundPolicy()}
                        disabled={savingRefund}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold rounded-xl disabled:opacity-50"
                      >
                        {savingRefund ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Politikayı Kaydet
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="bg-black/30 border border-white/[0.06] rounded-xl p-4">
                      <label className={labelCls}>Varsayılan Maç Fiyatı (₺) — maç açma akışında taban</label>
                      <input
                        type="number"
                        min={0}
                        value={pricePerMatch || ''}
                        onChange={(e) => setPricePerMatch(Number(e.target.value))}
                        className={inputCls}
                        placeholder="3000"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveTariffs()}
                        disabled={savingTariffs}
                        className="w-full flex items-center justify-center gap-2 h-11 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl disabled:opacity-50"
                      >
                        {savingTariffs ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Tarifeleri Kaydet
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'photos' && id && (
                <>
                  <p className="text-xs text-gray-400">
                    Tesis vitrin galerisi — ilk fotoğraf kapaktır. Kort bazlı fotoğraflar Kortlar sekmesindeki kort editöründen yüklenir.
                  </p>
                  <PhotoManager
                    pitchId={id}
                    onError={(m) => toastError(m)}
                    onChanged={() => setScoreRefresh((v) => v + 1)}
                  />
                </>
              )}

              {activeTab === 'showcase' && id && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">Vitrinde Göster</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kapalıyken oyuncular tesisi görmez; mevcut rezervasyonlar etkilenmez.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleTogglePublished()}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${isPublished ? 'bg-green-500' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${isPublished ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5"><Star size={14} className="text-[#FFFF00]" /> Öne Çıkar</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kartta sarı "Öne Çıkan" rozeti gösterilir.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleShowcaseFlag('is_featured', isFeatured, setIsFeatured, ['Tesis öne çıkarıldı.', 'Öne çıkarma kaldırıldı.'])}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${isFeatured ? 'bg-[#FFFF00]' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${isFeatured ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5"><Percent size={14} className="text-[#FF3B30]" /> Flash İndirim Rozeti</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kapalıyken tesisin flash kampanyaları vitrine yansımaz.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleShowcaseFlag('flash_deals_enabled', flashEnabled, setFlashEnabled, ['Flash indirim rozeti açıldı.', 'Flash indirim rozeti kapatıldı.'])}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${flashEnabled ? 'bg-[#FF3B30]' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${flashEnabled ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5"><Clock size={14} className="text-[#39FF14]" /> Müsaitlik Rozeti</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kartta "Bugün X saat müsait / dolu" rozeti gösterilir.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleShowcaseFlag('show_availability_badge', availabilityBadge, setAvailabilityBadge, ['Müsaitlik rozeti açıldı.', 'Müsaitlik rozeti kapatıldı.'])}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${availabilityBadge ? 'bg-[#39FF14]' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${availabilityBadge ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5">
                    <label className={`${labelCls} flex items-center gap-1.5`}><ShieldCheck size={12} /> Doğrulama Durumu</label>
                    <div className="flex gap-2">
                      {([
                        { v: 'approved', label: 'Onaylı', cls: 'bg-green-500/15 border-green-500/40 text-green-300' },
                        { v: 'pending', label: 'İncelemede', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300' },
                        { v: 'rejected', label: 'Reddedildi', cls: 'bg-red-500/15 border-red-500/40 text-red-300' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => void handleVerificationChange(opt.v)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            verificationStatus === opt.v ? opt.cls : 'bg-white/[0.03] border-white/10 text-gray-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2">
                      Onaylı tesiste owner'ın ad/konum değişiklikleri admin onayına düşer (kimlik koruması).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FFFF00]/10 border border-[#FFFF00]/40 text-[#FFFF00] text-xs font-black uppercase tracking-wider"
                  >
                    <Eye size={15} /> Oyuncu Gözüyle Önizle
                  </button>

                  <ShowcaseScoreCard
                    pitchId={id}
                    refreshKey={scoreRefresh}
                    onTaskClick={(key) => {
                      if (key === 'photos') setActiveTab('photos');
                      else if (key === 'description' || key === 'pin') setActiveTab('identity');
                      else if (key === 'amenities') setActiveTab('amenities');
                      else if (key === 'court') setActiveTab('courts');
                      else if (key === 'tariff') setActiveTab('tariffs');
                    }}
                  />
                </>
              )}

              {activeTab === 'schedule' && id && (
                <>
                  {/* Gün gezgini */}
                  <div className="flex items-center justify-between bg-black/30 border border-white/[0.06] rounded-2xl px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => stepScheduleDate(-1)}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center transition-colors"
                      aria-label="Önceki gün"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="text-center min-w-0">
                      <p className="text-sm font-black text-white capitalize truncate">{scheduleDateLabel}</p>
                      {scheduleDateISO !== localDateISO() && (
                        <button
                          type="button"
                          onClick={() => setScheduleDateISO(localDateISO())}
                          className="text-[10px] font-bold text-red-400 hover:text-red-300"
                        >
                          Bugüne dön
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => stepScheduleDate(1)}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center transition-colors"
                      aria-label="Sonraki gün"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {scheduleLoading ? (
                    <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 size={18} className="animate-spin" /></div>
                  ) : scheduleError ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-red-400 font-bold mb-3">{scheduleError}</p>
                      <button onClick={() => void loadSchedule()} className="text-xs text-red-400 font-bold inline-flex items-center gap-1.5"><RefreshCcw size={12} /> Tekrar dene</button>
                    </div>
                  ) : !scheduleGrid || scheduleGrid.courts.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-sm">Bu tesiste aktif kort yok. Önce “Kortlar” sekmesinden ekleyin.</div>
                  ) : scheduleGrid.closed ? (
                    <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-2"><Lock size={20} /> Tesis bu gün kapalı.</div>
                  ) : (
                    <div className="bg-black/20 border border-white/[0.06] rounded-2xl p-3">
                      <FacilityScheduleGrid grid={scheduleGrid} interactive={false} />
                    </div>
                  )}
                  <p className="text-[10px] text-gray-600 leading-relaxed px-1">
                    Yalnız gözetim: rezervasyonlar, doluluk, kapanışlar ve canlı hold'lar burada görüntülenir.
                    Değişiklik owner panelinden yapılır.
                  </p>
                </>
              )}

              {activeTab === 'finance' && id && (
                <>
                  {/* Ay gezgini */}
                  <div className="flex items-center justify-between bg-black/30 border border-white/[0.06] rounded-2xl px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setFinanceMonth((m) => shiftMonth(m, -1))}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center transition-colors"
                      aria-label="Önceki ay"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="text-center min-w-0">
                      <p className="text-sm font-black text-white truncate">{monthLabel(financeMonth)}</p>
                      {financeMonth !== localDateISO().slice(0, 7) && (
                        <button
                          type="button"
                          onClick={() => setFinanceMonth(localDateISO().slice(0, 7))}
                          className="text-[10px] font-bold text-red-400 hover:text-red-300"
                        >
                          Bu aya dön
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { const n = shiftMonth(financeMonth, 1); if (!isMonthAfter(n, localDateISO().slice(0, 7))) setFinanceMonth(n); }}
                      disabled={isMonthAfter(shiftMonth(financeMonth, 1), localDateISO().slice(0, 7))}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center transition-colors disabled:opacity-30"
                      aria-label="Sonraki ay"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {financeLoading ? (
                    <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 size={18} className="animate-spin" /></div>
                  ) : financeError ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-red-400 font-bold mb-3">{financeError}</p>
                      <button onClick={() => void loadFinance()} className="text-xs text-red-400 font-bold inline-flex items-center gap-1.5"><RefreshCcw size={12} /> Tekrar dene</button>
                    </div>
                  ) : finance ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Tahsilat', value: money(finance.income.collected_total), cls: 'text-emerald-400' },
                          { label: 'Gider', value: money(finance.expenses.total), cls: 'text-red-400' },
                          { label: 'Dönem Bakiyesi', value: money(finance.income.collected_total - finance.expenses.total), cls: 'text-white' },
                          { label: 'Bekleyen + Veresiye', value: `${money(finance.income.pending_total)} + ${money(finance.debt.open_total)}`, cls: 'text-amber-400' },
                        ].map((s) => (
                          <div key={s.label} className="bg-black/30 border border-white/[0.06] rounded-2xl p-4">
                            <p className="text-[10px] text-gray-500 font-black uppercase mb-1">{s.label}</p>
                            <p className={`text-lg font-black ${s.cls}`}>{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {finance.income.mismatch_count > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3">
                          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-300 font-bold">
                            {finance.income.mismatch_count} rezervasyonda tahsilat–ödeme kaydı uyuşmuyor (paid_amount ≠ Σ ödemeler).
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5">
                          <p className="text-[10px] text-gray-500 font-black uppercase mb-3">Ödeme Yöntemi</p>
                          <BreakdownList
                            rows={finance.income.by_method.map((m) => ({ key: m.method, label: methodLabel(m.method), amount: m.amount, count: m.count }))}
                            total={finance.income.collected_total}
                            color="#EF4444"
                            emptyText="Bu ay tahsilat yok."
                          />
                        </div>
                        <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5">
                          <p className="text-[10px] text-gray-500 font-black uppercase mb-3">Son Ödemeler</p>
                          {finance.income.recent_payments.length === 0 ? (
                            <p className="text-sm text-gray-500">Bu ay ödeme kaydı yok.</p>
                          ) : (
                            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                              {finance.income.recent_payments.map((p) => (
                                <div key={p.id} className="flex justify-between items-center text-sm">
                                  <span className="text-gray-300 truncate">{p.customer_name ?? 'Müşteri'}<span className="text-gray-600"> · {p.booking_date}</span></span>
                                  <span className="text-white font-bold tabular-nums shrink-0">{money(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-600 leading-relaxed px-1">
                        Yalnız gözetim: aynı get_pitch_finance_summary RPC'si (owner ile tek doğruluk kaynağı).
                        Kayıt düzenleme owner panelinden yapılır.
                      </p>
                    </>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showPreview && id && <ShowcasePreview pitchId={id} onClose={() => setShowPreview(false)} />}
    </div>
  );
};
