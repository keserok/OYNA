/**
 * BİLDİRİM EKRANI — GERÇEKTEN NE ÇİZİLİYOR (23 Ağustos 2026)
 *
 * Kardeş dosya `telefonPushuVaadi.test.ts` kaynağın BİÇİMİNE bakar; bu dosya
 * ekranı gerçekten çizip ne göründüğünü okur. İkisi ayrı ayrı gerekli:
 * koşul doğru yazılmış ama yanlış bloğu sarıyor olabilir — biçim testi bunu
 * göremez, çizim testi görür.
 *
 * KURAL: telefona push GİTMİYORKEN ekran "telefonun çalmaz" diye bir söz
 * VERMEZ; bunun yerine durumu açıkça söyler. Anahtar açıkken sessiz saatler
 * geri gelir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

const pushCanli = vi.fn();

vi.mock('../../notifications/pushCanliMi', () => ({
  pushCanliMi: () => pushCanli(),
  pushCanliOnbelleginiSil: () => {},
}));

vi.mock('../../notifications/notificationPreferences', () => ({
  fetchNotificationTemplates: () => Promise.resolve([]),
  fetchNotificationMode: () => Promise.resolve('TUMU'),
  setNotificationMode: () => Promise.resolve(true),
  updateAllNotificationPreferences: () => Promise.resolve(true),
  MODE_LEVEL: { TUMU: 3, ONEMLI: 2, ZORUNLU: 1 },
}));

vi.mock('../../supabaseAuth', () => ({ auth: { currentUser: { uid: 'u1' } } }));

vi.mock('../../store', () => ({
  useAppStore: () => ({
    notificationPreferences: {},
    setNotificationPreferences: () => {},
  }),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

import NotificationSettingsPage from '../../components/settings/NotificationSettingsPage';

const ciz = () => render(<NotificationSettingsPage open onClose={() => {}} />);

describe('Bildirim ekranı · telefon pushu KAPALI', () => {
  beforeEach(() => { pushCanli.mockReset(); pushCanli.mockResolvedValue(false); });
  afterEach(cleanup);

  it('durumu açıkça söyler', async () => {
    ciz();
    expect(await screen.findByText(/telefon bildirimleri henüz açık değil/i)).toBeTruthy();
  });

  it('"telefonun çalmaz" sözünü VERMEZ — sessiz saatler çizilmez', async () => {
    ciz();
    await screen.findByText(/telefon bildirimleri henüz açık değil/i);
    expect(screen.queryByText(/bu aralıkta telefonun çalmaz/i)).toBeNull();
    expect(screen.queryByRole('switch', { name: /sessiz saatler/i })).toBeNull();
  });

  it('üç mod YİNE seçilebilir — uygulama içi bildirimde bugün de geçerli', async () => {
    ciz();
    await screen.findByText(/telefon bildirimleri henüz açık değil/i);
    for (const b of ['Hepsi', 'Önemli olanlar', 'Sadece zorunlu']) {
      expect(screen.getByText(b)).toBeTruthy();
    }
  });
});

describe('Bildirim ekranı · telefon pushu AÇIK', () => {
  beforeEach(() => { pushCanli.mockReset(); pushCanli.mockResolvedValue(true); });
  afterEach(cleanup);

  it('sessiz saatler geri gelir, uyarı şeridi çıkmaz', async () => {
    ciz();
    expect(await screen.findByText(/bu aralıkta telefonun çalmaz/i)).toBeTruthy();
    expect(screen.queryByText(/telefon bildirimleri henüz açık değil/i)).toBeNull();
  });
});

describe('Bildirim ekranı · anahtar HENÜZ BİLİNMİYOR', () => {
  afterEach(cleanup);

  it('cevap gelmeden ne söz verir ne suçlar — ikisi de çizilmez', async () => {
    // Hiç çözülmeyen istek: ilk kare bu hâldedir.
    pushCanli.mockReset();
    pushCanli.mockReturnValue(new Promise(() => {}));
    ciz();
    await waitFor(() => expect(screen.getByText('Hepsi')).toBeTruthy());
    expect(screen.queryByText(/bu aralıkta telefonun çalmaz/i)).toBeNull();
    expect(screen.queryByText(/telefon bildirimleri henüz açık değil/i)).toBeNull();
  });
});
