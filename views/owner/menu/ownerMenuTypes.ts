import { Activity, BarChart as BarChartIcon, Zap } from 'lucide-react';

export type WidgetType =
  | 'QUICK_STATS'
  | 'QUICK_ACTIONS'
  | 'OCCUPANCY_ANALYSIS'
  | 'WEATHER_INFO'
  | 'STAFF_STATUS'
  | 'MAINTENANCE_ALERTS';

export const OWNER_WIDGETS: {
  id: WidgetType;
  title: string;
  description: string;
  icon: typeof BarChartIcon;
}[] = [
  {
    id: 'QUICK_STATS',
    title: 'Hızlı İstatistikler',
    description: 'Günlük ciro ve doluluk oranını gösterir.',
    icon: BarChartIcon,
  },
  {
    id: 'QUICK_ACTIONS',
    title: 'Hızlı İşlemler',
    description: 'QR okutma ve yeni kayıt oluşturma butonları.',
    icon: Zap,
  },
  {
    id: 'OCCUPANCY_ANALYSIS',
    title: 'Saha Doluluk Analizi',
    description: 'Sahaların saatlik doluluk durumunu gösterir.',
    icon: Activity,
  },
];

export interface OwnerMenuTariff {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  price: number;
  deposit: number;
}

export interface OwnerWorkingDay {
  name: string;
  open: string;
  close: string;
  closed?: boolean;
}

export const DEFAULT_WORKING_DAYS: OwnerWorkingDay[] = [
  { name: 'Pazartesi', open: '08:00', close: '00:00' },
  { name: 'Salı', open: '08:00', close: '00:00' },
  { name: 'Çarşamba', open: '08:00', close: '00:00' },
  { name: 'Perşembe', open: '08:00', close: '00:00' },
  { name: 'Cuma', open: '08:00', close: '02:00' },
  { name: 'Cumartesi', open: '08:00', close: '02:00' },
  { name: 'Pazar', open: '08:00', close: '00:00' },
];

export const FACILITY_AMENITIES = [
  'Duş',
  'Otopark',
  'Kafe',
  'WiFi',
  'Kamera Kaydı',
  'Mescit',
  'Krampon Kiralama',
  'Büfe',
  'Soyunma Odası',
  'İlk Yardım',
  'Engelli Erişimi',
  'Çocuk Oyun Alanı',
];

export interface OwnerMenuStats {
  isFacilityOpen: boolean;
  bankAccountCount: number;
  /** Kendi fiyat politikası olmayan AKTİF saha sayısı — menüde dürüst uyarı.
   *  Genel (tesis geneli) fiyatlandırma ekranı kaldırıldı; sayaç saha bazlıdır. */
  courtsWithoutTariff: number;
  availableBalance?: number;
  paramConfigured: boolean;
  courtCount: number;
}

export interface OwnerFacilityFormData {
  id?: string;
  name?: string;
  description?: string;
  city?: string;
  district?: string;
  address?: string;
  images?: string[];
  amenities?: string[];
}
