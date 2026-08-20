// ════════════════════════════════════════════════════════════════════════
// PAYLAŞILAN LOBİ ZENGİNLEŞTİRME — TEK KAYNAK (SSOT)
// Hem tüketici (views/MatchJoin) hem admin (MatchLobbyPitch) BU dosyadan
// beslenir. Amaç: aynı maçın aynı slotunu iki uygulamada AYNI koordinata
// koymak (drift yok) ve DB minimal slotundan ({id,status,userId,player?})
// kanonik x/y/role + gerçek oyuncu çözümü üretmek.
// utils/formations.ts kanonik formasyon SSOT'udur; bu modül onu sarmalar.
// ════════════════════════════════════════════════════════════════════════
import type { PositionSlot, Player } from '../types';
import { FORMATIONS, type SquadSize, SQUAD_SIZES } from '../utils/formations';
import { trInitials } from '../utils/trUpper';

/**
 * Kimlik/foto çözülemeyen kişiler için baş harf avatarı — YEREL ve SAYDAM.
 *
 * Kurucu kararı (20 Ağu 2026): "baş harfler opak, arka plan saydam." Eskiden
 * burası ui-avatars.com'a gidiyordu; o servis zemini PNG'nin İÇİNE boyar
 * (saydam üretemez), çevrimdışıyken hiç gelmez ve demo hesaplardaki "açık
 * mavi yuvarlak" tam bu sınıftandı. Artık kendi SVG'mizi data-URI olarak
 * üretiyoruz: zemin YOK (fill=none), harfler opak beyaz, ince beyaz halka —
 * components/common/UserAvatar'ın baş harf yedeğiyle aynı dil, her kart
 * renginin üstünde doğru görünür, ağ gerektirmez.
 *
 * `seed` imza uyumu için duruyor (eski çağıranlar konumla geçer); üretimde
 * kullanılmaz — aynı isim her yerde aynı yuvarlağı verir (kurucu kararı
 * 2026-08-06: tek görsel dil).
 */
export function avatarFor(seed: string, name?: string): string {
  void seed;
  const harfler = trInitials(name || 'Oyuncu', 2, '•');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="30.5" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>' +
    `<text x="32" y="33.5" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui,sans-serif" font-size="23" font-style="italic" font-weight="800" fill="#FFFFFF">${harfler}</text>` +
    '</svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ROLE_SHORT: Record<'GK' | 'DEF' | 'MID' | 'FWD', string> = { GK: 'KL', DEF: 'SAV', MID: 'ORT', FWD: 'HÜC' };
export function roleShort(role?: string): string { return ROLE_SHORT[normalizeRole(role)]; }

// Tüketici (MatchJoin) + admin role kısaltmalarının ÜST KÜMESİ — iki taraf da bunu kullanır.
export function normalizeRole(role?: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const r = (role || '').toUpperCase();
  if (r === 'GK' || r === 'KL' || r === 'K' || r.includes('KALE')) return 'GK';
  if (r === 'DEF' || r === 'SAV' || r === 'STP' || r === 'STOPER' || r === 'S'
      || r === 'CB' || r === 'LB' || r === 'RB' || r.startsWith('D') || r.includes('BACK')) return 'DEF';
  if (r === 'FWD' || r === 'FW' || r === 'HÜC' || r === 'HÜCUM' || r === 'SNT' || r === 'F'
      || r === 'ST' || r === 'CF' || r === 'LW' || r === 'RW' || r.includes('FOR')) return 'FWD';
  return 'MID';
}

/** Squad size'ı ÖNCE maç.format kolonundan al (tek otorite), yoksa slot sayısından.
 *  Sayı yedeği tüketici (MatchJoin) ile birebir: ≤5 → 5v5 (sıfır-regresyon). */
export function inferSquadSize(slotCount: number, format?: string | null): SquadSize {
  const f = (format || '').toLowerCase().trim() as SquadSize;
  if (f && (SQUAD_SIZES as string[]).includes(f)) return f;
  if (slotCount <= 5) return '5v5';
  if (slotCount <= 6) return '6v6';
  if (slotCount <= 7) return '7v7';
  if (slotCount <= 8) return '8v8';
  if (slotCount <= 9) return '9v9';
  if (slotCount <= 10) return '10v10';
  return '11v11';
}

/** DB minimal slotlarına kanonik formasyondan x/y/role bas (tüketici ile birebir algoritma). */
export function applyCanonicalCoords(slots: PositionSlot[], format?: string | null): PositionSlot[] {
  if (!slots || slots.length === 0) return [];
  const formationsForSize = FORMATIONS[inferSquadSize(slots.length, format)];
  if (!formationsForSize) return slots;
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return slots;

  const canonicalByRole: Record<string, { x: number; y: number; role: string }[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  firstFormation.forEach((c) => { const n = normalizeRole(c.role); if (canonicalByRole[n]) canonicalByRole[n].push(c); });
  Object.keys(canonicalByRole).forEach((k) => canonicalByRole[k].sort((a, b) => a.x - b.x));

  const slotsByRole: Record<string, PositionSlot[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  slots.forEach((s) => { const n = normalizeRole(s.role); if (slotsByRole[n]) slotsByRole[n].push(s); });
  Object.keys(slotsByRole).forEach((k) => slotsByRole[k].sort((a, b) => (a.x || 0) - (b.x || 0)));

  const result: PositionSlot[] = [];
  const usedKeys = new Set<string>();
  Object.keys(slotsByRole).forEach((role) => {
    slotsByRole[role].forEach((slot, i) => {
      const coord = canonicalByRole[role][i];
      if (coord) { result.push({ ...slot, role: slot.role || coord.role, x: coord.x, y: coord.y }); usedKeys.add(`${coord.x},${coord.y}`); }
      else result.push({ ...slot, x: -1, y: -1 });
    });
  });
  const unused = firstFormation.filter((c) => !usedKeys.has(`${c.x},${c.y}`));
  let ui = 0;
  return result.map((slot) => {
    if (slot.x === -1 && slot.y === -1) {
      const coord = unused[ui++];
      if (coord) return { ...slot, role: slot.role || coord.role, x: coord.x, y: coord.y };
      const orig = slots.find((s) => s.id === slot.id);
      return { ...slot, role: slot.role || orig?.role || 'MID', x: orig?.x || 50, y: orig?.y || 50 };
    }
    return slot;
  });
}

/** Slot'tan kimlik: player.id öncelikli, yoksa üst-seviye userId (seed/admin uyumu). */
export function slotUserId(slot: PositionSlot): string | undefined {
  return slot.player?.id || (slot as unknown as { userId?: string }).userId;
}

export interface LobbyUser { id: string; name: string; avatar?: string; selfSkill?: number | null }

/**
 * Kanonik koordinat + GERÇEK oyuncu çözümü. DEMO-FALLBACK YOK:
 * çözülemeyen TAKEN slot, mevcut player bilgisini korur ya da userId'den
 * minimal kimlik üretir; rastgele başka kullanıcı BASILMAZ.
 */
export function enrichSlots(slots: PositionSlot[], users: LobbyUser[], format?: string | null): PositionSlot[] {
  return applyCanonicalCoords(slots, format).map((slot) => {
    if (slot.status !== 'TAKEN') return slot;
    const uid = slotUserId(slot);
    const u = uid ? users.find((x) => x.id === uid) : undefined;
    if (u) {
      return { ...slot, player: { id: u.id, name: u.name || 'Oyuncu', avatar: u.avatar || avatarFor(u.id, u.name), selfSkill: u.selfSkill ?? null, position: slot.role, x: slot.x, y: slot.y, paymentStatus: slot.player?.paymentStatus } as Player };
    }
    if (slot.player?.name) return { ...slot, player: { ...slot.player, avatar: slot.player.avatar || avatarFor(slot.player.id || slot.id, slot.player.name), position: slot.role, x: slot.x, y: slot.y } as Player };
    if (uid) return { ...slot, player: { id: uid, name: 'Oyuncu', avatar: avatarFor(uid), position: slot.role, x: slot.x, y: slot.y } as Player };
    return slot;
  });
}

/** Atanmış gerçek oyuncu id'leri (ham slotlardan — userId dahil). */
export function collectAssignedIds(...groups: (PositionSlot[] | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) for (const s of g || []) { const uid = slotUserId(s); if (uid) ids.add(uid); }
  return ids;
}

// ════════════════════════════════════════════════════════════════════════
// KİRALIK KALECİ GÖRÜNÜRLÜK POLİTİKASI (SSOT)
// Kural: kiralık kaleci YALNIZ kiralayan takımın üyelerine gösterilir
// (altta "Maç Görevlileri" kartı + sahada kalede). Rakip takım ve dış
// izleyiciler kaleciyi görmez. Hakem bu politikanın DIŞINDADIR: iki
// takımın ekranında da altta görünür.
//
// İki taraflı kaleci: taraf, HANGİ matches kolonunun dolu olduğundan okunur
// (gk_id = ev sahibi, away_gk_id = deplasman). Bu herkese açık (matches SELECT
// public) → kaptan-olmayan takım üyeleri de kendi kalecisini görür; RLS-kısıtlı
// service_requests'e bağımlılık yoktur.
// ════════════════════════════════════════════════════════════════════════

/**
 * Görüntüleyenin hangi tarafın kalecisini görebileceğini çözer.
 * Her taraf için: o tarafın kalecisi atanmış (id dolu) VE görüntüleyen o
 * tarafın üyesi → görünür. Taraflar bağımsız değerlenir (bir kişi iki tarafın
 * da üyesiyse ikisini de görebilir; tipik durumda tek taraf).
 */
export function resolveGkVisibility(params: {
  homeGkId?: string | null;
  awayGkId?: string | null;
  viewerIsHomeMember: boolean;
  viewerIsAwayMember: boolean;
}): { canSeeHome: boolean; canSeeAway: boolean } {
  return {
    canSeeHome: !!params.homeGkId && params.viewerIsHomeMember,
    canSeeAway: !!params.awayGkId && params.viewerIsAwayMember,
  };
}

/**
 * Kiralık kalecinin sahada işgal edeceği slot: İLK boş GK slotu.
 * Gerçek bir oyuncunun aldığı (TAKEN) GK slotu asla ezilmez — o durumda
 * kaleci sahada gösterilmez (yalnız alttaki kartta kalır).
 */
export function findHiredGkSlotId(slots: (PositionSlot | null | undefined)[]): string | null {
  return (slots || []).find(s => s && s.status === 'OPEN' && normalizeRole(s.role) === 'GK')?.id ?? null;
}

// ════════════════════════════════════════════════════════════════════════
// TARAF NORMALİZASYONU — HAYALET KADRO YASAĞI
//
// BULUNAN HATA (20 Ağustos 2026): eski kayıtlarda (ve demo tohumlarında) maçın
// İKİ TARAFININ slotları tek dizide duruyor: `slots`=10, `awaySlots`=boş.
// Lobi bunu "10 kişilik EV SAHİBİ" sanıp deplasman için ŞABLONDAN 10 slot
// uyduruyordu. Sonuç: ana sayfa kartı DB'ye bakıp "6 yer kaldı" derken lobi
// 20 pozisyonluk saha çizip 14'ünü açık gösteriyordu. Üstelik uydurulan
// slotların kimliği DB'de OLMADIĞI için satın alma sunucudan dönüyordu —
// kullanıcıya var olmayan yer satmaya çalışan bir ekran.
//
// KURAL: SLOT UYDURULMAZ. Tek dizide gelen çift sayılı kadro İKİYE BÖLÜNÜR
// (ilk yarı ev sahibi, ikinci yarı deplasman — 10 slotluk 5v5 = 5+5). Tek
// sayılıysa olduğu gibi kalır ve karşı taraf BOŞ görünür; yanlış kapasite
// göstermekten iyidir. Kart ile lobi artık aynı diziyi sayar.
// ════════════════════════════════════════════════════════════════════════
export function normalizeMatchSides(
  slots: PositionSlot[] | null | undefined,
  awaySlots: PositionSlot[] | null | undefined,
): { home: PositionSlot[]; away: PositionSlot[] } {
  const home = Array.isArray(slots) ? slots : [];
  const away = Array.isArray(awaySlots) ? awaySlots : [];
  if (away.length > 0 || home.length === 0) return { home, away };
  // Yarım, gerçek bir takım boyu etmiyorsa (en küçük saha formatı 4v4) bu dizi
  // zaten TEK tarafın kadrosudur — bölmek yeni bir yalan üretirdi.
  if (home.length % 2 !== 0 || home.length < 8) return { home, away: [] };
  const yarim = home.length / 2;
  return { home: home.slice(0, yarim), away: home.slice(yarim) };
}
