import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock, Info, Plus, Tag, Trash2 } from 'lucide-react';
import { getTariffs, saveTariffs, toTurkishError, type TariffInput } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import type { PitchCourt, PitchTariff } from '../../../types';

// Kapora saatlik ücretin %10–%50'si aralığında olmalı (Karar #34).
const DEPOSIT_MIN_PCT = 0.1;
const DEPOSIT_MAX_PCT = 0.5;

type DayType = 'WEEKDAY' | 'WEEKEND';

interface EditRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  price: number;
  deposit: number;
  dayType: DayType;
}

interface Props {
  onClose: () => void;
  facilityId: string;
  courts?: PitchCourt[];
  readOnly?: boolean;
  /** Kaydedince takvimin anında güncellenmesi için saha-farkında politika verilir. */
  onSave: (pricingPolicy: { startTime: string; endTime: string; price: number; price_per_hour: number; court_id: string | null }[]) => void;
}

const ALL_SCOPE = 'ALL';

const clampDeposit = (deposit: number, price: number): number => {
  if (!price || price <= 0) return Math.max(0, Math.round(deposit));
  const min = Math.round(price * DEPOSIT_MIN_PCT);
  const max = Math.round(price * DEPOSIT_MAX_PCT);
  return Math.min(max, Math.max(min, Math.round(deposit)));
};

const dayTypeFromTariff = (t: PitchTariff): DayType =>
  t.tariff_type === 'WEEKEND' || (t.applies_to_days ?? []).some((d) => d === 6 || d === 7) ? 'WEEKEND' : 'WEEKDAY';

const defaultRows = (): EditRow[] => [
  { id: 'def-1', name: 'Gündüz', startTime: '09:00', endTime: '17:00', price: 2000, deposit: 600, dayType: 'WEEKDAY' },
  { id: 'def-2', name: 'Akşam', startTime: '17:00', endTime: '00:00', price: 3200, deposit: 960, dayType: 'WEEKDAY' },
];

export const OwnerPricingPolicyModal: React.FC<Props> = ({ onClose, facilityId, courts = [], readOnly = false, onSave }) => {
  const notify = useOwnerToast();
  const activeCourts = useMemo(() => courts.filter((c) => c.is_active !== false), [courts]);
  const [scope, setScope] = useState<string>(ALL_SCOPE);
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
      setRowsByScope({ [ALL_SCOPE]: defaultRows() });
      setIsLoading(false);
      return;
    }
    getTariffs(facilityId)
      .then((rows) => {
        if (!active) return;
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
            price: Number(t.price_per_hour ?? 0),
            deposit: Number(t.deposit_amount ?? 0),
            dayType: dayTypeFromTariff(t),
          });
        });
        // Varsayılan tarifeler YALNIZ tamamen boş tesiste önerilir; saha-özel
        // veya SPECIAL tarifesi olan tesise sahte 2000/3200 enjekte edilmez.
        if (rows.length === 0) grouped[ALL_SCOPE] = defaultRows();
        setRowsByScope(grouped);
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facilityId, notify]);

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

  const scopeCourtId = scope === ALL_SCOPE ? null : scope;

  const buildFullTariffSet = (): TariffInput[] => {
    const out: TariffInput[] = [];
    // Her kapsamın NORMAL tarifeleri (court_id ile).
    Object.entries(rowsByScope).forEach(([key, scopeRows]) => {
      const courtId = key === ALL_SCOPE ? null : key;
      scopeRows.forEach((r, idx) => {
        out.push({
          name: r.name,
          tariff_type: r.dayType,
          applies_to_days: r.dayType === 'WEEKEND' ? [6, 7] : [1, 2, 3, 4, 5],
          start_time: r.startTime,
          end_time: r.endTime,
          price_per_hour: Number(r.price) || 0,
          deposit_amount: clampDeposit(Number(r.deposit) || 0, Number(r.price) || 0),
          sort_order: idx,
          court_id: courtId,
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
        price_per_hour: Number(t.price_per_hour) || 0,
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
    setIsSaving(true);
    try {
      const fullSet = buildFullTariffSet();
      if (!facilityId.startsWith('mock-')) {
        await saveTariffs(facilityId, fullSet);
      }
      // Takvim/oyuncu tarafı için saha-farkında politika (SPECIAL hariç normal satırlar).
      const policy = fullSet
        .filter((t) => t.tariff_type !== 'SPECIAL')
        .map((t) => ({
          startTime: t.start_time,
          endTime: t.end_time,
          price: t.price_per_hour,
          price_per_hour: t.price_per_hour,
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
    price > 0 ? `₺${Math.round(price * DEPOSIT_MIN_PCT)}–₺${Math.round(price * DEPOSIT_MAX_PCT)}` : '';

  return (
    <OwnerFullscreenModal
      title="Fiyatlandırma Politikası"
      onClose={onClose}
      onSave={readOnly ? undefined : handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-200">
            Fiyat değişiklikleri mevcut rezervasyonları etkilemez. Bir sahaya özel tarife
            tanımlarsan o saha için <b>saha tarifesi</b>, tanımlamazsan <b>Tüm Sahalar</b> tarifesi
            geçerli olur. Kapora saatlik ücretin %10–%50'si aralığındadır.
          </p>
        </div>

        {/* Kapsam seçici: Tüm Sahalar + her saha */}
        {activeCourts.length > 0 && (
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
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                      isSel ? 'bg-white/10 text-white border-white/25' : 'bg-[#161B22] text-gray-400 border-white/5'
                    }`}
                  >
                    {s.label}
                    {s.key !== ALL_SCOPE && count > 0 && <span className="ml-1.5 text-[#10B981]">•</span>}
                  </button>
                );
              },
            )}
          </div>
        )}

        {scope !== ALL_SCOPE && rows.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-start gap-3">
            <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Bu saha şu an <b>Tüm Sahalar</b> tarifesini kullanıyor. Yalnız bu sahaya özel fiyat
              vermek istersen aşağıdan tarife ekle.
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-gray-500 text-sm py-8">Tarifeler yükleniyor...</p>
        ) : (
          <div className="space-y-4">
            {rows.map((tariff) => (
              <div
                key={tariff.id}
                className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-4 relative group"
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
                    className="bg-transparent text-sm font-black uppercase text-white outline-none w-full"
                  />
                </div>
                {/* Gün tipi: isimden tahmin yerine açık seçim */}
                <div className="flex gap-2">
                  {(['WEEKDAY', 'WEEKEND'] as const).map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateRow(tariff.id, 'dayType', dt)}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-colors ${
                        tariff.dayType === dt
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                          : 'bg-[#0A0E14] border-white/5 text-gray-500'
                      }`}
                    >
                      {dt === 'WEEKDAY' ? 'Hafta İçi' : 'Hafta Sonu'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Başlangıç</label>
                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl">
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
                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl">
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Saatlik Ücret</label>
                    <input
                      type="number"
                      value={tariff.price}
                      disabled={readOnly}
                      onChange={(e) => updateRow(tariff.id, 'price', parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-[#0A0E14] border border-white/5 p-3 rounded-xl text-white text-lg font-black outline-none"
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
                      className="w-full bg-[#0A0E14] border border-white/5 p-3 rounded-xl text-white text-lg font-black outline-none"
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
                      deposit: 0,
                      dayType: 'WEEKDAY',
                    },
                  ])
                }
                className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5"
              >
                <Plus size={18} /> {scope === ALL_SCOPE ? 'Yeni Tarife Ekle' : 'Bu Sahaya Özel Tarife Ekle'}
              </button>
            )}
          </div>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
