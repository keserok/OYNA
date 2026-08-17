/**
 * HESAP SİLME HER ROLDE — App Store 5.1.1(v)
 *
 * Kusur: `components/common/DeleteAccountModal.tsx` kendi yorumunda "hesap silme
 * her hesap türünden aynı şekilde erişilebilir (mağaza şartı)" diyordu; ama modal
 * yalnız `views/SettingsScreen.tsx` (oyuncu) ve `views/ServiceSettings.tsx`
 * (kaleci/hakem) tarafından açılıyordu. SAHA SAHİBİ menüsünde giriş YOKTU.
 * `views/RoleSelection.tsx` sahip rolünü uygulama içinden seçilebilir kıldığı için
 * incelemeci o role geçip hesabını silemiyordu → 5.1.1(v) reddi.
 *
 * Bu dosya iki şeyi kilitler:
 *  1. Saha sahibi menüsünde silme satırı GERÇEKTEN var, GERÇEKTEN modalı açıyor ve
 *     modal GERÇEKTEN `request_account_deletion` RPC'sine gidiyor. (Satırı silersen
 *     ya da modalı render etmezsen bu testler KIRMIZI döner — "dosyada şu metin
 *     var" demiyoruz, bileşeni render edip tıklıyoruz.)
 *  2. Sunucu silmeyi reddettiğinde Türkçe gerekçe kullanıcıya GÖSTERİLİYOR
 *     (sessizce yutulmuyor) — ev kuralı 2.
 *  3. Üç ekranın üçü de aynı tek modalı kullanıyor (oyuncu · kaleci/hakem · sahip).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OwnerMenuView, type OwnerMenuViewProps } from '../../../views/owner/menu/OwnerMenuView';

// DeleteAccountModal `supabaseClient`'tan `supabase` + `clearHasAccount` alır.
// tests/setup.ts'teki genel mock yalnız `.from()` veriyor; burada RPC'yi de
// veren dosya-yerel mock ile eziyoruz ki modalın gerçek akışı çalışsın.
const sahte = vi.hoisted(() => ({ rpc: vi.fn(), clearHasAccount: vi.fn() }));
vi.mock('../../../supabaseClient', () => ({
  supabase: { rpc: sahte.rpc },
  clearHasAccount: sahte.clearHasAccount,
}));

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const bosStats = {
  isFacilityOpen: true,
  bankAccountCount: 1,
  courtsWithoutTariff: 0,
  availableBalance: 0,
  paramConfigured: true,
  courtCount: 2,
};

function props(over: Partial<OwnerMenuViewProps> = {}): OwnerMenuViewProps {
  return {
    onNavigate: vi.fn(),
    onBack: vi.fn(),
    stats: bosStats,
    onEditProfile: vi.fn(),
    onWorkingHours: vi.fn(),
    onMatches: vi.fn(),
    onBankAccounts: vi.fn(),
    onWithdrawals: vi.fn(),
    onCancellationPolicy: vi.fn(),
    onListingWindow: vi.fn(),
    onAgreement: vi.fn(),
    onPaymentMode: vi.fn(),
    onLogout: vi.fn(),
    onSecurity: vi.fn(),
    onSupport: vi.fn(),
    onNotifications: vi.fn(),
    onWidgetSettings: vi.fn(),
    onPitches: vi.fn(),
    ...over,
  };
}

const SILME_SATIRI = 'Hesabı Kalıcı Olarak Sil';

beforeEach(() => {
  vi.clearAllMocks();
  sahte.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'preview_account_deletion') {
      return { data: { can_delete: true, blockers: [], warnings: [], wait_days: 7 }, error: null };
    }
    return { data: true, error: null };
  });
});

describe('Saha sahibi menüsü — uygulama içi hesap silme (5.1.1(v))', () => {
  it('menüde silme satırı var ve "Güvenli Çıkış"ın HEMEN ÜSTÜNDE duruyor', () => {
    render(<OwnerMenuView {...props()} />);

    const silBtn = screen.getByRole('button', { name: new RegExp(SILME_SATIRI) });
    const cikisBtn = screen.getByRole('button', { name: /Güvenli Çıkış/ });

    // DOCUMENT_POSITION_FOLLOWING = 4 → çıkış butonu silme satırından SONRA geliyor.
    expect(silBtn.compareDocumentPosition(cikisBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Aralarında başka bir buton yok → "hemen üstünde".
    expect(silBtn.nextElementSibling).toBe(cikisBtn);
  });

  it('satıra dokununca DeleteAccountModal açılır ve sunucudan durumu sorar', async () => {
    render(<OwnerMenuView {...props()} />);

    // Modal açılmadan ÖNCE ortada yok.
    expect(screen.queryByRole('heading', { name: 'Hesabı Sil' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SILME_SATIRI) }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Hesabı Sil' })).toBeInTheDocument();
    });
    // Modal gerçekten çalışıyor: önizleme RPC'si çağrıldı.
    expect(sahte.rpc).toHaveBeenCalledWith('preview_account_deletion');
  });

  it('onay akışı sonunda request_account_deletion çağrılır ve oturum kapatılır', async () => {
    const onLogout = vi.fn();
    render(<OwnerMenuView {...props({ onLogout })} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SILME_SATIRI) }));
    await waitFor(() => screen.getByRole('button', { name: 'Hesabı Sil' }));

    fireEvent.click(screen.getByRole('button', { name: 'Hesabı Sil' }));
    fireEvent.change(screen.getByPlaceholderText('HESABIMI SİL'), {
      target: { value: 'HESABIMI SİL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesabımı Kalıcı Olarak Sil' }));

    await waitFor(() => {
      expect(sahte.rpc).toHaveBeenCalledWith('request_account_deletion');
    });
    // Modal 2 sn sonra onConfirmed'i çağırır → menü oturumu kapatır.
    await waitFor(() => expect(onLogout).toHaveBeenCalled(), { timeout: 4000 });
  });

  it('sunucu silmeyi reddederse gerekçe EKRANA yazılır (sessiz yutma yok)', async () => {
    // Sahip hesabının çekilebilir bakiyesi varsa sunucu istisna fırlatır.
    const mesaj = 'Cüzdanında çekilebilir 1.250,00₺ var. Silmeden önce IBAN\'ına çek.';
    sahte.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'preview_account_deletion') {
        return { data: { can_delete: true, blockers: [], warnings: [], wait_days: 7 }, error: null };
      }
      return { data: null, error: { message: mesaj } };
    });
    const onLogout = vi.fn();
    render(<OwnerMenuView {...props({ onLogout })} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SILME_SATIRI) }));
    await waitFor(() => screen.getByRole('button', { name: 'Hesabı Sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hesabı Sil' }));
    fireEvent.change(screen.getByPlaceholderText('HESABIMI SİL'), {
      target: { value: 'HESABIMI SİL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hesabımı Kalıcı Olarak Sil' }));

    await waitFor(() => expect(screen.getByText(mesaj)).toBeInTheDocument());
    // Başarısız silmede sahte başarı yok: oturum kapatılmadı.
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('önizleme "silinemez" derse gerekçeler listelenir, onay adımı hiç açılmaz', async () => {
    sahte.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'preview_account_deletion') {
        return {
          data: {
            can_delete: false,
            blockers: [{ code: 'ACTIVE_BOOKING', message: 'Aktif bir saha rezervasyonun var.' }],
            warnings: [],
            wait_days: 7,
          },
          error: null,
        };
      }
      return { data: true, error: null };
    });
    render(<OwnerMenuView {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SILME_SATIRI) }));

    await waitFor(() => {
      expect(screen.getByText('Aktif bir saha rezervasyonun var.')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Hesap Silinemiyor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hesabı Sil' })).toBeNull();
  });

  it('salt okunur modda bile silme satırı ERİŞİLEBİLİR kalır (hesap silmek kullanıcının hakkı)', () => {
    render(<OwnerMenuView {...props({ isReadOnly: true })} />);
    const silBtn = screen.getByRole('button', { name: new RegExp(SILME_SATIRI) });
    expect(silBtn).not.toBeDisabled();
  });

  it('personel/müdür erişim seviyesinde de silme satırı görünür', () => {
    render(<OwnerMenuView {...props({ accessLevel: 'STAFF' })} />);
    expect(screen.getByRole('button', { name: new RegExp(SILME_SATIRI) })).toBeInTheDocument();
  });
});

describe('"Hesap silme her rolde var" iddiası — üç ekran birden', () => {
  // Oyuncu · kaleci/hakem · saha sahibi. Üçü de TEK modalı kullanmalı; biri
  // düşerse App Store 5.1.1(v) reddi geri gelir.
  const ekranlar: { rol: string; dosya: string }[] = [
    { rol: 'Oyuncu', dosya: 'views/SettingsScreen.tsx' },
    { rol: 'Kaleci/Hakem', dosya: 'views/ServiceSettings.tsx' },
    { rol: 'Saha sahibi', dosya: 'views/owner/menu/OwnerMenuView.tsx' },
  ];

  it.each(ekranlar)('$rol ekranı ortak DeleteAccountModal\'ı içe aktarır', ({ dosya }) => {
    const s = oku(dosya);
    expect(s).toMatch(/import\s+DeleteAccountModal\s+from\s+['"][^'"]*components\/common\/DeleteAccountModal['"]/);
  });

  it.each(ekranlar)('$rol ekranı DeleteAccountModal\'ı render eder ve açan bir tetik taşır', ({ dosya }) => {
    const s = oku(dosya);
    expect(s).toContain('<DeleteAccountModal');
    // Modalı açan bir onClick tetiği olmalı — import edip render etmek yetmez,
    // kullanıcı ona ULAŞABİLMELİ.
    expect(s).toMatch(/onClick=\{\(\)\s*=>\s*set(Show)?Delete\w*\(true\)\}/);
  });
});
