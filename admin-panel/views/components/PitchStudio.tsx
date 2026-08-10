/**
 * Saha Kurulum Merkezi — admin vitrin editörü.
 * Oyuncu uygulamasındaki Saha Vitrini'nde görünen HER ŞEY buradan kurulur ve
 * yönetilir: kimlik + konum pini, olanaklar, çalışma saatleri, kortlar,
 * tarifeler, fotoğraflar (pitch_media) ve yayın/öne çıkarma.
 * Owner tarafıyla aynı altyapıyı (PhotoManager, ShowcaseScoreCard,
 * ShowcasePreview, saveTariffs, upsertCourt) paylaşır — iki ayrı model yok.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ALLOWED_SLOT_MINUTES, buildSlotGrid, slotLabel } from '../../../shared/slotGrid';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, MapPin, Building2, Clock, LayoutGrid, Wallet, Image as ImageIcon,
  Sparkles, Check, Eye, Star, Lock, Loader2, Plus, Trash2, ShieldCheck, Percent,
  CalendarClock, CalendarCheck, ChevronLeft, ChevronRight, RefreshCcw, Coins, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { getFacilitySchedule, type FacilitySchedule } from '../../../services/facilitySchedule';
import { buildFacilityDayGrid } from '../../../shared/facilityScheduleModel';
import { FacilityScheduleGrid } from '../../../shared/FacilityScheduleGrid';
import { getPitchFinanceSummary, type FinanceSummary } from '../../../services/financeService';
import { monthLabel, shiftMonth, isMonthAfter, methodLabel } from '../../../shared/financeModel';
import { money, BreakdownList } from '../../../views/owner/finance/financeUi';
import { localDateISO } from '../../../views/owner/ownerCalendarHelpers';
import {
  createPitchAdmin, updatePitchAdmin, listOwnerCandidatesAdmin, fetchProfileById,
  fetchPitchTeamAdmin, setPitchStaffAdmin, removePitchStaffAdmin, searchStaffCandidatesAdmin,
  STAFF_ROLE_LABELS, toTurkishAdminError,
  type OwnerCandidate, type PitchTeam, type PitchStaffRole,
} from '../../services/adminService';
import { getTariffs, saveTariffs, getPitchRefundPolicy, setPitchRefundPolicy, type TariffInput } from '../../../services/pitchOwnerService';
import { setPitchPublished, setPitchShowcaseFlags, type PitchShowcaseFlags } from '../../../services/pitchContentService';
import { AMENITY_CATALOG, normalizeAmenity } from '../../../shared/amenities';
import PhotoManager from '../../../components/pitch-editor/PhotoManager';
import ShowcaseScoreCard from '../../../components/pitch-editor/ShowcaseScoreCard';
import ShowcasePreview from '../../../components/pitch-editor/ShowcasePreview';
import { PitchManager } from '../../../views/owner/PitchManager';
import { useAdminToast } from '../context/AdminToastContext';
import { DEFAULT_WORKING_DAYS, type OwnerWorkingDay } from '../../../views/owner/menu/ownerMenuTypes';
import { ORDU_CENTER } from '../../../utils/orduData';
import { OYNA_TILE_URL, oynaTileProps, oynaMapProps, OYNA_MAP_CSS } from '../../../components/map/mapBase';
import type { Pitch, PitchCourt } from '../../../types';
// Canlı Ayna: oyuncu vitrini kartı + eşleyicisi TEK KAYNAK'tan (drift yok).
import { PITCH_SHOWCASE_SELECT, mapDbPitchToUiPitch, type DbPitchRow } from '../../../shared/pitchShowcaseMapper';
import { PitchShowcaseCard } from '../../../components/pitch-showcase/PitchShowcaseCard';

interface PitchStudioProps {
  /** null → yeni tesis kurulumu; string → mevcut tesis düzenleme */
  pitchId: string | null;
  onClose: () => void;
  /** Liste yenilemesi için — oluşturma ve kayıt sonrası çağrılır */
  onSaved: () => void;
}

type StudioTab = 'identity' | 'amenities' | 'hours' | 'courts' | 'team' | 'tariffs' | 'photos' | 'showcase' | 'schedule' | 'finance';

const DESC_MIN = 40;
const DESC_MAX = 500;

/** Saha sahibi adayı için görünen ad — ad yoksa e-posta, o da yoksa kısa id. */
const ownerLabel = (o: OwnerCandidate) =>
  o.full_name?.trim() || o.name?.trim() || o.email?.trim() || o.id.slice(0, 8);
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

/**
 * Admin de sahip gibi hangi saatlerin oluşacağını görsün (A3a). Izgara sahip
 * paneli ve kullanıcı ekranıyla AYNI kaynaktan (shared/slotGrid) üretilir.
 */
const tariffSlotPreview = (t: TariffRow): string => {
  const grid = buildSlotGrid(
    [{
      start_time: t.start_time,
      end_time: t.end_time,
      slot_minutes: t.slot_minutes ?? 60,
      applies_to_days: [1, 2, 3, 4, 5, 6, 7],
      tariff_type: t.tariff_type,
      slot_price: t.slot_price,
    }],
    '2026-01-05',
  );
  if (grid.length === 0) return '';
  const shown = grid.slice(0, 3).map(slotLabel).join(' · ');
  return grid.length > 3 ? `${shown} … (${grid.length} slot)` : `${shown} (${grid.length} slot)`;
};

const newTariffRow = (idx: number): TariffRow => ({
  key: `t_${Date.now()}_${idx}`,
  name: idx === 0 ? 'Standart' : `Tarife ${idx + 1}`,
  tariff_type: 'WEEKDAY',
  applies_to_days: [1, 2, 3, 4, 5],
  start_time: '08:00',
  end_time: '23:00',
  slot_price: 0,
  slot_minutes: 60,
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
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerSearching, setOwnerSearching] = useState(false);

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
  const [bookingDisabledAdmin, setBookingDisabledAdmin] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [scoreRefresh, setScoreRefresh] = useState(0);

  // ── Canlı Ayna: oyuncunun Saha Keşfet'te gördüğü kartın birebir aynası ──
  // Oyuncu tarafıyla AYNI sorgu + AYNI eşleyici; yalnız görünürlük filtreleri yok
  // (admin onaysız/gizli sahayı da görmeli — teşhis şeridi durumu ayrıca söyler).
  const [mirrorPitch, setMirrorPitch] = useState<Pitch | null>(null);
  const [mirrorRow, setMirrorRow] = useState<{
    is_open: boolean | null;
    is_published: boolean | null;
  } | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorRefresh, setMirrorRefresh] = useState(0);

  // Mevcut tesis: canlı veriyi yükle
  useEffect(() => {
    if (!pitchId) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('pitches')
        .select('name, map_label, city, district, address, latitude, longitude, description, amenities, working_hours, is_published, is_featured, flash_deals_enabled, show_availability_badge, booking_disabled_by_admin, is_active, price_per_match, owner_id')
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
      setBookingDisabledAdmin((data as { booking_disabled_by_admin?: boolean | null }).booking_disabled_by_admin === true);
      setIsActive(data.is_active !== false);
      setPricePerMatch(Number(data.price_per_match ?? 0));
      setOwnerId((data.owner_id as string | null) ?? '');
      setInitialOwnerId((data.owner_id as string | null) ?? '');
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId]);

  // Saha sahibi adayları. Arama boşken mevcut OWNER'lar, yazıldıkça tüm
  // kullanıcılar içinde ad/e-posta/telefon araması (ülke geneli ölçek).
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void (async () => {
        setOwnerSearching(true);
        try {
          const owners = await listOwnerCandidatesAdmin(ownerQuery);
          if (alive) setOwnerCandidates(owners);
        } catch {
          /* sessiz geç — arama başarısızsa liste boş kalır */
        } finally {
          if (alive) setOwnerSearching(false);
        }
      })();
    }, ownerQuery.trim() ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [ownerQuery]);

  // Seçili sahibin adı listede yoksa (düzenleme modunda arama sıfırlanınca)
  // ayrıca çekilir ki "Seçili: —" gibi yalan bir görüntü çıkmasın.
  useEffect(() => {
    if (!ownerId || ownerCandidates.some((o) => o.id === ownerId)) return;
    let alive = true;
    void (async () => {
      const p = await fetchProfileById(ownerId).catch(() => null);
      if (alive && p) {
        setOwnerCandidates((prev) => prev.some((o) => o.id === p.id) ? prev : [
          { id: p.id, full_name: p.name, name: p.name, email: p.email, phone: p.phone ?? null, is_owner: true },
          ...prev,
        ]);
      }
    })();
    return () => { alive = false; };
  }, [ownerId, ownerCandidates]);

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
        slot_price: t.slot_price,
        slot_minutes: t.slot_minutes ?? 60,
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

  // ── Yetkililer (Sahip · Müdür · Personel) ──
  const [team, setTeam] = useState<PitchTeam | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<OwnerCandidate[]>([]);
  const [staffSearching, setStaffSearching] = useState(false);
  const [staffRole, setStaffRole] = useState<PitchStaffRole>('STAFF');
  const [staffBusyId, setStaffBusyId] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!id) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      setTeam(await fetchPitchTeamAdmin(id));
    } catch (err) {
      setTeamError(toTurkishAdminError(err));
    } finally {
      setTeamLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'team' && id) void loadTeam();
  }, [activeTab, id, loadTeam]);

  // Yetkili adayı arama — en az 2 harf, 300 ms bekleme (her tuşta sorgu atmaz).
  useEffect(() => {
    if (activeTab !== 'team') return;
    const q = staffQuery.trim();
    if (q.length < 2) { setStaffResults([]); return; }
    let alive = true;
    setStaffSearching(true);
    const t = setTimeout(() => {
      void searchStaffCandidatesAdmin(q)
        .then((rows) => { if (alive) setStaffResults(rows); })
        .catch(() => { if (alive) setStaffResults([]); })
        .finally(() => { if (alive) setStaffSearching(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [staffQuery, activeTab]);

  const assignStaff = async (userId: string) => {
    if (!id) return;
    setStaffBusyId(userId);
    try {
      await setPitchStaffAdmin(id, userId, staffRole);
      success(`${STAFF_ROLE_LABELS[staffRole]} yetkisi verildi.`);
      setStaffQuery('');
      setStaffResults([]);
      await loadTeam();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setStaffBusyId(null);
    }
  };

  const changeStaffRole = async (userId: string | null, role: PitchStaffRole) => {
    if (!id || !userId) {
      toastError('Bu kayda bağlı bir uygulama hesabı yok — önce hesabı bağlayın.');
      return;
    }
    setStaffBusyId(userId);
    try {
      await setPitchStaffAdmin(id, userId, role);
      success(`Yetki ${STAFF_ROLE_LABELS[role]} olarak güncellendi.`);
      await loadTeam();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setStaffBusyId(null);
    }
  };

  const removeStaff = async (memberId: string, adi: string) => {
    setStaffBusyId(memberId);
    try {
      await removePitchStaffAdmin(memberId);
      success(`${adi} tesisin yetkilileri arasından çıkarıldı.`);
      await loadTeam();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setStaffBusyId(null);
    }
  };

  // Canlı Ayna: oyuncu vitrinindeki AYNI sorgudan beslenir (PITCH_SHOWCASE_SELECT +
  // mapDbPitchToUiPitch). verification/is_open/is_published filtreleri BİLEREK yok —
  // ham durum teşhis şeridinde gösterilir.
  const loadMirror = useCallback(async () => {
    if (!id) return;
    setMirrorLoading(true); setMirrorError(null);
    try {
      const { data, error } = await supabase
        .from('pitches')
        .select(PITCH_SHOWCASE_SELECT)
        .eq('id', id)
        .single();
      if (error || !data) throw error ?? new Error('Tesis bulunamadı.');
      const row = data as unknown as DbPitchRow & {
        is_open?: boolean | null;
      };
      setMirrorRow({
        is_open: row.is_open ?? null,
        is_published: row.is_published ?? null,
      });
      setMirrorPitch(mapDbPitchToUiPitch(row));
    } catch (e) {
      setMirrorError(toTurkishAdminError(e));
    } finally {
      setMirrorLoading(false);
    }
  }, [id]);

  // Sekme her açılışta + kayıt/tazeleme sonrası (mirrorRefresh) yeniden yüklenir.
  useEffect(() => {
    if (activeTab === 'showcase' && id) void loadMirror();
  }, [activeTab, id, mirrorRefresh, loadMirror]);

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
  // Sahipsiz tesis yok: OLUŞTURMADA sahip seçimi de zorunlu.
  // Düzenlemede zorunlu tutulmaz — sahiplik devri SUPER_ADMIN'e kilitli olduğu için
  // MODERATOR eski sahipsiz bir kaydı hiç kaydedemez hale gelirdi. O kayıtları
  // vitrinden `pitches_published_needs_owner` kısıtı zaten dışarıda tutuyor.
  const identityValid = name.trim().length >= 3 && district.trim().length >= 2
    && address.trim().length >= 5 && (!isCreateMode || ownerId.trim().length > 0);
  const selectedOwner = useMemo(
    () => ownerCandidates.find((o) => o.id === ownerId) ?? null,
    [ownerCandidates, ownerId],
  );

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
      toastError(
        isCreateMode && ownerId.trim().length === 0
          ? 'Tesis sahibi zorunludur — sahipsiz tesis oluşturulamaz.'
          : 'Tesis adı, ilçe ve adres zorunludur.',
      );
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
      setMirrorRefresh((v) => v + 1);
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
      if (!(t.slot_price > 0)) { toastError(`"${t.name}" tarifesinde slot ücreti 0'dan büyük olmalı.`); return; }
      if ((t.deposit_amount ?? 0) < 0) { toastError(`"${t.name}" tarifesinde kapora negatif olamaz.`); return; }
    }
    setSavingTariffs(true);
    try {
      await saveTariffs(id, tariffs.map(({ key: _key, ...t }, idx) => ({ ...t, sort_order: idx })));
      await updatePitchAdmin(id, { price_per_match: pricePerMatch });
      success('Tarifeler kaydedildi.');
      setScoreRefresh((v) => v + 1);
      setMirrorRefresh((v) => v + 1);
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
    // Sahipsiz tesis vitrine çıkamaz (DB'de pitches_published_needs_owner kısıtı
    // zaten engelliyor; burada kullanıcıya sebebini önden söylüyoruz).
    if (next && !ownerId) {
      toastError('Bu tesisin sahibi yok. Vitrine çıkarmadan önce Kimlik sekmesinden sahip ata.');
      setActiveTab('identity');
      return;
    }
    setIsPublished(next);
    try {
      await setPitchPublished(id, next);
      success(next ? 'Tesis vitrinde görünür.' : 'Tesis vitrinden gizlendi.');
      setMirrorRefresh((v) => v + 1);
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
      setMirrorRefresh((v) => v + 1);
      onSaved();
    } catch (err) {
      setLocal(cur);
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
    { id: 'team', label: 'Yetkililer', icon: ShieldCheck, requiresId: true },
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
      <div className="h-14 shrink-0 bg-surface-1 border-b border-white/5 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
            <Building2 size={15} className="text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-white truncate">
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
              className="flex items-center gap-2 h-9 px-5 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold uppercase rounded-xl disabled:opacity-50 transition-colors"
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
                    <label className={labelCls}>Saha Sahibi *</label>
                    {selectedOwner ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{ownerLabel(selectedOwner)}</p>
                          <p className="truncate text-[10px] text-gray-400">{selectedOwner.email || selectedOwner.phone || selectedOwner.id.slice(0, 8)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setOwnerId(''); setOwnerQuery(''); }}
                          className="shrink-0 text-[10px] font-bold text-gray-400 hover:text-white"
                        >
                          Değiştir
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={ownerQuery}
                          onChange={(e) => setOwnerQuery(e.target.value)}
                          className={inputCls}
                          placeholder="Ad, e-posta veya telefon ile ara…"
                        />
                        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
                          {ownerSearching && <p className="px-3 py-2 text-[11px] text-gray-500">Aranıyor…</p>}
                          {!ownerSearching && ownerCandidates.length === 0 && (
                            <p className="px-3 py-2 text-[11px] text-gray-500">
                              {ownerQuery.trim()
                                ? 'Eşleşen kullanıcı yok. Tesis sahibinin önce uygulamaya kayıt olması gerekir.'
                                : 'Henüz tesis sahibi rolünde kullanıcı yok — yukarıdan arayarak herhangi bir kullanıcıyı seçebilirsin.'}
                            </p>
                          )}
                          {!ownerSearching && ownerCandidates.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => { setOwnerId(o.id); setOwnerQuery(''); }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-bold text-white">{ownerLabel(o)}</span>
                                <span className="block truncate text-[10px] text-gray-500">{o.email || o.phone || o.id.slice(0, 8)}</span>
                              </span>
                              {o.is_owner && <span className="shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">TESİS SAHİBİ</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="mt-1 text-[10px] text-gray-500">
                      Sahipsiz tesis oluşturulamaz. Seçilen kullanıcıya tesis sahibi yetkisi otomatik verilir.
                    </p>
                    {!isCreateMode && ownerId !== initialOwnerId && (
                      <p className="mt-1 text-[10px] font-bold text-amber-400">Sahiplik devri yalnız SUPER_ADMIN tarafından kaydedilebilir.</p>
                    )}
                    {!isCreateMode && !ownerId && (
                      <p className="mt-1 text-[10px] font-bold text-red-400">
                        Bu tesisin sahibi yok; sahip atanana kadar vitrinde görünmez.
                      </p>
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
                              : 'bg-surface-1 border-white/5 text-gray-400 hover:text-white'
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
                      <br />
                      {/* A1a: admin de tarife girebilir. A2a: rezervasyon varken slot
                          süresi zorlanamaz — sunucu reddeder. Yayın kuralı saha bazlı. */}
                      <b className="text-amber-300">
                        Bir sahanın yayına alınabilmesi için o sahaya (korta) ait en az bir tarife
                        şarttır — &quot;Tüm kortlar&quot; kapsamı yayın kapısını açmaz.
                      </b>
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
                      Henüz tarife yok — vitrinde fiyat gösterilemez, rezervasyon kaporası hesaplanamaz ve hiçbir saha yayına alınamaz. Her saha için ayrı tarife ekleyin.
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
                            <option value="">Tüm kortlar (yedek — yayın açmaz)</option>
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
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition-colors ${
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
                            <label className={labelCls}>{t.slot_minutes ?? 60} Dakikalık Ücret (₺)</label>
                            <input type="number" min={0} value={t.slot_price || ''} onChange={(e) => patchTariff(t.key, { slot_price: Number(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" placeholder="2000" />
                          </div>
                          <div>
                            <label className={labelCls}>Kapora (₺)</label>
                            <input type="number" min={0} value={t.deposit_amount ?? 0} onChange={(e) => patchTariff(t.key, { deposit_amount: Number(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white font-mono" placeholder="0" />
                          </div>
                        </div>

                        {/* SLOT SÜRESİ — ızgarayı bu belirler; sahip panelindeki
                            seçicinin aynısı. Rezervasyon bulunan saatte sunucu
                            değişikliği SLOT_MINUTES_LOCKED ile reddeder (A2a). */}
                        <div className="mt-3">
                          <label className={labelCls}>Maç / Kiralama Süresi</label>
                          <div className="flex gap-2 mt-1">
                            {ALLOWED_SLOT_MINUTES.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => patchTariff(t.key, { slot_minutes: m })}
                                className={`flex-1 py-2 rounded-lg text-[11px] font-extrabold transition-colors ${
                                  (t.slot_minutes ?? 60) === m
                                    ? 'bg-emerald-500 text-black'
                                    : 'bg-black/40 border border-white/10 text-gray-400 hover:text-white'
                                }`}
                              >
                                {m} dk
                              </button>
                            ))}
                          </div>
                          {tariffSlotPreview(t) && (
                            <p className="text-[10.5px] text-gray-500 mt-2 leading-relaxed">
                              Oluşacak saatler: <span className="text-gray-300 font-semibold">{tariffSlotPreview(t)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* [K6] Saha bazlı iptal/iade politikası — oyuncunun ödeme/iptal ekranı buradan beslenir (SSOT) */}
                  <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-white uppercase tracking-wide">İptal / İade Politikası</p>
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
                        className="w-full flex items-center justify-center gap-2 h-11 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold uppercase rounded-xl disabled:opacity-50"
                      >
                        {savingTariffs ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Tarifeleri Kaydet
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'team' && id && (
                <>
                  {/* IP-22: tesisin yetkilileri buradan belirlenir. ÜÇ düzey vardır ve
                      hepsi tek tanımdan gelir — Sahip tesise, Müdür ve Personel ekibe. */}
                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 space-y-1.5">
                    <p className="text-sm font-extrabold text-white">Bu tesiste kim ne yapabilir?</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      <strong className="text-white">Sahip</strong> — tesisin tamamı: finans, banka hesabı, para çekme, ekip.
                      Kimlik &amp; Konum sekmesinden atanır, tesiste tek kişidir.<br />
                      <strong className="text-white">Müdür</strong> — günlük yönetim: takvim, rezervasyon, tarife, ekip listesi. Para çekemez.<br />
                      <strong className="text-white">Personel</strong> — kasa işleri: rezervasyon açma, tahsilat, görevler. Finans ve ekip kapalı.
                    </p>
                  </div>

                  {teamError && (
                    <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5">
                      <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-300 font-bold">{teamError}</p>
                    </div>
                  )}

                  {/* Sahip */}
                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5">
                    <label className={`${labelCls} flex items-center gap-1.5`}><ShieldCheck size={12} /> Sahip</label>
                    {teamLoading && !team ? (
                      <div className="flex items-center gap-2 text-gray-500 text-xs py-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</div>
                    ) : team?.owner ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{team.owner.name}</p>
                          <p className="text-[11px] text-gray-500 truncate">{team.owner.email || team.owner.phone || '—'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('identity')}
                          className="shrink-0 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-bold"
                        >
                          Sahibi değiştir
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-amber-300 font-bold">
                          Bu tesisin sahibi yok — sahipsiz tesis vitrine çıkarılamaz.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('identity')}
                          className="shrink-0 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold"
                        >
                          Sahip ata
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Yeni yetkili ekle */}
                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 space-y-3">
                    <label className={`${labelCls} flex items-center gap-1.5`}><Plus size={12} /> Yetkili Ekle</label>
                    <div className="flex gap-2">
                      {(['MANAGER', 'STAFF'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setStaffRole(r)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            staffRole === r
                              ? 'bg-red-500/15 border-red-500/40 text-red-300'
                              : 'bg-white/[0.03] border-white/10 text-gray-500'
                          }`}
                        >
                          {STAFF_ROLE_LABELS[r]}
                        </button>
                      ))}
                    </div>
                    <input
                      value={staffQuery}
                      onChange={(e) => setStaffQuery(e.target.value)}
                      placeholder="Ad, e-posta veya telefonla kullanıcı ara (en az 2 harf)…"
                      className={inputCls}
                    />
                    {staffSearching && (
                      <p className="text-[11px] text-gray-500 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Aranıyor…</p>
                    )}
                    {!staffSearching && staffQuery.trim().length >= 2 && staffResults.length === 0 && (
                      <p className="text-[11px] text-gray-500">Eşleşen kullanıcı bulunamadı. Kişinin OYNA hesabı olması gerekir.</p>
                    )}
                    {staffResults.length > 0 && (
                      <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 divide-y divide-white/5">
                        {staffResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={staffBusyId === c.id}
                            onClick={() => void assignStaff(c.id)}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-white truncate">{ownerLabel(c)}</span>
                              <span className="block text-[10px] text-gray-500 truncate">{c.email || c.phone || c.id.slice(0, 8)}</span>
                            </span>
                            <span className="shrink-0 text-[10px] font-extrabold uppercase text-red-300">
                              {staffBusyId === c.id ? '…' : `${STAFF_ROLE_LABELS[staffRole]} yap`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mevcut yetkililer */}
                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className={`${labelCls} mb-0`}>Müdürler ve Personel ({team?.members.length ?? 0})</label>
                      <button
                        type="button"
                        onClick={() => void loadTeam()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] font-bold uppercase"
                      >
                        <RefreshCcw size={11} className={teamLoading ? 'animate-spin' : ''} /> Yenile
                      </button>
                    </div>
                    {teamLoading && !team ? (
                      <div className="flex items-center justify-center py-8 text-gray-500"><Loader2 size={16} className="animate-spin" /></div>
                    ) : (team?.members.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-gray-500 py-4 text-center">
                        Bu tesise henüz müdür veya personel atanmadı.
                      </p>
                    ) : (
                      <div className="rounded-xl border border-white/10 divide-y divide-white/5">
                        {(team?.members ?? []).map((m) => (
                          <div key={m.member_id} className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{m.name}</p>
                              <p className="text-[10px] text-gray-500 truncate">
                                {m.email || m.phone || '—'}
                                {!m.linked && <span className="text-amber-400"> · uygulama hesabı bağlı değil</span>}
                                {m.linked && m.account_status !== 'ACTIVE' && <span className="text-amber-400"> · girişi aktif değil</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {(['MANAGER', 'STAFF'] as const).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  disabled={staffBusyId === (m.user_id ?? m.member_id) || m.staff_role === r}
                                  onClick={() => void changeStaffRole(m.user_id, r)}
                                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border transition-colors disabled:cursor-default ${
                                    m.staff_role === r
                                      ? 'bg-red-500/15 border-red-500/40 text-red-300'
                                      : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white'
                                  }`}
                                >
                                  {STAFF_ROLE_LABELS[r]}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={staffBusyId === m.member_id}
                                onClick={() => void removeStaff(m.member_id, m.name)}
                                title="Yetkiyi kaldır"
                                className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                  {/* ── CANLI AYNA: oyuncunun Saha Keşfet'te gördüğü vitrin kartının birebir aynası ──
                      Aynı sorgu (PITCH_SHOWCASE_SELECT) + aynı eşleyici + aynı kart bileşeni;
                      teşhis şeridi ve köprü çipleri kartın DIŞINDA kalır (karta admin-özel görsel yok). */}
                  <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Eye size={12} /> Canlı Ayna — Oyuncu Vitrini Kartı
                      </p>
                      <button
                        type="button"
                        onClick={() => setMirrorRefresh((v) => v + 1)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] font-bold uppercase tracking-wide transition-colors shrink-0"
                      >
                        <RefreshCcw size={11} className={mirrorLoading ? 'animate-spin' : ''} /> Aynayı Yenile
                      </button>
                    </div>

                    {/* Görünürlük teşhisi: oyuncu vitrini sorgusunun 3 şartı (approved + açık + yayında) */}
                    {mirrorRow && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { label: 'Tesis Açık', ok: mirrorRow.is_open === true },
                            { label: 'Yayında', ok: mirrorRow.is_published === true },
                          ] as const).map((c) => (
                            <span
                              key={c.label}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-extrabold uppercase tracking-wide ${
                                c.ok
                                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                                  : 'bg-red-500/10 border-red-500/30 text-red-300'
                              }`}
                            >
                              {c.ok ? <Check size={11} /> : <X size={11} />} {c.label}
                            </span>
                          ))}
                        </div>
                        {!(mirrorRow.is_open === true && mirrorRow.is_published === true) && (
                          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex items-start gap-2.5">
                            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-300 font-bold leading-relaxed">
                              Bu saha şu an oyuncu vitrininde LİSTELENMİYOR — kırmızı şart(lar) sağlanana kadar kart yalnız burada görünür.
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Kart, uygulama zemini üzerinde birebir çizilir (favori yıldızı/tıklama oyuncuya özel) */}
                    {mirrorLoading && !mirrorPitch ? (
                      <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 size={18} className="animate-spin" /></div>
                    ) : mirrorError ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-red-400 font-bold mb-3">{mirrorError}</p>
                        <button type="button" onClick={() => void loadMirror()} className="text-xs text-red-400 font-bold inline-flex items-center gap-1.5"><RefreshCcw size={12} /> Tekrar dene</button>
                      </div>
                    ) : mirrorPitch ? (
                      <div className="bg-bg rounded-3xl p-4">
                        <div className="max-w-[400px] mx-auto">
                          <PitchShowcaseCard pitch={mirrorPitch} />
                        </div>
                      </div>
                    ) : null}

                    {/* Ayna → düzenleme köprüleri: kartta gördüğünü ilgili sekmede düzelt */}
                    <div className="flex flex-wrap gap-2">
                      {([
                        { label: 'Fotoğraflar', tab: 'photos' },
                        { label: 'Kimlik / Ad / Konum', tab: 'identity' },
                        { label: 'Olanaklar', tab: 'amenities' },
                        { label: 'Kortlar', tab: 'courts' },
                        { label: 'Fiyat / Tarife', tab: 'tariffs' },
                      ] as const).map((c) => (
                        <button
                          key={c.tab}
                          type="button"
                          onClick={() => setActiveTab(c.tab)}
                          className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-[10px] font-bold uppercase tracking-wide transition-colors"
                        >
                          {c.label} · Düzenle
                        </button>
                      ))}
                    </div>
                  </div>

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
                        <p className="text-sm font-bold text-white flex items-center gap-1.5"><Clock size={14} className="text-primary" /> Müsaitlik Rozeti</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kartta "Bugün X saat müsait / dolu" rozeti gösterilir.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleShowcaseFlag('show_availability_badge', availabilityBadge, setAvailabilityBadge, ['Müsaitlik rozeti açıldı.', 'Müsaitlik rozeti kapatıldı.'])}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${availabilityBadge ? 'bg-primary' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${availabilityBadge ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5"><CalendarCheck size={14} className="text-primary" /> Online Rezervasyon</p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-[200px]">
                          Kapalıyken oyuncular bu tesise uygulamadan rezervasyon YAPAMAZ (sunucu reddeder);
                          tesisin kendi manuel kayıtları etkilenmez.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleShowcaseFlag('booking_disabled_by_admin', bookingDisabledAdmin, setBookingDisabledAdmin, ['Online rezervasyon KAPATILDI.', 'Online rezervasyon açıldı.'])}
                        className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${!bookingDisabledAdmin ? 'bg-green-500' : 'bg-red-500/80'}`}
                      >
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${!bookingDisabledAdmin ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>


                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPreview(true)}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FFFF00]/10 border border-[#FFFF00]/40 text-[#FFFF00] text-xs font-extrabold uppercase tracking-wider"
                    >
                      <Eye size={15} /> Oyuncu Gözüyle Önizle
                    </button>
                    <p className="mt-1.5 text-[10px] text-gray-600 text-center">
                      Vitrin kartını yukarıdaki Canlı Ayna'da, detay sayfası önizlemesini bu butonla görürsün.
                    </p>
                  </div>

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
                      <p className="text-sm font-extrabold text-white capitalize truncate">{scheduleDateLabel}</p>
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
                      <p className="text-sm font-extrabold text-white truncate">{monthLabel(financeMonth)}</p>
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
                            <p className="text-[10px] text-gray-500 font-extrabold uppercase mb-1">{s.label}</p>
                            <p className={`text-lg font-extrabold ${s.cls}`}>{s.value}</p>
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
                          <p className="text-[10px] text-gray-500 font-extrabold uppercase mb-3">Ödeme Yöntemi</p>
                          <BreakdownList
                            rows={finance.income.by_method.map((m) => ({ key: m.method, label: methodLabel(m.method), amount: m.amount, count: m.count }))}
                            total={finance.income.collected_total}
                            color="#EF4444"
                            emptyText="Bu ay tahsilat yok."
                          />
                        </div>
                        <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5">
                          <p className="text-[10px] text-gray-500 font-extrabold uppercase mb-3">Son Ödemeler</p>
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
