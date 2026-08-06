import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepName from '../../views/onboarding/StepName';
import { POSITION_LABEL, POSITION_CODE } from '../../views/onboarding/onboardingShared';

// ════════════════════════════════════════════════════════════════════════════
// "NORMAL OYUNCU KENDİNİ KALECİ AYARLAYABİLİR" — kurucu kararı (2026-08-06)
// ════════════════════════════════════════════════════════════════════════════
//
// "Onboarding ve profil kısmında normal oyuncuların da kaleci olarak
//  kendilerini ayarlayabilmelerini sağlamalıyız."
//
// Kaleci, oyuncunun MEVKİSİDİR — "Kaleci rolü"yle (pazaryerinde kiralanan
// hizmet sağlayıcı) karıştırılmamalı. Normal oyuncu iki yerden de kendini
// kaleci diyebilir:
//   · Tanıtım (onboarding) 2. adım → POZİSYON · KL
//   · Profil → Profili Düzenle → 02 Oyun → KL
// ve maçta kale slotunu seçmesinin önünde hiçbir engel yoktur.
//
// Bu testler o iki kapıyı KİLİTLER. Eskiden hiçbir test kaleci seçeneğinin
// varlığını korumuyordu: dört mevkiden biri sessizce listeden düşse kimse
// fark etmezdi.
// ════════════════════════════════════════════════════════════════════════════

const bosStepName = (over: Partial<React.ComponentProps<typeof StepName>> = {}) => ({
  firstName: 'Kerem',
  lastName: 'Yılmaz',
  gender: '' as const,
  position: '' as const,
  onFirst: vi.fn(),
  onLast: vi.fn(),
  onGender: vi.fn(),
  onPosition: vi.fn(),
  ...over,
});

describe('tanıtım (onboarding) — kaleci seçilebiliyor', () => {
  it('POZİSYON şeridinde Kaleci var', () => {
    render(<StepName {...bosStepName()} />);
    expect(screen.getByText('Kaleci')).toBeInTheDocument();
    expect(screen.getByText('KL')).toBeInTheDocument();
  });

  it('dokununca kaleci kodu yukarı bildiriliyor', () => {
    const onPosition = vi.fn();
    render(<StepName {...bosStepName({ onPosition })} />);
    fireEvent.click(screen.getByText('KL'));
    expect(onPosition).toHaveBeenCalledWith('kaleci');
  });

  it('seçiliyken tekrar dokunmak seçimi kaldırır (mevki opsiyonel)', () => {
    const onPosition = vi.fn();
    render(<StepName {...bosStepName({ position: 'kaleci', onPosition })} />);
    fireEvent.click(screen.getByText('KL'));
    expect(onPosition).toHaveBeenCalledWith('');
  });

  it('dört mevki de sunuluyor — kaleci listeden düşmüyor', () => {
    render(<StepName {...bosStepName()} />);
    for (const kisa of ['KL', 'SAV', 'ORT', 'HÜC']) {
      expect(screen.getByText(kisa), `${kisa} mevkisi`).toBeInTheDocument();
    }
  });
});

describe('mevki sözlüğü — kaleci gidiş-dönüş bozulmuyor', () => {
  it('kod → profil metni → kod çevrimi kayıpsız', () => {
    // Tanıtım 'kaleci' kodunu tutar, veritabanına 'Kaleci' metni yazılır,
    // profil ekranı yeniden açıldığında koda geri çevrilir. Halkanın bir
    // ucu kopsa kullanıcının seçtiği mevki ekranda "seçili" görünmezdi.
    expect(POSITION_LABEL.kaleci).toBe('Kaleci');
    expect(POSITION_CODE[POSITION_LABEL.kaleci]).toBe('kaleci');
  });
});

describe('profil düzenleme — kaleci seçeneği duruyor', () => {
  it('mevki ızgarası dört seçenekle besleniyor ve kaleci ilk sırada', () => {
    // ProfileEditSheet ağır bir katman (portal + görsel yükleme + tarih
    // seçici); burada render etmek yerine seçenek kaynağını doğruluyoruz.
    // Izgara doğrudan bu diziden çiziliyor.
    const kaynak = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'components/profile/ProfileEditSheet.tsx'),
      'utf8',
    ) as string;
    expect(kaynak).toContain("const POSITION_ORDER = ['kaleci', 'defans', 'orta', 'forvet'] as const");
    expect(kaynak).toContain('POSITION_ORDER.map');
  });
});
