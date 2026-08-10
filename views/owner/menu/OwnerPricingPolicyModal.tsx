import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock, Info, Plus, Tag, Trash2 } from 'lucide-react';
import {
  getTariffs,
  saveCourtTariffs,
  saveTariffs,
  toTurkishError,
  type TariffInput,
} from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import type { PitchCourt, PitchTariff } from '../../../types';
import { ALLOWED_SLOT_MINUTES, buildSlotGrid, slotLabel } from '../../../shared/slotGrid';
import { money } from '../finance/financeUi';

// Kapora saatlik ücretin %10–%50'si aralığında olmalı (Karar #34).
const DEPOSIT_MIN_PCT = 0.1;
const DEPOSIT_MAX_PCT = 0.5;

/** ISO gün numaraları: 1 = Pazartesi … 7 = Pazar. Hafta içi/hafta sonu ikilisi
 *  kalktı; sahip günleri tek tek seçiyor. */
const DAY_LABELS: { iso: number; short: string; long: string }[] = [
  { iso: 1, short: 'Pzt', long: 'Pazartesi' },
  { iso: 2, short: 'Sal', long: 'Salı' },
  { iso: 3, short: 'Çar', long: 'Çarşamba' },
  { iso: 4, short: 'Per', long: 'Perşembe' },
  { iso: 5, short: 'Cum', long: 'Cuma' },
  { iso: 6, short: 'Cmt', long: 'Cumartesi' },
  { iso: 7, short: 'Paz', long: 'Pazar' },
];

interface EditRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  price: number;
  /** Slot süresi (dakika): 60 | 90 | 120 — sahibin seçtiği maç/kiralama süresi. */
  slotMinutes: number;
  deposit: number;
  /** Bu tarifenin geçerli olduğu günler (ISO 1-7). Boş olamaz. */
  days: number[];
}

interface Props {
  onClose: () => void;
  facilityId: string;
  courts?: PitchCourt[];
  readOnly?: boolean;
  /**
   * SAHA (KORT) KİPİ. Dolu ise ekran YALNIZ bu sahanın tarifelerini gösterir ve
   * kaydeder (`owner_replace_court_tariffs`). Genel/tesis geneli fiyatlandırma
   * ekranı kaldırıldı — her saha kendi politikasını girer (E1a/E5a/E12a).
   */
  courtId?: string | null;
  courtName?: string;
  /** Toast sağlayıcısı olmayan bağlamlarda (admin paneli) hata görünür kalsın. */
  onNotify?: (message: string, variant: 'success' | 'error') => void;
  /** Kaydedince takvimin anında güncellenmesi için saha-farkında politika verilir. */
  onSave: (pricingPolicy: { startTime: string; endTime: string; price: number; slot_price: number; slot_minutes: number; court_id: string | null }[]) => void;
}

const ALL_SCOPE = 'ALL';

/** Saha kipinde kapsam anahtarı kortun kendisidir; tesis kipinde 'ALL'. */
const scopeKeyFor = (courtId?: string | null): string => courtId ?? ALL_SCOPE;

const clampDeposit = (deposit: number, price: number): number => {
  if (!price || price <= 0) return Math.max(0, Math.round(deposit));
  const min = Math.round(price * DEPOSIT_MIN_PCT);
  const max = Math.round(price * DEPOSIT_MAX_PCT);
  return Math.min(max, Math.max(min, Math.round(deposit)));
};

/** Tarifenin günleri; eksikse tüm hafta varsayılır (veri kaybı olmasın). */
const daysFromTariff = (t: PitchTariff): number[] => {
  const raw = (t.applies_to_days ?? []).filter((d) => d >= 1 && d <= 7);
  return raw.length > 0 ? [...raw].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
};

const defaultRows = (): EditRow[] => [
  { id: 'def-1', name: 'Gündüz', startTime: '09:00', endTime: '17:00', price: 2000, slotMinutes: 60, deposit: 600, days: [1,2,3,4,5,6,7] },
  { id: 'def-2', name: 'Akşam', startTime: '17:00', endTime: '00:00', price: 3200, slotMinutes: 60, deposit: 960, days: [1,2,3,4,5,6,7] },
];

export const OwnerPricingPolicyModal: React.FC<Props> = ({
  onClose,
  facilityId,
  courts = [],
  readOnly = false,
  courtId = null,
  courtName,
  onNotify,
  onSave,
}) => {
  const toast = useOwnerToast();
  // Admin panelinde OwnerToastProvider yok; onNotify verilirse hata oraya gider,
  // yoksa toast'a. Her iki yolda da kullanıcı hatayı GÖRÜR (sessiz hata yok).
  const notify = React.useCallback(
    (message: string, variant: 'success' | 'error' = 'success') => {
      if (onNotify) onNotify(message, variant);
      else toast(message, variant);
    },
    [onNotify, toast],
  );
  /** Saha kipi: tek kort, kapsam seçici yok. */
  const isCourtScoped = Boolean(courtId);
  const activeCourts = useMemo(() => courts.filter((c) => c.is_active !== false), [courts]);
  const [scope, setScope] = useState<string>(courtId ?? ALL_SCOPE);
  // Kapsam (Tüm Sahalar / her saha) → düzenlenebilir NORMAL tarife satırları
  // (yalnız AKTİF hafta içi/sonu). Diğer her tarife korunur (aşağıya).
  const [rowsByScope, setRowsByScope] = useState<Record<string, EditRow[]>>({});
  // Editörde GÖSTERİLMEYEN ama kayıtta AYNEN korunan tarifeler: SPECIAL (prime),
  // HOLIDAY (tatil) ve pasif (is_active=false) satırlar. Full-replace kaydında
  // bunlar da geri yazılmazsa kalıcı silinirdi (adversaryal review bulgusu).
  const [preservedTariffs, setPreservedTariffs] = useState<PitchTariff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const rowSeq = useRef(0);

  useEffect(() => {
    let active = true;
    if (!facilityId || facilityId.startsWith('mock-')) {
      setRowsByScope({ [scopeKeyFor(courtId)]: defaultRows() });
      setIsLoading(false);
      return;
    }
    getTariffs(facilityId)
      .then((all) => {
        if (!active) return;
        // Saha kipinde YALNIZ bu kortun satırları ele alınır; tesis geneli
        // (court_id = null) eski satırlara dokunulmaz — sunucu da yalnız bu
        // kortun satırlarını değiştiriyor (owner_replace_court_tariffs).
        const rows = courtId ? all.filter((t) => t.court_id === courtId) : all;
        // Editörde yalnız AKTİF hafta içi/sonu tarifeler düzenlenir.
        const isEditable = (t: PitchTariff) =>
          t.is_active !== false && (t.tariff_type === 'WEEKDAY' || t.tariff_type === 'WEEKEND');
        // Diğer HER tarife (SPECIAL, HOLIDAY, pasif) aynen korunur.
        setPreservedTariffs(rows.filter((t) => !isEditable(t)));
        const grouped: Record<string, EditRow[]> = {};
        rows.filter(isEditable).forEach((t) => {
          const key = t.court_id ?? ALL_SCOPE;
          (grouped[key] ??= []).push({
            id: t.id,
            name: t.name,
            startTime: String(t.start_time ?? '09:00').slice(0, 5),
            endTime: String(t.end_time ?? '00:00').slice(0, 5),
            price: Number(t.slot_price ?? 0),
            slotMinutes: Number(t.slot_minutes ?? 60),
            deposit: Number(t.deposit_amount ?? 0),
            days: daysFromTariff(t),
          });
        });
        // Varsayılan tarifeler YALNIZ tamamen boş tesiste önerilir; saha-özel
        // veya SPECIAL tarifesi olan tesise sahte 2000/3200 enjekte edilmez.
        if (rows.length === 0) grouped[scopeKeyFor(courtId)] = defaultRows();
        setRowsByScope(grouped);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facilityId, courtId, notify]);

  const rows = rowsByScope[scope] ?? [];
  const setRows = (updater: (prev: EditRow[]) => EditRow[]) =>
    setRowsByScope((prev) => ({ ...prev, [scope]: updater(prev[scope] ?? []) }));

  // Yazarken sıkıştırma YOK (kapora alanı elle düzenlenebilir kalmalı — review
  // bulgusu). Kapora %10–%50 sınırı input blur'unda ve kayıtta uygulanır.
  const updateRow = (id: string, field: keyof EditRow, value: string | number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, [field]: value } as EditRow) : r)));
  };
  const clampRowDeposit = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deposit: clampDeposit(r.deposit, r.price) } : r)));
  };
  /** Gün aç/kapat — sıralı tutulur ki sunucuya hep aynı biçimde gitsin. */
  const toggleDay = (id: string, iso: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = r.days.includes(iso)
          ? r.days.filter((d) => d !== iso)
          : [...r.days, iso].sort((a, b) => a - b);
        return { ...r, days: next };
      }),
    );
  };

  const buildFullTariffSet = (): TariffInput[] => {
    const out: TariffInput[] = [];
    // Her kapsamın NORMAL tarifeleri (court_id ile).
    Object.entries(rowsByScope).forEach(([key, scopeRows]) => {
      const rowCourtId = key === ALL_SCOPE ? null : key;
      scopeRows.forEach((r, idx) => {
        out.push({
          name: r.name,
          // Gün seçimi TEK mekanizma; tariff_type yalnız tarih-özel/tatil
          // ayrımı için şemada duruyor, gün belirlemiyor.
          tariff_type: 'WEEKDAY',
          applies_to_days: r.days,
          start_time: r.startTime,
          end_time: r.endTime,
          slot_price: Number(r.price) || 0,
          slot_minutes: Number(r.slotMinutes) || 60,
          deposit_amount: clampDeposit(Number(r.deposit) || 0, Number(r.price) || 0),
          sort_order: idx,
          court_id: rowCourtId,
        });
      });
    });
    // Korunan tarifeler (SPECIAL, HOLIDAY, pasif) GERÇEK tipi/günü/aktifliği ve
    // TARİHİYLE (valid_on) aynen geri yazılır — full-replace'te silinmesinler.
    preservedTariffs.forEach((t, idx) => {
      out.push({
        name: t.name,
        tariff_type: (t.tariff_type as TariffInput['tariff_type']) ?? 'SPECIAL',
        applies_to_days: t.applies_to_days ?? [],
        start_time: String(t.start_time ?? '09:00').slice(0, 5),
        end_time: String(t.end_time ?? '00:00').slice(0, 5),
        slot_price: Number(t.slot_price) || 0,
        slot_minutes: Number(t.slot_minutes ?? 60),
        deposit_amount: Number(t.deposit_amount ?? 0),
        sort_order: 1000 + idx,
        is_active: t.is_active,
        court_id: t.court_id ?? null,
        valid_on: t.valid_on ?? null,
      });
    });
    return out;
  };

  const handleSave = async () => {
    if (!facilityId || readOnly) return;
    // Günsüz tarife ne slot üretir ne çalışma saati açar; sunucu da CHECK ile
    // reddediyor. Kullanıcıyı sunucu hatasına düşürmeden burada durdur.
    const emptyDays = Object.values(rowsByScope).flat().filter((r) => r.days.length === 0);
    if (emptyDays.length > 0) {
      notify(`"${emptyDays[0].name || 'Tarife'}" için en az bir gün seçmelisin.`, 'error');
      return;
    }
    // Saha kipinde BOŞ kayıt yasak: tarifesiz saha yayına alınamaz, sahibi
    // "kaydettim ama saham yayına girmiyor" durumuna düşmesin.
    if (isCourtScoped && (rowsByScope[scopeKeyFor(courtId)] ?? []).length === 0) {
      notify('Bu saha için en az bir tarife girmelisin — tarifesiz saha yayına alınamaz.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const fullSet = buildFullTariffSet();
      if (!facilityId.startsWith('mock-')) {
        // Saha kipi: YALNIZ bu kortun satırları değişir (owner_replace_court_tariffs).
        // Tesis kipi: eski full-replace (admin tesis kurulumu).
        if (isCourtScoped && courtId) await saveCourtTariffs(courtId, fullSet);
        else await saveTariffs(facilityId, fullSet);
      }
      // Takvim/oyuncu tarafı için saha-farkında politika (SPECIAL hariç normal satırlar).
      const policy = fullSet
        .filter((t) => t.tariff_type !== 'SPECIAL')
        .map((t) => ({
          startTime: t.start_time,
          endTime: t.end_time,
          price: t.slot_price,
          slot_price: t.slot_price,
          slot_minutes: t.slot_minutes ?? 60,
          court_id: t.court_id ?? null,
        }));
      onSave(policy);
      notify('Fiyatlandırma politikası kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const depositRange = (price: number) =>
    price > 0 ? `${money(Math.round(price * DEPOSIT_MIN_PCT))}–${money(Math.round(price * DEPOSIT_MAX_PCT))}` : '';

  /**
   * TÜRETİLMİŞ ÇALIŞMA SAATLERİ — sunucudaki derive_pitch_working_hours ile
   * aynı kural: bir günün penceresi, o güne uygulanan aktif tarifelerin en
   * erken başlangıcı .. en geç bitişi. Tarifesi olmayan gün KAPALI.
   *
   * Ayrı bir "Çalışma Saatleri" ekranı yok; sahip tarifeyi kurar, tesisin
   * saatleri ondan doğar. Burada anında görsün diye özetliyoruz.
   */
  const derivedHours = useMemo(() => {
    const all = Object.values(rowsByScope).flat();
    return DAY_LABELS.map((d) => {
      const forDay = all.filter((r) => r.days.includes(d.iso));
      if (forDay.length === 0) return { ...d, closed: true, open: '', close: '' };
      const open = forDay.reduce((min, r) => (r.startTime < min ? r.startTime : min), forDay[0].startTime);
      // '00:00' bitiş = gün sonu, en geç bitiş odur.
      const hasMidnight = forDay.some((r) => r.endTime === '00:00');
      const close = hasMidnight
        ? '00:00'
        : forDay.reduce((max, r) => (r.endTime > max ? r.endTime : max), forDay[0].endTime);
      return { ...d, closed: false, open, close };
    });
  }, [rowsByScope]);

  /**
   * Sahip süreyi seçtiği anda hangi saatlerin oluşacağını gösterir. Izgara
   * kullanıcıya görünenle AYNI kaynaktan (shared/slotGrid) üretilir; sahip
   * "kaydettim ama ne olduğunu görmedim" durumuna düşmez.
   */
  const slotPreview = (row: EditRow): string => {
    const grid = buildSlotGrid(
      [{
        start_time: row.startTime,
        end_time: row.endTime,
        slot_minutes: row.slotMinutes,
        applies_to_days: [1, 2, 3, 4, 5, 6, 7],
        tariff_type: 'WEEKDAY',
        slot_price: row.price,
      }],
      // Izgara güne değil süreye bağlı; sabit bir referans gün yeterli.
      '2026-01-05',
    );
    if (grid.length === 0) return '';
    const shown = grid.slice(0, 3).map(slotLabel).join(' · ');
    return grid.length > 3 ? `${shown} … (${grid.length} slot)` : `${shown} (${grid.length} slot)`;
  };

  return (
    <OwnerFullscreenModal
      title={isCourtScoped ? `Aktif Saatler ve Ücretler — ${courtName ?? 'Saha'}` : 'Aktif Saatler ve Ücretler'}
      onClose={onClose}
      onSave={readOnly ? undefined : handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
          {isCourtScoped ? (
            <p className="text-xs text-blue-200">
              Bu politika <b>yalnız {courtName ?? 'bu saha'}</b> için geçerlidir; diğer sahaların
              tarifeleri etkilenmez. Burada kurduğun plan sahanın <b>açık saatlerini</b> de belirler —
              ayrı bir çalışma saati ayarı yoktur. <b>Tarifesi olmayan saha yayına alınamaz.</b>
              Fiyat değişiklikleri mevcut rezervasyonları etkilemez; kapora slot ücretinin
              %10–%50'si aralığındadır.
            </p>
          ) : (
            <p className="text-xs text-blue-200">
              Burada kurduğun plan tesisin <b>açık saatlerini</b> de belirler — ayrı bir çalışma
              saati ayarı yoktur. Bir sahaya özel tarife tanımlarsan o saha için <b>saha tarifesi</b>,
              tanımlamazsan <b>Tüm Sahalar</b> tarifesi geçerli olur. Fiyat değişiklikleri mevcut
              rezervasyonları etkilemez; kapora slot ücretinin %10–%50'si aralığındadır.
            </p>
          )}
        </div>

        {/* TÜRETİLMİŞ ÇALIŞMA SAATLERİ — tarifelerden doğar, elle girilmez.
            Sahip hangi günün hangi saatte açık olacağını burada anında görür. */}
        <div className="bg-bg border border-white/8 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-primary" />
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-white">
              {isCourtScoped ? 'Bu Sahanın Açık Saatleri' : 'Tesisin Açık Saatleri'}
            </h4>
          </div>
          <div className="space-y-1.5">
            {derivedHours.map((d) => (
              <div key={d.iso} className="flex items-center justify-between text-[12px]">
                <span className={d.closed ? 'text-gray-600 font-semibold' : 'text-gray-300 font-semibold'}>
                  {d.long}
                </span>
                {d.closed ? (
                  <span className="text-gray-600 font-bold">Kapalı</span>
                ) : (
                  <span className="text-white font-extrabold font-mono">{d.open} – {d.close}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-gray-500 mt-3 leading-relaxed">
            Bu saatler tarifelerinden hesaplanır ve kullanıcıya böyle görünür.
            Bir günü kapatmak için o güne ait tarifeyi kaldır.
          </p>
        </div>

        {/* Kapsam seçici YALNIZ tesis kipinde (admin tesis kurulumu). Saha
            kipinde tek kort vardır; seçici gösterilmez. */}
        {!isCourtScoped && activeCourts.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {[{ key: ALL_SCOPE, label: 'Tüm Sahalar' }, ...activeCourts.map((c) => ({ key: c.id, label: c.name }))].map(
              (s) => {
                const count = (rowsByScope[s.key] ?? []).length;
                const isSel = scope === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScope(s.key)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-extrabold transition-all border ${
                      isSel ? 'bg-white/10 text-white border-white/25' : 'bg-surface-1 text-gray-400 border-white/5'
                    }`}
                  >
                    {s.label}
                    {s.key !== ALL_SCOPE && count > 0 && <span className="ml-1.5 text-cat-pitch">•</span>}
                  </button>
                );
              },
            )}
          </div>
        )}

        {/* Saha kipinde tarife yoksa DÜRÜST çağrı: sessizce boş liste gösterme. */}
        {isCourtScoped && !isLoading && rows.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              <b>Bu saha için fiyat politikası girilmedi.</b> Aşağıdan en az bir tarife ekleyip
              kaydet — tarifesi olmayan saha yayına alınamaz, rezervasyon da kabul etmez.
            </p>
          </div>
        )}

        {!isCourtScoped && scope !== ALL_SCOPE && rows.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-start gap-3">
            <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Bu saha şu an <b>Tüm Sahalar</b> tarifesini kullanıyor. Yalnız bu sahaya özel fiyat
              vermek istersen aşağıdan tarife ekle.
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-gray-500 text-sm py-8">Tarifeler yükleniyor…</p>
        ) : (
          <div className="space-y-4">
            {rows.map((tariff) => (
              <div
                key={tariff.id}
                className="bg-surface-1 p-5 rounded-3xl border border-white/5 space-y-4 relative group"
              >
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((t) => t.id !== tariff.id))}
                    className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-xl"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <div className="flex items-center gap-3 border-b border-white/5 pb-4 pr-10">
                  <Tag size={18} className="text-blue-400" />
                  <input
                    type="text"
                    value={tariff.name}
                    disabled={readOnly}
                    onChange={(e) => updateRow(tariff.id, 'name', e.target.value)}
                    className="bg-transparent text-sm font-extrabold uppercase text-white outline-none w-full"
                  />
                </div>
                {/* GÜNLER — hafta içi/hafta sonu ikilisi kalktı; her gün tek tek
                    seçilir. Seçilen günler aynı zamanda tesisin o günkü çalışma
                    saatini belirler (pencere = tarifelerin en erken başlangıcı
                    .. en geç bitişi). Hiç gün seçilmemiş tarife kaydedilemez. */}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase">Geçerli Günler</label>
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((d) => {
                      const on = tariff.days.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          disabled={readOnly}
                          title={d.long}
                          onClick={() => toggleDay(tariff.id, d.iso)}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold border transition-colors disabled:opacity-50 ${
                            on
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-bg border-white/5 text-gray-600 hover:text-gray-400'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                  {tariff.days.length === 0 && (
                    <p className="text-[10.5px] text-red-400 font-semibold">
                      En az bir gün seçmelisin — günsüz tarife ne saat açar ne fiyat verir.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Başlangıç</label>
                    <div className="flex items-center gap-2 bg-bg border border-white/5 p-3 rounded-xl">
                      <Clock size={14} className="text-gray-400" />
                      <input
                        type="time"
                        value={tariff.startTime}
                        disabled={readOnly}
                        onChange={(e) => updateRow(tariff.id, 'startTime', e.target.value)}
                        className="bg-transparent text-white text-sm font-bold outline-none w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Bitiş</label>
                    <div className="flex items-center gap-2 bg-bg border border-white/5 p-3 rounded-xl">
                      <Clock size={14} className="text-gray-400" />
                      <input
                        type="time"
                        value={tariff.endTime}
                        disabled={readOnly}
                        onChange={(e) => updateRow(tariff.id, 'endTime', e.target.value)}
                        className="bg-transparent text-white text-sm font-bold outline-none w-full"
                      />
                    </div>
                  </div>
                </div>
                {/* SLOT SÜRESİ — ızgarayı bu belirler. Sahip 90 seçince kullanıcı
                    ekranında saatler 20:00-21:30, 21:30-23:00 diye görünür. */}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase">Maç / Kiralama Süresi</label>
                  <div className="flex gap-2">
                    {ALLOWED_SLOT_MINUTES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={readOnly}
                        onClick={() => updateRow(tariff.id, 'slotMinutes', m)}
                        className={`flex-1 py-2.5 rounded-xl text-[12px] font-extrabold transition-colors disabled:opacity-50 ${
                          tariff.slotMinutes === m
                            ? 'bg-primary text-on-primary'
                            : 'bg-bg border border-white/8 text-gray-400 hover:text-white'
                        }`}
                      >
                        {m} dk
                      </button>
                    ))}
                  </div>
                  {slotPreview(tariff) && (
                    <p className="text-[10.5px] text-gray-500 leading-relaxed">
                      Oluşacak saatler: <span className="text-gray-300 font-semibold">{slotPreview(tariff)}</span>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      {tariff.slotMinutes} Dakikalık Ücret
                    </label>
                    <input
                      type="number"
                      value={tariff.price}
                      disabled={readOnly}
                      onChange={(e) => updateRow(tariff.id, 'price', parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-bg border border-white/5 p-3 rounded-xl text-white text-lg font-extrabold outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      Kapora {tariff.price > 0 && <span className="text-gray-600 normal-case">({depositRange(tariff.price)})</span>}
                    </label>
                    <input
                      type="number"
                      value={tariff.deposit}
                      disabled={readOnly}
                      onChange={(e) => updateRow(tariff.id, 'deposit', parseInt(e.target.value, 10) || 0)}
                      onBlur={() => clampRowDeposit(tariff.id)}
                      className="w-full bg-bg border border-white/5 p-3 rounded-xl text-white text-lg font-extrabold outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    {
                      id: `new-${scope}-${rowSeq.current++}`,
                      name: scope === ALL_SCOPE ? 'Yeni Tarife' : 'Saha Tarifesi',
                      startTime: '09:00',
                      endTime: '00:00',
                      price: 0,
                      slotMinutes: 60,
                      deposit: 0,
                      days: [1, 2, 3, 4, 5, 6, 7],
                    },
                  ])
                }
                className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5"
              >
                <Plus size={18} />{' '}
                {scope === ALL_SCOPE
                  ? 'Yeni Tarife Ekle'
                  : isCourtScoped
                    ? 'Bu Saha İçin Tarife Ekle'
                    : 'Bu Sahaya Özel Tarife Ekle'}
              </button>
            )}
          </div>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
