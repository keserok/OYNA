import type { GodViewSubRoute } from '../GodViewPanel';

export type AdminAccent = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'pink' | 'cyan' | 'orange';

export interface AdminRouteMeta {
  title: string;
  description: string;
  group: string;
  accent: AdminAccent;
}

export const ADMIN_ROUTE_META: Record<GodViewSubRoute, AdminRouteMeta> = {
  GENEL: { title: 'Genel Bakış', description: 'Platform KPI, gelir trendi ve operasyon özeti.', group: 'Komuta', accent: 'red' },
  CONTROL: { title: 'Komuta Merkezi', description: 'Canlı kuyruklar, ghost arama ve acil operasyonlar.', group: 'Komuta', accent: 'red' },
  SAHALAR: { title: 'Sahalar', description: 'Tesis envanteri, fiyatlandırma ve onay durumları.', group: 'Operasyon', accent: 'green' },
  KULLANICILAR: { title: 'Kullanıcılar', description: 'Oyuncu ve kaptan profilleri, ban ve PRO yönetimi.', group: 'Operasyon', accent: 'blue' },
  KALECİLER: { title: 'Kaleciler', description: 'Marketplace kaleci profilleri, yetenekler ve ücretler.', group: 'Operasyon', accent: 'green' },
  HAKEMLER: { title: 'Hakemler', description: 'Hakem profilleri, seviye ve maç geçmişi.', group: 'Operasyon', accent: 'yellow' },
  PENDING_VERIFICATIONS: { title: 'Onay Bekleyenler', description: 'Kaleci ve hakem doğrulama talepleri.', group: 'Operasyon', accent: 'yellow' },
  PROVIDER_IDENTITIES: { title: 'Kimlik Doğrulama', description: 'Sağlayıcı kimlik doğrulama kuyruğu (kaleci & hakem).', group: 'Operasyon', accent: 'blue' },
  MATCHES: { title: 'Maçlar', description: 'Açık maçlar, kadro eksikleri ve bildirimler.', group: 'Operasyon', accent: 'red' },
  TOPLULUKLAR: { title: 'Topluluklar', description: 'Topluluk talepleri ve kayıtlı gruplar.', group: 'Topluluk', accent: 'blue' },
  TAKIMLAR: { title: 'Takımlar', description: 'Platform takım kayıtları ve kaptan bilgileri.', group: 'Topluluk', accent: 'blue' },
  TURNUVALAR: { title: 'Turnuvalar', description: 'Turnuva planlama ve durum takibi.', group: 'Topluluk', accent: 'yellow' },
  NOTIFICATIONS: { title: 'Kampanyalar', description: 'Toplu bildirim ve duyuru gönderimi.', group: 'Pazarlama', accent: 'pink' },
  SEGMENTATION: { title: 'Segmentasyon', description: 'Kitle önizleme ve hedefli broadcast.', group: 'Pazarlama', accent: 'cyan' },
  PROMO_CODES: { title: 'İndirim Kodları', description: 'Promo kod oluşturma ve kullanım takibi.', group: 'Pazarlama', accent: 'purple' },
  FINANCE: { title: 'Finans', description: 'Ledger, cüzdan hareketleri ve tahsilatlar.', group: 'Finans', accent: 'yellow' },
  COMMISSION: { title: 'Komisyon', description: 'Çok seviyeli komisyon oranları ve model yapılandırması.', group: 'Finans', accent: 'green' },
  DISPUTES: { title: 'İhtilaflar', description: 'Maç anlaşmazlıkları ve çözüm süreci.', group: 'Finans', accent: 'orange' },
  SERVICE_DISPUTES: { title: 'Hizmet İtirazları', description: 'Sağlayıcı hizmet ödemesi itirazları ve serbest bırakma.', group: 'Finans', accent: 'orange' },
  AUDIT_LOG: { title: 'Denetim Kayıtları', description: 'Admin aksiyon geçmişi ve iz sürme.', group: 'Sistem', accent: 'purple' },
  CONTENT: { title: 'CMS Metinler', description: 'Uygulama genelinde görünen metinler.', group: 'Sistem', accent: 'pink' },
  SETTINGS: { title: 'Sistem Ayarları', description: 'Komisyon, ödeme modu ve bakım modu.', group: 'Sistem', accent: 'red' },
  ACL: { title: 'Ekipler & Yetkiler', description: 'Platform admin rolleri ve erişim kontrolü.', group: 'Sistem', accent: 'orange' },
  MODERATION: { title: 'Tesis Onayları', description: 'Saha ve çekim taleplerinin moderasyonu.', group: 'Operasyon', accent: 'yellow' },
  OWNER_ACCOUNTS: { title: 'SaaS Hesapları', description: 'Tesis sahibi SaaS abonelik yönetimi.', group: 'Operasyon', accent: 'green' },
};

export const ACCENT_STYLES: Record<AdminAccent, { icon: string; ring: string; badge: string }> = {
  red: { icon: 'text-red-400', ring: 'ring-red-500/20', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  green: { icon: 'text-green-400', ring: 'ring-green-500/20', badge: 'bg-green-500/10 text-green-400 border-green-500/20' },
  yellow: { icon: 'text-yellow-400', ring: 'ring-yellow-500/20', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  blue: { icon: 'text-blue-400', ring: 'ring-blue-500/20', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  purple: { icon: 'text-purple-400', ring: 'ring-purple-500/20', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  pink: { icon: 'text-pink-400', ring: 'ring-pink-500/20', badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  cyan: { icon: 'text-cyan-400', ring: 'ring-cyan-500/20', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  orange: { icon: 'text-orange-400', ring: 'ring-orange-500/20', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

export function getRouteMeta(route: string): AdminRouteMeta {
  return ADMIN_ROUTE_META[route as GodViewSubRoute] ?? {
    title: route,
    description: 'Platform yönetim modülü',
    group: 'OYNA OS',
    accent: 'red',
  };
}

/** Command palette navigasyon listesi — sidebar ile senkron tutun */
export const COMMAND_PALETTE_ROUTES: Array<{ label: string; route: GodViewSubRoute; category: string }> = [
  { label: 'Genel Bakış', route: 'GENEL', category: 'Komuta' },
  { label: 'Komuta Merkezi', route: 'CONTROL', category: 'Komuta' },
  { label: 'Finans Merkezi', route: 'FINANCE', category: 'Finans' },
  { label: 'Komisyon', route: 'COMMISSION', category: 'Finans' },
  { label: 'İhtilaflar', route: 'DISPUTES', category: 'Finans' },
  { label: 'Hizmet İtirazları', route: 'SERVICE_DISPUTES', category: 'Finans' },
  { label: 'Sahalar', route: 'SAHALAR', category: 'Operasyon' },
  { label: 'Kullanıcılar', route: 'KULLANICILAR', category: 'Operasyon' },
  { label: 'Kaleciler', route: 'KALECİLER', category: 'Operasyon' },
  { label: 'Hakemler', route: 'HAKEMLER', category: 'Operasyon' },
  { label: 'Onay Bekleyenler', route: 'PENDING_VERIFICATIONS', category: 'Operasyon' },
  { label: 'Kimlik Doğrulama', route: 'PROVIDER_IDENTITIES', category: 'Operasyon' },
  { label: 'Tesis Onayları', route: 'MODERATION', category: 'Operasyon' },
  { label: 'SaaS Hesapları', route: 'OWNER_ACCOUNTS', category: 'Operasyon' },
  { label: 'Maçlar', route: 'MATCHES', category: 'Operasyon' },
  { label: 'Topluluklar', route: 'TOPLULUKLAR', category: 'Topluluk' },
  { label: 'Takımlar', route: 'TAKIMLAR', category: 'Topluluk' },
  { label: 'Turnuvalar', route: 'TURNUVALAR', category: 'Topluluk' },
  { label: 'Kampanyalar', route: 'NOTIFICATIONS', category: 'Pazarlama' },
  { label: 'İndirim Kodları', route: 'PROMO_CODES', category: 'Pazarlama' },
  { label: 'Denetim Kayıtları', route: 'AUDIT_LOG', category: 'Sistem' },
  { label: 'CMS Metinler', route: 'CONTENT', category: 'Sistem' },
  { label: 'Sistem Ayarları', route: 'SETTINGS', category: 'Sistem' },
  { label: 'Ekipler & Yetkiler', route: 'ACL', category: 'Sistem' },
];
