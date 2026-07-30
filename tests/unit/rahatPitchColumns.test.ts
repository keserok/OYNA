import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── TESİS SORGUSU — KOLON ADI SÖZLEŞMESİ ───────────────────────────────────
//
// NEDEN BU TEST VAR: Rahat lobisinin tesis kartı canlıda KOMPLE boş geliyordu.
// Sebep tek kelimeydi — sorgu `pitches.location` istiyordu ama o kolonun adı
// `address`. PostgREST var olmayan bir kolon istendiğinde tek alanı atlamaz,
// SORGUNUN TAMAMINI reddeder; çağıran da hatayı yutup null döndüğü için
// tesis adı, adres, açıklama, olanaklar, harita ve tesise özel iade kademesi
// sessizce yok oluyordu.
//
// NEDEN TESTLER YAKALAYAMADI: görsel test hermetiktir (ağ kapalı), tesis
// sorgusu zaten hiç çalışmıyor ve "veri yoksa kart çizilmez" davranışı doğru
// görünüyordu. Yani yeşil test, kırık üretim demekti. Bu dosya o boşluğu
// kapatır: kolon adları kaynak metinden doğrulanır, ağ gerektirmez.

const KOK = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

/** pitches tablosunun GERÇEK kolon adları (canlı şemadan doğrulandı). */
const PITCHES_KOLONLARI = new Set([
  'id', 'name', 'address', 'district', 'city', 'description', 'amenities',
  'images', 'latitude', 'longitude', 'rating', 'googleRating', 'owner_id',
  'refund_full_hours', 'refund_half_hours', 'refund_half_pct',
  'payment_mode', 'payment_mode_locked_by_admin',
]);

/** Kaynaktan `.from('pitches').select('...')` içindeki kolon listesini çıkarır. */
function pitchesSelectKolonlari(src: string): string[] {
  const m = src.match(/\.from\('pitches'\)[\s\S]{0,400}?\.select\(\s*'([^']+)'/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

describe('Rahat tesis sorgusu — kolon adları gerçek şemayla uyuşuyor', () => {
  const src = oku('services/rahatMatchService.ts');

  it('sorgu gercekten pitches tablosundan kolon seciyor', () => {
    const kolonlar = pitchesSelectKolonlari(src);
    expect(kolonlar.length, 'pitches select listesi bulunamadı').toBeGreaterThan(0);
  });

  it('secilen her kolon pitches tablosunda GERCEKTEN var', () => {
    const kolonlar = pitchesSelectKolonlari(src);
    const olmayan = kolonlar.filter((k) => !PITCHES_KOLONLARI.has(k));
    expect(
      olmayan,
      `pitches tablosunda olmayan kolon istendi (PostgREST TÜM sorguyu reddeder): ${olmayan.join(', ')}`,
    ).toEqual([]);
  });

  it("'location' ADI KULLANILMAZ — tesisin adres kolonu 'address'tir", () => {
    const kolonlar = pitchesSelectKolonlari(src);
    expect(kolonlar).not.toContain('location');
    expect(kolonlar).toContain('address');
  });

  it('adres okumasi kanonik esleme ile ayni deseni kullanir', () => {
    // shared/pitchShowcaseMapper.ts:223 → location: row.address ?? ilçe/il
    expect(src).toMatch(/location:\s*\(row\.address/);
    expect(src).not.toMatch(/row\.location/);
  });

  it('tesise ozel iade kademesi kolonlari da sorguda', () => {
    const kolonlar = pitchesSelectKolonlari(src);
    for (const k of ['refund_full_hours', 'refund_half_hours', 'refund_half_pct']) {
      expect(kolonlar, `${k} olmadan tesis override'ı okunamaz`).toContain(k);
    }
  });
});
