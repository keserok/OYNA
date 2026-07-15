// B9: "Eksik pozisyonlar" TEK kaynaktan — kadrodaki gerçek OPEN slotlardan
// türetilir. (Eski kod her maça sabit "1 STP + 1 ORT" yazıyordu; dolu maçta
// bile sahte "ARANIYOR" rozetleri çıkıyor, pozisyon filtresi yanlış çalışıyordu.)

export interface SlotLike {
  status?: string | null;
  role?: string | null;
}

export interface MissingPosition {
  role: string;
  count: number;
}

/** OPEN slotları role göre sayar; rol bilinmiyorsa 'OYUNCU'. Deterministik sıra. */
export function deriveMissingPositions(slots: Array<SlotLike | null | undefined>): MissingPosition[] {
  const counts = new Map<string, number>();
  for (const s of slots) {
    if (!s || s.status !== 'OPEN') continue;
    const role = (s.role || 'OYUNCU').toString().trim().toUpperCase() || 'OYUNCU';
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role, 'tr'));
}
