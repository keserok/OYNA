import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, Plus, Tag, Trash2 } from 'lucide-react';
import { getTariffs, saveTariffs, toTurkishError, type TariffInput } from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerFullscreenModal } from './OwnerModalFrame';
import type { OwnerMenuTariff } from './ownerMenuTypes';

interface Props {
  onClose: () => void;
  facilityId: string;
  onSave: (tariffs: OwnerMenuTariff[]) => void;
}

function mapDbToUi(rows: Awaited<ReturnType<typeof getTariffs>>): OwnerMenuTariff[] {
  const regular = rows.filter((t) => t.tariff_type !== 'SPECIAL' && t.is_active !== false);
  if (regular.length === 0) {
    return [
      { id: '1', name: 'Gündüz Tarifesi', startTime: '08:00', endTime: '17:00', price: 2000, deposit: 500 },
      { id: '2', name: 'Akşam Tarifesi', startTime: '18:00', endTime: '00:00', price: 3200, deposit: 1000 },
    ];
  }
  return regular.map((t) => ({
    id: t.id,
    name: t.name,
    startTime: String(t.start_time ?? '08:00').slice(0, 5),
    endTime: String(t.end_time ?? '23:00').slice(0, 5),
    price: Number(t.price_per_hour ?? 0),
    deposit: Number(t.deposit_amount ?? 0),
  }));
}

export const OwnerPricingPolicyModal: React.FC<Props> = ({ onClose, facilityId, onSave }) => {
  const notify = useOwnerToast();
  const [tariffs, setTariffs] = useState<OwnerMenuTariff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!facilityId || facilityId.startsWith('mock-')) {
      setTariffs(mapDbToUi([]));
      setIsLoading(false);
      return;
    }
    getTariffs(facilityId)
      .then((rows) => {
        if (active) setTariffs(mapDbToUi(rows));
      })
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facilityId, notify]);

  const updateTariff = (id: string, field: keyof OwnerMenuTariff, value: string | number) => {
    setTariffs((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const handleSave = async () => {
    if (!facilityId) return;
    setIsSaving(true);
    try {
      if (!facilityId.startsWith('mock-')) {
        const mapped: TariffInput[] = tariffs.map((t, idx) => {
          const lower = t.name.toLocaleLowerCase('tr-TR');
          const isWeekend =
            lower.includes('hafta sonu') ||
            lower.includes('weekend') ||
            lower.includes('cumartesi') ||
            lower.includes('pazar');
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
      notify('Fiyatlandırma politikası kaydedildi.', 'success');
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OwnerFullscreenModal
      title="Fiyatlandırma Politikası"
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-200">
            Fiyat değişiklikleri mevcut rezervasyonları etkilemez. Tarifeler veritabanından
            yüklenir ve kayıt anında senkronize edilir.
          </p>
        </div>

        {isLoading ? (
          <p className="text-center text-gray-500 text-sm py-8">Tarifeler yükleniyor...</p>
        ) : (
          <div className="space-y-4">
            {tariffs.map((tariff) => (
              <div
                key={tariff.id}
                className="bg-[#161B22] p-5 rounded-3xl border border-white/5 space-y-4 relative group"
              >
                <button
                  type="button"
                  onClick={() => setTariffs((prev) => prev.filter((t) => t.id !== tariff.id))}
                  className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex items-center gap-3 border-b border-white/5 pb-4 pr-10">
                  <Tag size={18} className="text-blue-400" />
                  <input
                    type="text"
                    value={tariff.name}
                    onChange={(e) => updateTariff(tariff.id, 'name', e.target.value)}
                    className="bg-transparent text-sm font-black uppercase text-white outline-none w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Başlangıç</label>
                    <div className="flex items-center gap-2 bg-[#0A0E14] border border-white/5 p-3 rounded-xl">
                      <Clock size={14} className="text-gray-400" />
                      <input
                        type="time"
                        value={tariff.startTime}
                        onChange={(e) => updateTariff(tariff.id, 'startTime', e.target.value)}
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
                        onChange={(e) => updateTariff(tariff.id, 'endTime', e.target.value)}
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
                      onChange={(e) => updateTariff(tariff.id, 'price', parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-[#0A0E14] border border-white/5 p-3 rounded-xl text-white text-lg font-black outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Kapora</label>
                    <input
                      type="number"
                      value={tariff.deposit}
                      onChange={(e) => updateTariff(tariff.id, 'deposit', parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-[#0A0E14] border border-white/5 p-3 rounded-xl text-white text-lg font-black outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setTariffs((prev) => [
                  ...prev,
                  {
                    id: `new-${Date.now()}`,
                    name: 'Yeni Tarife',
                    startTime: '08:00',
                    endTime: '23:00',
                    price: 0,
                    deposit: 0,
                  },
                ])
              }
              className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5"
            >
              <Plus size={18} /> Yeni Tarife Ekle
            </button>
          </div>
        )}
      </div>
    </OwnerFullscreenModal>
  );
};
