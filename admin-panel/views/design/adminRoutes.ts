import type { LucideIcon } from 'lucide-react';
import {
  Zap, MapPin, Users, Shield, Scale, Megaphone, CreditCard, Settings, Type,
  Radio, Swords, Lock, Globe, Trophy, ScrollText, ShieldCheck, AlertOctagon,
  SlidersHorizontal, MessageSquare, Building2, BadgeCheck, UserX, Baby,
} from 'lucide-react';
import type { GodViewSubRoute } from '../GodViewPanel';

export type AdminAccent = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'pink' | 'cyan' | 'orange';

/** Sidebar rozetinin hangi canlı sayaçtan besleneceği (hesap Sidebar'da). */
export type AdminBadgeKey =
  | 'live' | 'pitches' | 'users' | 'matches' | 'goalkeepers' | 'referees'
  | 'pendingPitches' | 'openDisputes' | 'verification' | 'activePromos' | 'communities'
  | 'deletionRequests' | 'userReports';

export interface AdminRouteDef {
  route: GodViewSubRoute;
  /** Sayfa başlığı (PageShell / breadcrumb). */
  title: string;
  /** Sidebar & palette'te görünen kısa etiket. */
  label: string;
  description: string;
  /** Breadcrumb grubu. */
  group: string;
  /** Sidebar grup başlığı; null → sidebar'da görünmez. */
  sidebarGroup: string | null;
  accent: AdminAccent;
  icon: LucideIcon;
  inPalette: boolean;
  /** Kapsam-dışı modül: yalnız bu feature flag açıkken erişilebilir. */
  featureFlag?: string;
  badge?: AdminBadgeKey;
  /** Bu route'lar aktifken de sidebar öğesi vurgulanır (alt sekmeler). */
  activeAlso?: GodViewSubRoute[];
}

export const SIDEBAR_GROUP_ORDER = [
  'BÖLGE KOMUTASI',
  'OYUN YÖNETİMİ',
  'TESİS YÖNETİMİ',
  'PLATFORM AKTÖRLERİ',
  'GÜVENLİK & MODERASYON',
  'TOPLULUK YÖNETİMİ',
  'BİLDİRİM & PAZARLAMA',
  'FİNANS',
  'SİSTEM',
] as const;

/**
 * TEK KAYNAK route registry (Karar #46).
 * Sidebar, komut paleti ve sayfa meta'sı bu diziden türetilir — üç ayrı listeyi
 * elle senkron tutma dönemi kapandı. Kapsam-dışı modüller feature flag ile
 * gizlenir (Karar #43/#47): kod silinmez, yüzeyden tamamen kalkar.
 */
export const ADMIN_ROUTES: AdminRouteDef[] = [
  // ── Komuta ────────────────────────────────────────────────────────────────
  { route: 'GENEL', title: 'Genel Bakış', label: 'Genel', description: 'Platform KPI, gelir trendi ve operasyon özeti.', group: 'Komuta', sidebarGroup: 'BÖLGE KOMUTASI', accent: 'red', icon: Radio, inPalette: true },
  { route: 'CONTROL', title: 'Komuta Merkezi', label: 'Komuta Merkezi', description: 'Canlı kuyruklar, ghost arama ve acil operasyonlar.', group: 'Komuta', sidebarGroup: 'BÖLGE KOMUTASI', accent: 'red', icon: Zap, inPalette: true, badge: 'live' },

  // ── Oyun Yönetimi ─────────────────────────────────────────────────────────
  { route: 'MATCHES', title: 'Maçlar', label: 'Maçlar', description: 'Maç kokpiti: kadro, skor, ödeme ve müdahale.', group: 'Oyun Yönetimi', sidebarGroup: 'OYUN YÖNETİMİ', accent: 'red', icon: Swords, inPalette: true, badge: 'matches' },
  { route: 'TAKIMLAR', title: 'Takımlar', label: 'Takımlar', description: 'Platform takım kayıtları ve kaptan bilgileri.', group: 'Oyun Yönetimi', sidebarGroup: 'OYUN YÖNETİMİ', accent: 'blue', icon: Users, inPalette: true },

  // ── Tesis Yönetimi ────────────────────────────────────────────────────────
  { route: 'SAHALAR', title: 'Sahalar', label: 'Sahalar', description: 'Tesis envanteri, vitrin kurulumu ve onay durumları.', group: 'Tesis Yönetimi', sidebarGroup: 'TESİS YÖNETİMİ', accent: 'green', icon: MapPin, inPalette: true, badge: 'pitches' },
  { route: 'MODERATION', title: 'Tesis Onayları', label: 'Tesis Onayları', description: 'Saha ve çekim taleplerinin moderasyonu.', group: 'Tesis Yönetimi', sidebarGroup: 'TESİS YÖNETİMİ', accent: 'yellow', icon: Shield, inPalette: true, badge: 'pendingPitches' },
  { route: 'REGION_COVERAGE', title: 'Bölge Kapsama', label: 'Bölge Kapsama', description: 'Hizmet kapsamındaki il/ilçeler ve harita sınırları.', group: 'Tesis Yönetimi', sidebarGroup: 'TESİS YÖNETİMİ', accent: 'yellow', icon: Globe, inPalette: true },

  // ── Platform Aktörleri ────────────────────────────────────────────────────
  { route: 'KULLANICILAR', title: 'Kullanıcılar', label: 'Kullanıcılar', description: 'Oyuncu profilleri, ban ve rol yönetimi.', group: 'Platform Aktörleri', sidebarGroup: 'PLATFORM AKTÖRLERİ', accent: 'blue', icon: Users, inPalette: true, badge: 'users' },
  { route: 'KALECİLER', title: 'Kaleciler', label: 'Kaleciler', description: 'Kaleci profilleri, yetenekler ve ücretler.', group: 'Platform Aktörleri', sidebarGroup: 'PLATFORM AKTÖRLERİ', accent: 'green', icon: Shield, inPalette: true, badge: 'goalkeepers' },
  { route: 'HAKEMLER', title: 'Hakemler', label: 'Hakemler', description: 'Hakem profilleri, seviye ve maç geçmişi.', group: 'Platform Aktörleri', sidebarGroup: 'PLATFORM AKTÖRLERİ', accent: 'yellow', icon: Scale, inPalette: true, badge: 'referees' },

  // ── Güvenlik & Moderasyon ─────────────────────────────────────────────────
  { route: 'VERIFICATION', title: 'Doğrulama Merkezi', label: 'Doğrulama', description: 'Kaleci/hakem başvuruları, kimlik doğrulama ve tesis onayları tek ekranda.', group: 'Güvenlik & Moderasyon', sidebarGroup: 'GÜVENLİK & MODERASYON', accent: 'yellow', icon: ShieldCheck, inPalette: true, badge: 'verification', activeAlso: ['PENDING_VERIFICATIONS', 'PROVIDER_IDENTITIES'] },
  { route: 'USER_REPORTS', title: 'Kullanıcı Şikayetleri', label: 'Şikayetler', description: 'Oyuncuların birbirleri hakkında açtığı şikayetlerin (spam, taciz, hile) moderasyonu.', group: 'Güvenlik & Moderasyon', sidebarGroup: 'GÜVENLİK & MODERASYON', accent: 'red', icon: AlertOctagon, inPalette: true, badge: 'userReports' },
  { route: 'DELETION_QUEUE', title: 'Silme Kuyruğu', label: 'Silme Kuyruğu', description: 'Bekleyen hesap silme talepleri (KVKK).', group: 'Güvenlik & Moderasyon', sidebarGroup: 'GÜVENLİK & MODERASYON', accent: 'red', icon: UserX, inPalette: true, badge: 'deletionRequests' },
  { route: 'GUARDIAN_CONSENTS', title: 'Veli Onayları', label: 'Veli Onayları', description: 'Reşit olmayan kullanıcılar için veli muvafakatleri ve bekleyen onaylar.', group: 'Güvenlik & Moderasyon', sidebarGroup: 'GÜVENLİK & MODERASYON', accent: 'purple', icon: Baby, inPalette: true },

  // Doğrulama Merkezi'nin alt sekmeleri — sidebar'da yok, palette'ten erişilir.
  { route: 'PENDING_VERIFICATIONS', title: 'Onay Bekleyenler', label: 'Onay Bekleyenler', description: 'Kaleci ve hakem doğrulama talepleri.', group: 'Güvenlik & Moderasyon', sidebarGroup: null, accent: 'yellow', icon: BadgeCheck, inPalette: true },
  { route: 'PROVIDER_IDENTITIES', title: 'Kimlik Doğrulama', label: 'Kimlik Doğrulama', description: 'Sağlayıcı kimlik doğrulama kuyruğu (kaleci & hakem).', group: 'Güvenlik & Moderasyon', sidebarGroup: null, accent: 'blue', icon: BadgeCheck, inPalette: true },

  // ── Topluluk (kapsam-dışı; flag ile) ─────────────────────────────────────
  { route: 'TOPLULUKLAR', title: 'Topluluklar', label: 'Topluluklar', description: 'Topluluk talepleri ve kayıtlı gruplar.', group: 'Topluluk', sidebarGroup: 'TOPLULUK YÖNETİMİ', accent: 'blue', icon: Globe, inPalette: true, featureFlag: 'module_community', badge: 'communities' },
  { route: 'TURNUVALAR', title: 'Turnuvalar', label: 'Turnuvalar', description: 'Turnuva planlama ve durum takibi.', group: 'Topluluk', sidebarGroup: 'TOPLULUK YÖNETİMİ', accent: 'yellow', icon: Trophy, inPalette: true, featureFlag: 'module_tournaments' },

  // ── Bildirim & Pazarlama ─────────────────────────────────────────────────
  { route: 'NOTIFICATIONS', title: 'Kampanyalar', label: 'Kampanyalar', description: 'Toplu bildirim ve duyuru gönderimi.', group: 'Bildirim', sidebarGroup: 'BİLDİRİM & PAZARLAMA', accent: 'pink', icon: Megaphone, inPalette: true },
  { route: 'NOTIFICATION_TEMPLATES', title: 'Bildirim Şablonları', label: 'Bildirim Şablonları', description: 'Uygulama bildirim metinlerini panelden düzenle.', group: 'Bildirim', sidebarGroup: 'BİLDİRİM & PAZARLAMA', accent: 'pink', icon: MessageSquare, inPalette: true },
  { route: 'PROMO_CODES', title: 'İndirim Kodları', label: 'İndirim Kodları', description: 'Promo kod oluşturma ve kullanım takibi.', group: 'Bildirim', sidebarGroup: 'BİLDİRİM & PAZARLAMA', accent: 'purple', icon: Zap, inPalette: true, featureFlag: 'module_promo_codes', badge: 'activePromos' },

  // ── Finans ───────────────────────────────────────────────────────────────
  { route: 'FINANCE', title: 'Finans', label: 'Finans Merkezi', description: 'Ledger, cüzdan hareketleri ve tahsilatlar.', group: 'Finans', sidebarGroup: 'FİNANS', accent: 'yellow', icon: CreditCard, inPalette: true },
  { route: 'DISPUTES', title: 'İhtilaflar', label: 'İhtilaflar', description: 'Maç anlaşmazlıkları ve çözüm süreci.', group: 'Finans', sidebarGroup: 'FİNANS', accent: 'orange', icon: Scale, inPalette: true, badge: 'openDisputes' },
  { route: 'SERVICE_DISPUTES', title: 'Hizmet İtirazları', label: 'Hizmet İtirazları', description: 'Sağlayıcı hizmet ödemesi itirazları ve serbest bırakma.', group: 'Finans', sidebarGroup: 'FİNANS', accent: 'orange', icon: AlertOctagon, inPalette: true },
  { route: 'COMMISSION', title: 'Komisyon', label: 'Komisyon', description: 'Çok seviyeli komisyon oranları ve model yapılandırması.', group: 'Finans', sidebarGroup: 'FİNANS', accent: 'green', icon: Zap, inPalette: true },
  { route: 'OWNER_ACCOUNTS', title: 'SaaS Hesapları', label: 'SaaS Hesapları', description: 'Tesis sahibi SaaS abonelik yönetimi (kapsam dışı).', group: 'Finans', sidebarGroup: 'FİNANS', accent: 'green', icon: Building2, inPalette: true, featureFlag: 'module_owner_saas' },

  // ── Sistem ───────────────────────────────────────────────────────────────
  { route: 'AUDIT_LOG', title: 'Denetim Kayıtları', label: 'Denetim Kayıtları', description: 'Admin aksiyon geçmişi ve iz sürme.', group: 'Sistem', sidebarGroup: 'SİSTEM', accent: 'purple', icon: ScrollText, inPalette: true },
  { route: 'CONTENT', title: 'CMS Metinler', label: 'Metinler', description: 'Uygulama genelinde görünen metinler.', group: 'Sistem', sidebarGroup: 'SİSTEM', accent: 'pink', icon: Type, inPalette: true },
  { route: 'SETTINGS', title: 'Sistem Ayarları', label: 'Ayarlar', description: 'Ödeme modu, kayıt ve bakım modu.', group: 'Sistem', sidebarGroup: 'SİSTEM', accent: 'red', icon: Settings, inPalette: true },
  { route: 'SYSTEM_PARAMS', title: 'Sistem Parametreleri', label: 'Parametreler', description: 'Maç, fair-play ve rezervasyon kurallarını ve modülleri panelden yönet.', group: 'Sistem', sidebarGroup: 'SİSTEM', accent: 'cyan', icon: SlidersHorizontal, inPalette: true },
  { route: 'ACL', title: 'Ekipler & Yetkiler', label: 'Ekipler & Yetkiler', description: 'Platform admin rolleri ve erişim kontrolü.', group: 'Sistem', sidebarGroup: 'SİSTEM', accent: 'orange', icon: Lock, inPalette: true },
];

const ROUTE_INDEX = new Map(ADMIN_ROUTES.map((r) => [r.route, r]));

export function getRouteDef(route: string): AdminRouteDef | undefined {
  return ROUTE_INDEX.get(route as GodViewSubRoute);
}

export interface AdminRouteMeta {
  title: string;
  description: string;
  group: string;
  accent: AdminAccent;
}

export function getRouteMeta(route: string): AdminRouteMeta {
  const def = ROUTE_INDEX.get(route as GodViewSubRoute);
  if (def) return { title: def.title, description: def.description, group: def.group, accent: def.accent };
  return { title: route, description: 'Platform yönetim modülü', group: 'OYNA OS', accent: 'red' };
}

/** Kapsam-dışı route → feature_flags anahtarı (registry'den türetilir). */
export const SCOPE_GATED_ROUTES: Partial<Record<GodViewSubRoute, string>> = Object.fromEntries(
  ADMIN_ROUTES.filter((r) => r.featureFlag).map((r) => [r.route, r.featureFlag as string]),
);

/** Komut paleti listesi (registry'den türetilir). */
export const COMMAND_PALETTE_ROUTES: Array<{ label: string; route: GodViewSubRoute; category: string }> =
  ADMIN_ROUTES.filter((r) => r.inPalette).map((r) => ({ label: r.label, route: r.route, category: r.group }));

/** Sidebar grupları (registry'den türetilir; sıra SIDEBAR_GROUP_ORDER). */
export const SIDEBAR_GROUPS: Array<{ label: string; items: AdminRouteDef[] }> = SIDEBAR_GROUP_ORDER
  .map((label) => ({ label, items: ADMIN_ROUTES.filter((r) => r.sidebarGroup === label) }))
  .filter((g) => g.items.length > 0);

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
