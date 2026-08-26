/**
 * KÜÇÜK AKIŞ DÜZELTMELERİ — geri sökülmesin (26 Ağustos 2026)
 *
 * Dört ayrı sessiz arıza düzeltildi; hiçbiri hata fırlatmıyordu:
 *
 *   1  FriendAddView: arama efektinin temizliği yalnız sayacı durduruyordu,
 *      uçuştaki searchUsers yanıtı koşulsuz yazılıyordu → yavaş gelen bayat
 *      yanıt yeni sorgunun sonucunu ezebiliyordu.
 *   2  RoleSelection: giriş animasyonunun interval + timeout'u hiçbir ref'te
 *      değildi, unmount temizliği yoktu → kaldırılmış bileşende setState ve
 *      geç kalmış onComplete çalışabiliyordu.
 *   3  ServiceApplication: 13 alanlık form yalnız bellekteydi (çıkışta her şey
 *      kayıp), çevrimdışı gönderim süresiz asılı kalıyordu, catch ham İngilizce
 *      err.message basıyordu.
 *   4  ProfileEditSheet: fotoğraf hatasında ham err.message ekrana sızıyordu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('1 — FriendAddView: bayat arama yanıtı ekrana yazılmaz', () => {
  // Kanallar efektinin kendi `alive` kalıbı var; yalnız ARAMA efektine bak.
  const aramaEfekti = () => {
    const s = oku('views/social/FriendAddView.tsx');
    const bas = s.indexOf("// Debounce'lu arama");
    expect(bas).toBeGreaterThan(-1);
    return s.slice(bas, s.indexOf('}, [query]);', bas));
  };

  it('arama efekti alive kalıbını kullanır (kanallar efektiyle aynı desen)', () => {
    const e = aramaEfekti();
    expect(e).toContain('let alive = true;');
    // İstek dönünce bayat yanıt yazılmadan çıkılır
    expect(e).toMatch(/await searchUsers\([\s\S]{0,80}if \(!alive\) return;/);
  });

  it('temizlik hem sayacı hem alive bayrağını kapatır', () => {
    const e = aramaEfekti();
    expect(e).toContain('alive = false;');
    expect(e).toContain('if (debounceRef.current) clearTimeout(debounceRef.current);');
  });

  it('spinner yalnız güncel istekte kapanır', () => {
    expect(aramaEfekti()).toContain('if (alive) setSearching(false);');
  });
});

describe('2 — RoleSelection: giriş animasyonu sayaçları ref + temizlikte', () => {
  const KART = 'views/RoleSelection.tsx';

  it('interval ve timeout ref\'lerde tutulur', () => {
    const s = oku(KART);
    expect(s).toContain('const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);');
    expect(s).toContain('const completeRef = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(s).toContain('ivRef.current = setInterval(');
    expect(s).toContain('completeRef.current = setTimeout(onComplete, 280);');
    // Ref dışında çıplak sayaç kalmasın
    expect(s).not.toContain('const iv = setInterval(');
  });

  it('unmount temizliği ikisini de iptal eder', () => {
    const s = oku(KART);
    expect(s).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]{0,220}clearInterval\(ivRef\.current\);[\s\S]{0,120}clearTimeout\(completeRef\.current\);/);
  });

  it('isEntering koruması duruyor (çift tıklama iki animasyon başlatmaz)', () => {
    expect(oku(KART)).toContain('if (isEntering) return;');
  });
});

describe('3 — ServiceApplication: taslak + çevrimiçi kapısı + Türkçe hata', () => {
  const FORM = 'views/ServiceApplication.tsx';

  it('gönderim çevrimdışıyken hiç yola çıkmaz', () => {
    const s = oku(FORM);
    expect(s).toContain("import { isOnline } from '../shared/submitGuard';");
    expect(s).toMatch(/if \(!isOnline\(\)\) \{[\s\S]{0,160}Bağlantın yok\. Başvuru gönderilmedi — bağlanınca tekrar dene\./);
  });

  it('taslak sabit anahtara debounce\'lu yazılır ve mount\'ta geri yüklenir', () => {
    const s = oku(FORM);
    expect(s).toContain("const TASLAK_ANAHTARI = 'oyna.basvuru.taslak.v1';");
    expect(s).toContain('localStorage.setItem(TASLAK_ANAHTARI,');
    expect(s).toContain('localStorage.getItem(TASLAK_ANAHTARI)');
    // ~400ms debounce: her tuş vuruşunda değil
    expect(s).toMatch(/setTimeout\(\(\) => \{[\s\S]{0,600}localStorage\.setItem\(TASLAK_ANAHTARI,[\s\S]{0,600}\}, 400\);/);
  });

  it('kimlik fotoğrafı (File) taslağa GİRMEZ', () => {
    const s = oku(FORM);
    const yazim = s.match(/localStorage\.setItem\(TASLAK_ANAHTARI, JSON\.stringify\(\{[\s\S]*?\}\)\)/);
    expect(yazim).not.toBeNull();
    expect(yazim![0]).not.toContain('idPhoto');
    // KVKK onayı da taslaktan dönmez: açık rıza her gönderimde yeniden verilir
    expect(yazim![0]).not.toContain('agreed');
  });

  it('başarılı gönderim taslağı siler', () => {
    expect(oku(FORM)).toContain('localStorage.removeItem(TASLAK_ANAHTARI);');
  });

  it('catch ham err.message yerine mapError basar', () => {
    const s = oku(FORM);
    expect(s).toContain("setError(mapError(err, 'Başvuru gönderilemedi. Lütfen tekrar dene.'));");
    expect(s).not.toContain("err?.message || 'Başvuru gönderilemedi");
  });
});

describe('4 — ProfileEditSheet: fotoğraf hatası Türkçe sözlükten geçer', () => {
  const SHEET = 'components/profile/ProfileEditSheet.tsx';

  it('ham err.message yerine mapError kullanılır', () => {
    const s = oku(SHEET);
    expect(s).toContain("import { mapError } from '../../utils/errorMap';");
    expect(s).toContain("setPhotoError(mapError(err, 'Fotoğraf yüklenemedi. Farklı bir görsel dene (JPG/PNG, en fazla 10MB).'));");
    expect(s).not.toContain('?.message ||');
  });
});
