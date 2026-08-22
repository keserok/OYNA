/**
 * NUMARA ADIMI DUVAR DEĞİL — GERÇEK DOM KİLİDİ (22 Ağustos 2026)
 *
 * Apple, OYNA'yı Guideline 5.6 (Developer Code of Conduct) altında reddetti:
 * "the app contains features that appear to have been intentionally hidden
 * during the review process." Sebep zinciri şuydu —
 *
 *   SMS yalnız +90 numaralara gidiyor
 *     → Google/Apple ile girenden istenen numara adımı ATLANAMIYOR
 *       → yurt dışındaki hiç kimse (incelemeci dahil) uygulamayı açamıyor
 *         → incelemeye özel bir paket derlendi (`VITE_MAGAZA_INCELEME`)
 *           → Apple bunu gizlenmiş özellik saydı. Haklıydı.
 *
 * Zincirin ilk halkası kırıldı: adım artık atlanabilir. Bu dosya kaynakta
 * metin aramaz — ekranı GERÇEKTEN çizer ve düğmeye dokunur. Düzeltme zihnen
 * geri alındığında kırmızı dönmesinin tek yolu budur.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const cikisYap = vi.fn();
vi.mock('../../supabaseAuth', () => ({
  requestPhoneLink: vi.fn(),
  confirmPhoneLink: vi.fn(),
  logout: (...a: unknown[]) => cikisYap(...a),
}));
vi.mock('../../components/common/Toast', () => ({
  useKlavyeOrtusu: () => 0,
  klavyeliAltDolgu: () => 26,
}));

import PhoneLinkScreen from '../../views/PhoneLinkScreen';

describe('numara adımı · giriş bağlamı (atlanabilir)', () => {
  const onLinked = vi.fn();
  const onSkip = vi.fn();
  beforeEach(() => { onLinked.mockClear(); onSkip.mockClear(); cikisYap.mockClear(); });

  const ciz = () => render(<PhoneLinkScreen onLinked={onLinked} onSkip={onSkip} gerekce="giris" />);

  it('ATLA düğmesi ekranda ve dokunulduğunda çıkışı çağırıyor', () => {
    ciz();
    const atla = screen.getByRole('button', { name: 'ŞİMDİLİK ATLA' });
    fireEvent.click(atla);
    expect(onSkip).toHaveBeenCalledTimes(1);
    // Atlamak OTURUMU KAPATMAZ: kullanıcı uygulamanın içinde kalır.
    expect(cikisYap).not.toHaveBeenCalled();
  });

  it('adımın isteğe bağlı olduğu YAZIYOR', () => {
    ciz();
    // Yazmazsak kullanıcı kapalı kapı sanır ve çıkışı hiç denemez.
    expect(screen.getByText(/İstersen şimdi ekle, istersen sonra/)).toBeTruthy();
  });

  it('çıkış yapma yolu da duruyor (hesabı değiştirmek isteyen için)', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'ÇIKIŞ YAP' }));
    expect(cikisYap).toHaveBeenCalledTimes(1);
  });

  it('yurt dışı numarada bile ekran kapanabiliyor — çıkmaz uç yok', () => {
    // Reddin somut sahnesi: incelemeci +1 yazıyor, kod hiçbir zaman gelmiyor.
    // O anda ATLA düğmesi hâlâ orada olmalı.
    ciz();
    fireEvent.change(screen.getByLabelText('Ülke kodu'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Telefon numarası'), { target: { value: '2025550147' } });
    expect(screen.getByText(/Yurt dışı numaralara kod gönderimi henüz açık değil/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ŞİMDİLİK ATLA' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('numara adımı · ödeme bağlamı (gerekli ama kilitlemez)', () => {
  const onLinked = vi.fn();
  const onSkip = vi.fn();
  beforeEach(() => { onLinked.mockClear(); onSkip.mockClear(); cikisYap.mockClear(); });

  const ciz = () => render(<PhoneLinkScreen onLinked={onLinked} onSkip={onSkip} gerekce="odeme" />);

  it('gerekçe SOMUT yazılıyor — neden şimdi istendiği anlaşılıyor', () => {
    ciz();
    expect(screen.getByText(/maç günü tesis ve kaptan sana bu numaradan ulaşacak/)).toBeTruthy();
    // "İstersen sonra" DEMEZ: burada numara gerçekten gerekiyor.
    expect(screen.queryByText(/İstersen şimdi ekle, istersen sonra/)).toBeNull();
  });

  it('VAZGEÇ ile kapanıyor — kullanıcı ödemenin ortasında kilitlenmiyor', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'VAZGEÇ' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('işin ortasında ÇIKIŞ YAP göstermiyor — yanlış düğmeye basılmasın', () => {
    ciz();
    expect(screen.queryByRole('button', { name: 'ÇIKIŞ YAP' })).toBeNull();
  });
});
