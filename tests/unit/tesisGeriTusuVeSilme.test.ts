/**
 * TESİS PANELİ — GERİ TUŞU + GÜVENLİ SİLME BEKÇİLERİ (26 Ağustos 2026)
 *
 * Bu oturumda düzeltilen dört sessiz arıza geri sökülmesin:
 *
 *   1  Dört takvim modalı (özel fiyat / slot kapat / flash deal / abonman)
 *      donanım geri tuşundan habersizdi — geri tuşu modalı kapatmak yerine
 *      arkadaki ekranı değiştiriyordu.
 *   2  Onay sheet'i açıkken geri tuşu onayı İPTAL saymalı (ConfirmDialog
 *      emsali, öncelik 10).
 *   3  PitchManager editöründe geri oku kirlilik kontrolü yapmıyordu ve
 *      confirmElement editör dalında render edilmiyordu — confirm() çağrılır
 *      ama sheet hiç görünmez, Promise hiç çözülmezdi.
 *   4  Gider şablonu silme onaysızdı ve hatası .catch(() => {}) ile sessizce
 *      yutuluyordu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('1 — dört takvim modalı geri tuşuna kayıtlı olmalı', () => {
  const modallar: Array<[string, string]> = [
    ['views/owner/OwnerSpecialPriceModal.tsx', 'ozel-fiyat-modali'],
    ['views/owner/OwnerCloseSlotModal.tsx', 'slot-kapat-modali'],
    ['views/owner/OwnerFlashDealModal.tsx', 'flash-deal-modali'],
    ['views/owner/OwnerSubscriptionModal.tsx', 'abonman-modali'],
  ];

  it.each(modallar)('%s useBackDismiss kullanır', (dosya, ad) => {
    const s = oku(dosya);
    expect(s).toContain("from '../../hooks/useBackDismiss'");
    expect(s).toContain(`'${ad}'`);
    // Koşullu-mount kalıbı: görünürken hep açık, kayıt sürerken kapanmaz.
    expect(s).toContain('useBackDismiss(true,');
    expect(s).toContain('if (!saving) onClose();');
  });
});

describe('2 — onay sheet açıkken geri tuşu İPTAL saymalı', () => {
  it('useConfirmSheet hook içinde useBackDismiss (öncelik 10) kayıtlı', () => {
    const s = oku('components/ui/useConfirmSheet.tsx');
    expect(s).toContain("from '../../hooks/useBackDismiss'");
    expect(s).toContain("useBackDismiss(!!state, () => settle(false), 'confirm-sheet', 10)");
  });
});

describe('3 — PitchManager editöründe korumalı çıkış', () => {
  const s = oku('views/owner/PitchManager.tsx');

  it('geri çıkış kirlilik kontrolünden geçer (anlık görüntü + JSON kıyası)', () => {
    expect(s).toContain('editSnapshotRef');
    expect(s).toContain('editorKirli');
    expect(s).toContain("title: 'Değişiklikleri bırak?'");
    expect(s).toContain("confirmLabel: 'Bırak'");
    // Geri oku artık doğrudan setEditingPitch(null) çağırmaz.
    expect(s).not.toMatch(/onClick=\{\(\) => setEditingPitch\(null\)\}/);
  });

  it('confirmElement HEM liste HEM editör dalında render edilir', () => {
    // Editör dalı kendi return'üne sahip: sheet orada render edilmezse
    // confirm() Promise'i hiç çözülmez.
    const adet = (s.match(/\{confirmElement\}/g) ?? []).length;
    expect(adet).toBeGreaterThanOrEqual(2);
  });

  it('editör açıkken donanım geri tuşu kaydı var', () => {
    expect(s).toContain("useBackDismiss(!!editingPitch, () => { void korumaliKapat(); }, 'saha-editoru', 0)");
  });
});

describe('4 — gider şablonu silme onaylı ve hatası görünür olmalı', () => {
  const s = oku('views/owner/finance/FinanceExpenseTab.tsx');

  it('önce onay, sonra görünür hata (notify)', () => {
    expect(s).toContain("title: 'Şablonu sil?'");
    expect(s).toMatch(/await deleteExpenseTemplate\(t\.id\); loadTemplates\(\); notify\('Şablon silindi\.', 'success'\)/);
  });

  it('.catch(() => {}) sessiz yutması geri gelmesin', () => {
    expect(s).not.toContain('.catch(() => {})');
  });

  it('silme butonu 44px dokunma hedefi + Türkçe etiket taşır', () => {
    expect(s).toContain('aria-label="Şablonu sil"');
    expect(s).toMatch(/aria-label="Şablonu sil" className="w-11 h-11 flex items-center justify-center/);
  });
});

describe('5 — finans yüzeyinde ham hata mesajı kalmadı', () => {
  const dosyalar = [
    'views/owner/finance/FinanceExpenseTab.tsx',
    'views/owner/finance/CollectModal.tsx',
    'views/owner/finance/DebtorSheet.tsx',
  ];

  it.each(dosyalar)('%s ?.message || yerine toTurkishError kullanır', (dosya) => {
    const s = oku(dosya);
    expect(s).not.toContain('?.message ||');
    expect(s).toContain('toTurkishError(');
  });
});
