// Taktik Kütüphanesi — saf yardımcılar (SSOT).
//
// Stüdyodaki "KAYITLI TAKTİKLER" penceresi kişisel kütüphaneyi ve üyesi
// olunan takımların oyun defterlerini TEK yerde gösterir. Bu modül yalnız
// veri normalleştirme + süzme + sıralama + durum etiketi mantığını taşır;
// React'e ve stüdyo durumuna bağımlı değildir (kolay test edilir).

export type TacticStatus = 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | null;

/** Kütüphanede tek satır — kişisel ya da takım kaynaklı, ortak biçim. */
export interface LibraryEntry {
    id: string;
    name: string;
    formation: string | null;
    size: string | null;
    status: TacticStatus;
    isActive: boolean;        // takımın aktif maç planı mı?
    source: 'MINE' | 'TEAM';
    teamId?: string;
}

export type StatusTone = 'ok' | 'wait' | 'no' | 'none';

export interface StatusMeta {
    label: string;
    tone: StatusTone;
}

/** Durum → rozet etiketi + ton (renk kararını UI verir; burada yalnız anlam). */
export const statusMeta = (status: TacticStatus): StatusMeta => {
    switch (status) {
        case 'APPROVED': return { label: 'Onaylı', tone: 'ok' };
        case 'PENDING_APPROVAL': return { label: 'Onay bekliyor', tone: 'wait' };
        case 'REJECTED': return { label: 'Reddedildi', tone: 'no' };
        default: return { label: '', tone: 'none' };
    }
};

const norm = (s: string) =>
    s.toLocaleLowerCase('tr').replace('ı', 'i').replace('İ', 'i');

/** Ada + dizilişe göre süzer (Türkçe büyük/küçük duyarsız). */
export const filterEntries = (entries: LibraryEntry[], query: string): LibraryEntry[] => {
    const q = norm(query.trim());
    if (!q) return entries;
    return entries.filter(e =>
        norm(e.name).includes(q) || norm(e.formation || '').includes(q));
};

/** Aktif plan en üstte; sonra onaylı > bekleyen > reddedilen; sonra ada göre. */
export const sortEntries = (entries: LibraryEntry[]): LibraryEntry[] => {
    const statusRank: Record<string, number> = { APPROVED: 0, PENDING_APPROVAL: 1, REJECTED: 2 };
    return [...entries].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const ra = statusRank[a.status ?? 'APPROVED'] ?? 0;
        const rb = statusRank[b.status ?? 'APPROVED'] ?? 0;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name, 'tr');
    });
};

/** Kişisel taktik satırı (parseDbTactic çıktısı benzeri) → LibraryEntry. */
export const mineToEntry = (t: {
    id?: string; name?: string; formation?: string | null; size?: string | null; status?: TacticStatus;
}): LibraryEntry => ({
    id: t.id || '',
    name: t.name || 'Adsız Taktik',
    formation: t.formation ?? null,
    size: t.size ?? null,
    status: t.status ?? 'APPROVED',
    isActive: false,
    source: 'MINE',
});

/** Takım vitrini satırı (TacticShowcaseItem) → LibraryEntry. */
export const showcaseToEntry = (t: {
    id: string; name: string | null; formation: string | null; size: string | null;
    status: string | null; is_active: boolean;
}, teamId: string): LibraryEntry => ({
    id: t.id,
    name: t.name || 'Adsız Taktik',
    formation: t.formation,
    size: t.size,
    status: (t.status as TacticStatus) ?? 'APPROVED',
    isActive: !!t.is_active,
    source: 'TEAM',
    teamId,
});
