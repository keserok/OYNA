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

/** Kimlik/foto çözülemeyen oyuncular için nötr, isimden üretilen avatar. */
export function avatarFor(seed: string, name?: string): string {
  const label = (name || 'Oyuncu').trim();
  return `https://ui-avatars.com/api/?background=0D1117&color=39FF14&bold=true&name=${encodeURIComponent(label)}&seed=${encodeURIComponent(seed)}`;
}

const ROLE_SHORT: Record<'GK' | 'DEF' | 'MID' | 'FWD', string> = { GK: 'KL', DEF: 'SAV', MID: 'ORT', FWD: 'HÜC' };
export function roleShort(role?: string): string { return ROLE_SHORT[normalizeRole(role)]; }

export function normalizeRole(role?: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const r = (role || '').toUpperCase();
  if (r === 'GK' || r.includes('KALE') || r === 'KL') return 'GK';
  if (r === 'DEF' || r.startsWith('D') || r.includes('BACK') || r === 'SAV' || r === 'CB' || r === 'LB' || r === 'RB') return 'DEF';
  if (r === 'FWD' || r === 'FW' || r === 'ST' || r === 'CF' || r.includes('FOR') || r === 'HÜC' || r === 'LW' || r === 'RW') return 'FWD';
  return 'MID';
}

/** Squad size'ı ÖNCE maç.format kolonundan al (tek otorite), yoksa slot sayısından. */
export function inferSquadSize(slotCount: number, format?: string | null): SquadSize {
  const f = (format || '').toLowerCase().trim() as SquadSize;
  if (f && (SQUAD_SIZES as string[]).includes(f)) return f;
  if (slotCount <= 2) return '2v2';
  if (slotCount <= 3) return '3v3';
  if (slotCount <= 4) return '4v4';
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

export interface LobbyUser { id: string; name: string; avatar?: string; rating?: number }

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
      return { ...slot, player: { id: u.id, name: u.name || 'Oyuncu', avatar: u.avatar || avatarFor(u.id, u.name), rating: u.rating ?? 5, position: slot.role, x: slot.x, y: slot.y, paymentStatus: slot.player?.paymentStatus } as Player };
    }
    if (slot.player?.name) return { ...slot, player: { ...slot.player, avatar: slot.player.avatar || avatarFor(slot.player.id || slot.id, slot.player.name), position: slot.role, x: slot.x, y: slot.y } as Player };
    if (uid) return { ...slot, player: { id: uid, name: 'Oyuncu', avatar: avatarFor(uid), rating: 5, position: slot.role, x: slot.x, y: slot.y } as Player };
    return slot;
  });
}

/** Atanmış gerçek oyuncu id'leri (ham slotlardan — userId dahil). */
export function collectAssignedIds(...groups: (PositionSlot[] | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) for (const s of g || []) { const uid = slotUserId(s); if (uid) ids.add(uid); }
  return ids;
}
