// ─── Vitrin Kalite Skoru (köprü paketi #2 — kurucu kararı, 9 Ağu 2026) ──────
// Standart 5 ölçüt: fotoğraf (≥3) · açıklama · tüm kortlarda tarife · açık
// saatler · iptal politikası. Tek saf fonksiyon: panel kartı, menü hapı ve
// testler aynı hesabı kullanır — iki ayrı "skor" doğamaz.

export interface VitrinSkoruGirdi {
  photoCount: number;
  hasDescription: boolean;
  courtCount: number;
  courtsWithoutTariff: number;
  hasWorkingHours: boolean;
  hasCancellationPolicy: boolean;
}

export interface VitrinOlcut {
  key: 'photos' | 'description' | 'tariffs' | 'hours' | 'cancellation';
  label: string;
  hint: string;
  done: boolean;
}

export interface VitrinSkoru {
  puan: number;      // 0–5
  max: 5;
  olcutler: VitrinOlcut[];
}

export const vitrinSkoru = (g: VitrinSkoruGirdi): VitrinSkoru => {
  const olcutler: VitrinOlcut[] = [
    {
      key: 'photos',
      label: 'En az 3 fotoğraf',
      hint: 'Oyuncu ilk fotoğrafa bakar — saha, soyunma odası, gece ışığı',
      done: g.photoCount >= 3,
    },
    {
      key: 'description',
      label: 'Tesis açıklaması',
      hint: 'Bir-iki cümle: ulaşım, otopark, çay ocağı',
      done: g.hasDescription,
    },
    {
      key: 'tariffs',
      label: 'Tüm sahalarda tarife',
      hint: 'Tarifesiz saha vitrine çıkamaz',
      done: g.courtCount > 0 && g.courtsWithoutTariff === 0,
    },
    {
      key: 'hours',
      label: 'Açık saatler tanımlı',
      hint: 'Oyuncu hangi saatte rezervasyon yapabileceğini görür',
      done: g.hasWorkingHours,
    },
    {
      key: 'cancellation',
      label: 'İptal politikası seçili',
      hint: 'Oyuncu ödeme öncesi iade kuralını görür — güven verir',
      done: g.hasCancellationPolicy,
    },
  ];
  return { puan: olcutler.filter((o) => o.done).length, max: 5, olcutler };
};
