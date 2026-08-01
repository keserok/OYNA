import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProfileHero } from '../../../components/profile/ProfileHero';

// ─── PROFİL KİMLİK KARTI — SÖZLEŞME (tasarım 3a "İnce Neon", kullanıcı kararı) ─
//
// 1. Koleksiyon kartı (🎴) geçişi KALDIRILDI: tasarımda yok, düğmesi hiç çizilmez.
// 2. Mevki/yaş/cinsiyet/oyun stili AYRI KUTULARDA, iki sütunlu ızgarada durur.
//    (2026-08 kullanıcı kararı: eskiden tek satır künyeydi ve `truncate` ile
//    kesiliyordu — dar telefonda son bilgi hiç görünmüyordu.) Olmayan bilgi
//    kutusu hiç çizilmez; tek sayıda bilgi varsa sonuncusu tam genişliktir.
// 3. Galibiyet oranı veri yokken "%0" değil "—" yazar (IP-18).
//
// Ölçüt TEK YERDE (ProfileHero) hesaplanır — tüketici profili ile admin aynası
// aynı bileşeni kullandığı için ikisi asla ayrışamaz.

const ciz = (over: Partial<React.ComponentProps<typeof ProfileHero>> = {}) =>
  render(
    <ProfileHero
      name="Deneme Oyuncu"
      verified={false}
      position={null}
      age={null}
      matches={0}
      winRate={null}
      {...over}
    />,
  );

describe('ProfileHero — kimlik kartı', () => {
  it('koleksiyon kartı gecis dugmesi ARTIK CIZILMEZ', () => {
    ciz({ position: 'Orta Saha', matches: 12 });
    expect(screen.queryByLabelText('Kart görünümü')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sade görünüm')).not.toBeInTheDocument();
    expect(screen.getByText('Deneme Oyuncu')).toBeInTheDocument();
  });

  it('dort bilgi AYRI KUTULARDA gorunur, tek satira sikismaz', () => {
    ciz({ position: 'Orta Saha', age: 27, gender: 'erkek', playStyle: 'rahat' });
    for (const etiket of ['MEVKİ', 'YAŞ', 'CİNSİYET', 'OYUN STİLİ']) {
      expect(screen.getByText(etiket)).toBeInTheDocument();
    }
    expect(screen.getByText('Orta Saha')).toBeInTheDocument();
    expect(screen.getByText('27 yaş')).toBeInTheDocument();
    expect(screen.getByText('Erkek')).toBeInTheDocument();
    expect(screen.getByText('Rahat')).toBeInTheDocument();
  });

  it('kutular iki sutunlu izgarada — yani iki satira bolunur', () => {
    const { container } = ciz({ position: 'Kaleci', age: 31, gender: 'kadin', playStyle: 'ciddi' });
    const izgara = container.querySelector('.grid.grid-cols-2');
    expect(izgara, 'iki sutunlu izgara yok').not.toBeNull();
    expect(izgara!.children.length).toBe(4);
    for (const kutu of Array.from(izgara!.children)) {
      expect(kutu.className).not.toContain('truncate');
    }
  });

  it('tek sayida bilgi varsa sonuncusu tam genislik kaplar', () => {
    const { container } = ciz({ position: 'Defans', age: 24, playStyle: 'taktiksel' });
    const izgara = container.querySelector('.grid.grid-cols-2')!;
    expect(izgara.children.length).toBe(3);
    expect(izgara.children[2].className).toContain('col-span-2');
  });

  it('eksik bilgiler icin BOS KUTU birakilmaz', () => {
    const { container } = ciz({ position: 'Kaleci', age: null, gender: null, playStyle: null });
    const izgara = container.querySelector('.grid.grid-cols-2')!;
    expect(izgara.children.length).toBe(1);
    expect(screen.getByText('Kaleci')).toBeInTheDocument();
  });

  it('hic bilgi yoksa izgara hic cizilmez', () => {
    const { container } = ciz({ position: null, age: null, gender: null, playStyle: null });
    expect(container.querySelector('.grid.grid-cols-2')).toBeNull();
  });

  it('isim ve istatistik sayilari BUYUK puntoda', () => {
    const { container } = ciz({ matches: 12, winRate: 58 });
    expect(container.querySelector('h1')!.className).toContain('text-[1.375rem]');
    const buyukSayilar = Array.from(container.querySelectorAll('p'))
      .filter(p => p.className.includes('text-[1.5rem]'));
    expect(buyukSayilar.length).toBe(2); // MAÇ + GALİBİYET (EN İYİ verilmedi)
  });

  it('dogum tarihi yoksa onboarding yas araligi kullanilir', () => {
    ciz({ position: null, age: null, ageRange: '24-30' });
    expect(screen.getByText('24–30 yaş')).toBeInTheDocument();
  });

  it('hic skorlu mac yokken galibiyet orani — yazar, %0 degil', () => {
    ciz({ matches: 3, winRate: null });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('%0')).not.toBeInTheDocument();
  });

  it('MVP verisi yokken EN IYI hucresi cizilmez', () => {
    const { rerender } = ciz({ matches: 5, winRate: 60, mvp: null });
    expect(screen.queryByText('EN İYİ')).not.toBeInTheDocument();
    rerender(
      <ProfileHero name="Deneme Oyuncu" position={null} age={null} matches={5} winRate={60} mvp={3} />,
    );
    expect(screen.getByText('EN İYİ')).toBeInTheDocument();
  });
});
