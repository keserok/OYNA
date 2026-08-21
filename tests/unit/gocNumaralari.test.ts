// ════════════════════════════════════════════════════════════════════════════
// GÖÇ NUMARALARI — ÇAKIŞMA BEKÇİSİ
// ════════════════════════════════════════════════════════════════════════════
//
// Supabase göç geçmişini dosya adının başındaki NUMARAYLA (version) tutar; o
// numara `supabase_migrations.schema_migrations` tablosunun birincil anahtarıdır.
// İki dosya aynı numarayı taşırsa `supabase db push` numarayı "zaten uygulandı"
// görüp İKİNCİSİNİ SESSİZCE ATLAR — kod o göçün nesnelerini bekler ama taze bir
// ortamda (staging, yeni kurulum) o nesneler hiç yaratılmaz.
//
// Bu tam olarak 20 Ağustos 2026'da yaşandı: iki dal birbirinden habersiz
// `20260914000000` numarasını kullandı ve birleştirmede yan yana geldiler.
// Test o günden beri bekçilik ediyor — çakışma birleştirme anında yakalanır,
// aylar sonra boş bir staging veritabanında değil.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';

const gocDosyalari = (): string[] =>
  readdirSync(join(process.cwd(), MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));

describe('göç dosyası numaraları', () => {
  it('dosyalar okunuyor (bekçi gerçekten çalışıyor)', () => {
    expect(gocDosyalari().length).toBeGreaterThan(400);
  });

  it('her göç dosyası numarayla başlar', () => {
    const bicimsiz = gocDosyalari().filter((f) => !/^\d{14,17}_/.test(f));
    expect(
      bicimsiz,
      'Bu dosyalar `<numara>_<ad>.sql` biçiminde değil; Supabase bunları göç ' +
      'olarak tanımaz:\n' + bicimsiz.join('\n'),
    ).toEqual([]);
  });

  it('aynı numarayı iki dosya paylaşmıyor', () => {
    const numaraya: Record<string, string[]> = {};
    for (const dosya of gocDosyalari()) {
      const numara = dosya.split('_')[0];
      (numaraya[numara] ||= []).push(dosya);
    }
    const cakisanlar = Object.entries(numaraya)
      .filter(([, dosyalar]) => dosyalar.length > 1)
      .map(([numara, dosyalar]) => `${numara}:\n    ${dosyalar.join('\n    ')}`);

    expect(
      cakisanlar,
      'Aynı göç numarasını birden fazla dosya kullanıyor. `supabase db push` ' +
      'yalnız BİRİNİ uygular, diğerini sessizce atlar — taze bir veritabanında ' +
      'o göçün nesneleri hiç oluşmaz. Çakışan dosyalardan CANLIDA KAYITLI ' +
      'OLMAYANI boş bir numaraya taşı:\n' + cakisanlar.join('\n'),
    ).toEqual([]);
  });
});
