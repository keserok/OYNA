// ════════════════════════════════════════════════════════════════════════════
// MAÇ KUR · YAYINLA BUTONU
// ════════════════════════════════════════════════════════════════════════════
//
// Kullanıcı kararı (2026-08): alttaki KAYDIRMALI onay kaldırıldı, yerine
// DOĞRUDAN BASILAN bir buton kondu. Buton yalnız temel ayarların hepsi
// tamamlanınca (`canPublish`) çizilir.
//
// Bu test kararın geri sızmasını ve kablolamanın kopmasını engeller. Kaydırma
// iki kez geri gelmeye çalıştı (dikey kaydırmayla çakışan 56px'lik tutamak),
// bu yüzden yazıyla değil testle tutuluyor.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(process.cwd(), 'views/MatchCreate.tsx'), 'utf8');

/** Yorum satırları kuralın dışında: "neden kaldırdık" anlatısı serbesttir. */
const kod = s
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('Maç Kur — yayın onayı doğrudan butondur', () => {
  it('kaydırmalı onay mekaniği KALMADI', () => {
    // Sürükleme durumu, tutamak ve pencere seviyesindeki pointer takibi —
    // üçü de gitti. Biri geri gelirse eskisinin yarısı yeniden kurulmuş olur.
    for (const iz of ['onThumbDown', 'slideValRef', 'dragRef', 'setSlide(']) {
      expect(kod, `${iz} geri gelmiş`).not.toContain(iz);
    }
    expect(kod, 'Kaydır → yayınla metni geri gelmiş').not.toContain('Kaydır');
    expect(kod).not.toContain('Bırak ve yayınla');
  });

  it('yayın gerçek bir <button> ile tetikleniyor', () => {
    // `motion.button` → DOM'da <button>: klavyeyle odaklanır, Enter/Space ile
    // çalışır, ekran okuyucu "düğme" der. Eski tutamak bir <div>'di.
    expect(kod).toMatch(/<motion\.button[\s\S]{0,400}onClick=\{onPublish\}/);
    expect(kod).toContain('Maçı Yayınla');
  });

  it('buton YALNIZ temel ayarlar tamamlanınca çizilir', () => {
    // Alt barın üç hâli: yayınlanıyor · hazır (buton) · hazır değil (şerit).
    // Ortadaki dal `canPublish`e bağlı kalmalı.
    expect(kod).toMatch(/publishing \?[\s\S]{0,4000}\) : canPublish \? \([\s\S]{0,600}<motion\.button/);
  });

  it('hazır değilken NE EKSİK olduğu yazıyor', () => {
    expect(kod).toContain('Önce saha seç');
    expect(kod).toContain('Saat seç');
  });

  it('hazır ve hazır değil hâlleri AYNI yükseklikte — alt bar zıplamaz', () => {
    const yukseklikler = [...kod.matchAll(/h-\[68px\]/g)];
    expect(yukseklikler.length, 'iki hâl de h-[68px] olmalı').toBeGreaterThanOrEqual(2);
  });

  it('çift basma korumaSI duruyor — iki maç açılamaz', () => {
    // Buton iki kez basılsa da `publish` kendi kilidinde durur.
    expect(kod).toContain('publishBusyRef.current = true');
    expect(kod).toMatch(/if \(publishBusyRef\.current\) return;/);
  });

  it('buton her zaman GÜNCEL publish sürümünü çağırıyor', () => {
    // `publish` her render'da yeniden kurulur; ref olmadan buton eski
    // kapanışı (stale closure) çağırır ve seçim değişiklikleri kaybolur.
    expect(kod).toContain('publishRef.current = publish');
    expect(kod).toMatch(/const onPublish = \(\) => \{[\s\S]{0,200}publishRef\.current\(\)/);
  });

  it('hareket hassasiyeti olan kullanıcıda beliriş animasyonu kapanıyor', () => {
    expect(kod).toContain('useLowMotion');
    expect(kod).toMatch(/initial=\{lowMotion \? false :/);
  });
});
