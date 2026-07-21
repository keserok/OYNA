import { describe, it, expect } from 'vitest';
import {
    statusMeta, filterEntries, sortEntries, mineToEntry, showcaseToEntry,
} from '../../views/studio/tacticLibrary';
import type { LibraryEntry } from '../../views/studio/tacticLibrary';

// ─── Taktik Kütüphanesi — saf yardımcılar ─────────────────────────────────────

describe('statusMeta', () => {
    it('durumu etiket + tona çevirir', () => {
        expect(statusMeta('APPROVED')).toEqual({ label: 'Onaylı', tone: 'ok' });
        expect(statusMeta('PENDING_APPROVAL')).toEqual({ label: 'Onay bekliyor', tone: 'wait' });
        expect(statusMeta('REJECTED')).toEqual({ label: 'Reddedildi', tone: 'no' });
        expect(statusMeta(null)).toEqual({ label: '', tone: 'none' });
    });
});

const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({
    id: 'x', name: 'Plan', formation: '2-3-1', size: '7v7',
    status: 'APPROVED', isActive: false, source: 'MINE', ...over,
});

describe('filterEntries', () => {
    const list = [
        entry({ id: 'a', name: 'Yüksek Pres', formation: '4-3-3' }),
        entry({ id: 'b', name: 'Kontra', formation: '3-5-2' }),
    ];

    it('boş sorgu tümünü döndürür', () => {
        expect(filterEntries(list, '   ')).toHaveLength(2);
    });

    it('ada göre süzer', () => {
        expect(filterEntries(list, 'kontra').map(e => e.id)).toEqual(['b']);
    });

    it('dizilişe göre süzer', () => {
        expect(filterEntries(list, '4-3-3').map(e => e.id)).toEqual(['a']);
    });

    it('Türkçe büyük/küçük harf duyarsız (İ/ı)', () => {
        expect(filterEntries(list, 'YÜKSEK').map(e => e.id)).toEqual(['a']);
        expect(filterEntries([entry({ id: 'c', name: 'Işık' })], 'ışık').map(e => e.id)).toEqual(['c']);
    });
});

describe('sortEntries', () => {
    it('aktif plan daima en üstte', () => {
        const out = sortEntries([
            entry({ id: 'a', name: 'Bbb', isActive: false }),
            entry({ id: 'b', name: 'Aaa', isActive: true }),
        ]);
        expect(out[0].id).toBe('b');
    });

    it('aktif eşitse onaylı > bekleyen > reddedilen', () => {
        const out = sortEntries([
            entry({ id: 'r', name: 'r', status: 'REJECTED' }),
            entry({ id: 'p', name: 'p', status: 'PENDING_APPROVAL' }),
            entry({ id: 'a', name: 'a', status: 'APPROVED' }),
        ]);
        expect(out.map(e => e.id)).toEqual(['a', 'p', 'r']);
    });

    it('durum eşitse ada göre (tr) sıralar', () => {
        const out = sortEntries([
            entry({ id: 'z', name: 'Zebra' }),
            entry({ id: 'c', name: 'Çınar' }),
            entry({ id: 'a', name: 'Ada' }),
        ]);
        expect(out.map(e => e.id)).toEqual(['a', 'c', 'z']);
    });

    it('girdiyi mutasyona uğratmaz', () => {
        const input = [entry({ id: 'a', isActive: false }), entry({ id: 'b', isActive: true })];
        const copy = [...input];
        sortEntries(input);
        expect(input).toEqual(copy);
    });
});

describe('mineToEntry / showcaseToEntry', () => {
    it('kişisel satırı normalize eder (varsayılan APPROVED, aktif değil)', () => {
        expect(mineToEntry({ id: 't1', name: 'Test', formation: '4-4-2', size: '11v11' })).toEqual({
            id: 't1', name: 'Test', formation: '4-4-2', size: '11v11',
            status: 'APPROVED', isActive: false, source: 'MINE',
        });
    });

    it('adsız kişisel satıra yedek ad verir', () => {
        expect(mineToEntry({ id: 't2' }).name).toBe('Adsız Taktik');
    });

    it('vitrin satırını takım kaynağına çevirir (aktiflik + teamId taşınır)', () => {
        const e = showcaseToEntry({
            id: 's1', name: 'Aktif Plan', formation: '2-3-1', size: '7v7',
            status: 'APPROVED', is_active: true,
        }, 'team-9');
        expect(e).toEqual({
            id: 's1', name: 'Aktif Plan', formation: '2-3-1', size: '7v7',
            status: 'APPROVED', isActive: true, source: 'TEAM', teamId: 'team-9',
        });
    });
});
