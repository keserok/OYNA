import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Fotoğraf yükleme gerçek depoya çıkmasın — düzenleme ekranının sözleşmesi
// test edilecek, yükleyicinin kendisi değil.
vi.mock('../../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: vi.fn(), uploading: false }),
}));

import { ProfileEditSheet, type ProfileEditValues } from '../../../components/profile/ProfileEditSheet';

// ─── PROFİLİ DÜZENLE — SÖZLEŞME (tasarım 4c, kullanıcı kararları) ────────────
//
// 1. KAYIT: `onSave` hata FIRLATIRSA kayıt başarısızdır → ekran AÇIK kalır ve
//    onClose ÇAĞRILMAZ. Sorunsuz dönerse "Kaydedildi" görünür ve ekran kendini
//    kapatır. (Ebeveynler artık başarıda kendileri kapatmıyor; kapatma bu
//    sözleşmeye emanet — sessiz dönüş sahte "Kaydedildi" üretirdi.)
// 2. SEVİYE: 1–10 sayı düğmeleri. Beyan HENÜZ YOKKEN aynı sayıya ikinci
//    dokunuş taslağı temizler; KAYITLI beyan temizlenemez (sunucu kapısı
//    NULL'u reddediyor — istemci de aynı kuralı sürer).
// 3. Salt-okunur mod (admin aynası): seviye düğmeleri devre dışıdır.

const TEMEL: ProfileEditValues = {
  position: 'Orta Saha', bio: 'Merhaba', birthdate: '1999-04-12',
  gender: 'erkek', playStyle: 'rahat', avatarUrl: '', selfSkill: null,
};

const ciz = (over: Partial<React.ComponentProps<typeof ProfileEditSheet>> = {}) => {
  const props = {
    open: true,
    name: 'Emre Kaya',
    initial: TEMEL,
    saving: false,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  return { ...render(<ProfileEditSheet {...props} />), props };
};

const seviyeDugmesi = (n: number) => screen.getByLabelText(`Seviye ${n}`);

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('ProfileEditSheet — kayıt sözleşmesi', () => {
  it('basarili kayitta once Kaydedildi gorunur, SONRA ekran kapanir', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    ciz({ onSave, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydedildi' })).toBeInTheDocument());
    // Onay görünürken ekran HÂLÂ açık — kullanıcı sonucu görüyor.
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onSave hata firlatirsa ekran ACIK kalir, Kaydedildi YAZMAZ', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('ağ hatası'));
    const onClose = vi.fn();
    ciz({ onSave, onClose, errorText: 'Kaydedilemedi. Bağlantını kontrol edip tekrar dene.' });

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Kaydedildi' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeInTheDocument();
    expect(screen.getByText(/Kaydedilemedi/)).toBeInTheDocument();
  });

  it('kaydederken dugme Kaydediliyor yazar ve kilitlidir', () => {
    const onSave = vi.fn();
    ciz({ onSave, saving: true });
    const dugme = screen.getByRole('button', { name: 'Kaydediliyor…' });
    expect(dugme).toBeDisabled();
    fireEvent.click(dugme);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('secilen degerler onSave a oldugu gibi gider', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    ciz({ onSave });

    fireEvent.click(screen.getByRole('button', { name: /Kaleci/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kadın/ }));
    fireEvent.click(seviyeDugmesi(6));
    fireEvent.click(screen.getByRole('button', { name: 'Ciddi' }));
    fireEvent.change(screen.getByLabelText('Kısa tanıtım'), { target: { value: 'Yeni tanıtım' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      position: 'Kaleci', gender: 'kadin', playStyle: 'ciddi',
      selfSkill: 6, bio: 'Yeni tanıtım', birthdate: '1999-04-12',
    });
  });

  it('geri oku ekrani kaydetmeden kapatir', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    ciz({ onSave, onClose });
    fireEvent.click(screen.getByLabelText('Geri'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('ProfileEditSheet — seviye beyanı', () => {
  it('beyan YOKKEN ayni sayiya ikinci dokunus taslagi temizler', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    ciz({ onSave, initial: { ...TEMEL, selfSkill: null } });

    fireEvent.click(seviyeDugmesi(4));
    expect(screen.getByText(/ORTA · 4\/10/)).toBeInTheDocument();

    fireEvent.click(seviyeDugmesi(4)); // ikinci dokunuş → taslak temizlenir
    expect(screen.queryByText(/ORTA · 4\/10/)).not.toBeInTheDocument();
    expect(screen.getByText(/Henüz seviye beyanın yok/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].selfSkill).toBeNull();
  });

  it('KAYITLI beyan ikinci dokunusla TEMIZLENMEZ', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    ciz({ onSave, initial: { ...TEMEL, selfSkill: 7 } });

    fireEvent.click(seviyeDugmesi(7));
    expect(screen.getByText(/ORTA · 7\/10/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].selfSkill).toBe(7);
  });

  it('band cipi 1-3 BASLANGIC · 4-7 ORTA · 8-10 ILERI kuralini izler', () => {
    ciz({ initial: { ...TEMEL, selfSkill: null } });
    fireEvent.click(seviyeDugmesi(2));
    expect(screen.getByText(/BAŞLANGIÇ · 2\/10/)).toBeInTheDocument();
    fireEvent.click(seviyeDugmesi(9));
    expect(screen.getByText(/İLERİ · 9\/10/)).toBeInTheDocument();
  });

  it('salt-okunur modda (admin aynasi) seviye dugmeleri devre disidir', () => {
    ciz({ selfSkillEditable: false, initial: { ...TEMEL, selfSkill: 5 } });
    expect(seviyeDugmesi(3)).toBeDisabled();
    expect(seviyeDugmesi(8)).toBeDisabled();
    expect(screen.getByText(/değiştirilemez/)).toBeInTheDocument();
  });
});

describe('ProfileEditSheet — tanıtım sayacı', () => {
  it('yazdikca sayac guncellenir ve 200 karakterle sinirlidir', () => {
    ciz({ initial: { ...TEMEL, bio: '' } });
    const alan = screen.getByLabelText('Kısa tanıtım') as HTMLTextAreaElement;
    expect(screen.getByText('0/200')).toBeInTheDocument();
    fireEvent.change(alan, { target: { value: 'abcde' } });
    expect(screen.getByText('5/200')).toBeInTheDocument();
    expect(alan.maxLength).toBe(200);
  });
});

describe('ProfileEditSheet — kapalıyken', () => {
  it('open=false iken hicbir sey cizilmez', () => {
    ciz({ open: false });
    expect(screen.queryByText('01 — Kimlik')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
  });
});
