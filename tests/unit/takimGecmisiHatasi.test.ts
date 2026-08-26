/**
 * TAKIM GEÇMİŞİ HATA DURUMU — geri sökülmesin (TeamDetailView, 26 Ağustos 2026)
 *
 * Arıza: maç geçmişi yüklenemeyince catch içinde `setHistory([])` çalışıyordu.
 * Sonuç: hata, ekranda "Henüz oynanmış maç yok" + "Maç Kur" olarak görünüyordu —
 * kullanıcı gerçek maçları silinmiş sanıyordu. Ayrıca 8 yerde ham
 * `(e as Error)?.message || '...'` kalıbı İngilizce sunucu metnini toast'a
 * sızdırıyordu.
 *
 * Düzeltme: historyError state'i + ErrorState; catch eldeki veriyi KORUR;
 * tüm toast'lar mapError sözlüğünden geçer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const GORUNUM = 'views/social/TeamDetailView.tsx';

describe('geçmiş yüklenemeyince eldeki veri korunmalı', () => {
  it('catch içinde setHistory([]) YOK — hata "maç yok" gibi görünmez', () => {
    const s = oku(GORUNUM);
    expect(s).not.toContain('setHistory([])');
  });

  it('historyError state tanımlı, başarıda temizlenir, hatada dolar', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('const [historyError, setHistoryError] = useState<string | null>(null)');
    expect(s).toContain('setHistoryError(null)');
    expect(s).toContain("setHistoryError(mapError(e, 'Maç geçmişi yüklenemedi.'))");
  });
});

describe('hata görünümü ErrorState ile çizilir', () => {
  it('ErrorState içe aktarılır ve tekrar dene loadMatches çağırır', () => {
    const s = oku(GORUNUM);
    expect(s).toContain("import { ErrorState } from '../../components/common/StatusState'");
    expect(s).toContain('<ErrorState');
    expect(s).toContain('onRetry={() => void loadMatches()}');
  });

  it('liste doluyken hata küçük şeritle söylenir, liste silinmez', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('Geçmiş güncellenemedi');
    expect(s).toContain('Yeniden dene');
  });
});

describe('ham hata metni ekrana sızmaz', () => {
  it('?.message || kalıbı dosyada kalmadı — hepsi mapError oldu', () => {
    const s = oku(GORUNUM);
    expect(s).not.toContain('?.message ||');
    expect(s).toContain("import { mapError } from '../../utils/errorMap'");
  });
});
