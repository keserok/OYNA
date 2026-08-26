/**
 * MESAJ HATA DURUMLARI — geri sökülmesin (26 Ağustos 2026)
 *
 * MessagesView'da iki ekran da hata + boş durumu AYNI anda çiziyordu:
 *
 *   1) ChatView: ilk yükleme hatası eylem hatalarıyla (gönder/engelle/şikayet)
 *      aynı `error` state'ini paylaşıyordu; akış dalı yalnız loading/uzunluğa
 *      baktığı için altta kırmızı bant + ortada "Henüz mesaj yok" birlikte
 *      görünüyordu. Artık ayrı `loadError` var ve dal sırası Notifications
 *      ile aynı: yükleniyor → hata (Tekrar Dene) → boş → liste.
 *   2) InboxList: `listError` listenin ÜSTÜNDE banner'dı, bileşen hatayı hiç
 *      bilmiyordu → banner + "Henüz mesajın yok" + "Arkadaş Bul" birlikte.
 *      Artık hata `error` prop'u ile bileşene iner ve boş durumun yerine geçer.
 *
 * Ayrıca dosyadaki tüm `?.message ||` kalıpları utils/errorMap.mapError'a
 * çevrildi — ham İngilizce sunucu metni ekrana sızmasın.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const GORUNUM = 'views/MessagesView.tsx';

describe('ChatView — yükleme hatası boş durumdan AYRI ve ÖNCE', () => {
  it('ilk yükleme hatası eylem hatalarından ayrı state\'e yazılır', () => {
    const s = oku(GORUNUM);
    expect(s).toContain("setLoadError(mapError(e, 'Mesajlar yüklenemedi.'));");
    // Eylem hataları eski banner yolunda kalır (gönderme örneği):
    expect(s).toContain("setError(mapError(e, 'Mesaj gönderilemedi.'));");
  });

  it('dal sırası: yükleniyor → loadError → boş — hata boş durumdan ÖNCE gelir', () => {
    const s = oku(GORUNUM);
    // loading ? … : loadError ? <ErrorState …> : messages.length === 0 ? …
    expect(s).toMatch(
      /\) : loadError \? \([\s\S]{0,400}<ErrorState[\s\S]{0,400}\) : messages\.length === 0 \? \(/
    );
    // loadError dalı "Henüz mesaj yok" metninden önce durur; hata varken boş
    // durum dalına hiç girilmez.
    expect(s.indexOf(') : loadError ? (')).toBeGreaterThan(0);
    expect(s.indexOf(') : loadError ? (')).toBeLessThan(s.indexOf('Henüz mesaj yok.'));
  });

  it('Tekrar Dene yüklemeyi yeniden tetikler (efekt loadAttempt\'e bağlı)', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('onRetry={() => setLoadAttempt(n => n + 1)}');
    expect(s).toContain('[conversation.id, scrollToBottom, loadAttempt]');
  });
});

describe('InboxList — hata prop olarak iner, banner ikilemesi yok', () => {
  it('error ve onRetry propları tanımlı', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('error?: string | null;');
    expect(s).toContain('onRetry?: () => void;');
  });

  it('hata dalı boş durumdan ("Henüz mesajın yok") ÖNCE gelir', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('if (error) return <ErrorState message={error} onRetry={onRetry} />;');
    // JSX'teki gerçek boş-durum metnine bakılır (yorumdaki geçişe değil).
    expect(s.indexOf('if (error) return <ErrorState')).toBeLessThan(
      s.indexOf('>Henüz mesajın yok</p>')
    );
  });

  it('çağrı yerinde listError + yeniden yükleme geçilir; üstteki banner kalktı', () => {
    const s = oku(GORUNUM);
    expect(s).toContain('error={listError}');
    expect(s).toContain('onRetry={loadInbox}');
    // Eski çift gösterim: listenin üstünde koşullu banner geri gelmesin.
    expect(s).not.toContain('{listError && (');
  });
});

describe('Hata metinleri — ham sunucu mesajı sızmaz', () => {
  it('dosyada tek bir `?.message ||` kalıbı kalmadı', () => {
    const s = oku(GORUNUM);
    expect(s).not.toContain('?.message ||');
  });

  it('mapError merkez sözlükten içe aktarılır', () => {
    const s = oku(GORUNUM);
    expect(s).toContain("import { mapError } from '../utils/errorMap';");
  });
});

describe('Hazır bileşen — ErrorState yeniden yazılmadı, paylaşılandan alındı', () => {
  it('StatusState\'ten ErrorState import edilir', () => {
    const s = oku(GORUNUM);
    expect(s).toContain("import { ErrorState } from '../components/common/StatusState';");
  });
});
