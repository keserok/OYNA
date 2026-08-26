// ════════════════════════════════════════════════════════════════════════
// KALİTE KAPILARI (26 Ağu 2026 — UI/UX denetim kapanış paketi)
//
// "Yapıldı" denen ile kodda duran arasındaki farkın bir daha AÇILMAMASI için
// sayaç/varlık kapıları. Bir kapı kırmızıya dönerse: yeni kod bir yasak
// kalıbı geri getirmiş demektir — kalıbı düzelt, kapıyı gevşetme.
// ════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const KOK = path.resolve(__dirname, '..', '..');

/** views/ + components/ altındaki tüm .ts/.tsx dosyaları (özyinelemeli). */
const kaynakDosyalari = (): string[] => {
  const sonuc: string[] = [];
  const gez = (dizin: string) => {
    for (const ad of readdirSync(dizin)) {
      const tam = path.join(dizin, ad);
      if (statSync(tam).isDirectory()) gez(tam);
      else if (/\.(ts|tsx)$/.test(ad)) sonuc.push(tam);
    }
  };
  gez(path.join(KOK, 'views'));
  gez(path.join(KOK, 'components'));
  return sonuc;
};

/** `açılış` konumundaki paranteze/süslüye karşılık gelen kapanışın indeksi. */
const esiniBul = (metin: string, acilis: number, ac: string, kapa: string): number => {
  let derinlik = 0;
  for (let i = acilis; i < metin.length; i++) {
    if (metin[i] === ac) derinlik++;
    else if (metin[i] === kapa) { derinlik--; if (derinlik === 0) return i; }
  }
  return -1;
};

describe('FAZ 0 · mekanizma betikleri', () => {
  it('scripts/sistem/etki.mjs var (PRENSİPLER §9.2 komutu artık MODULE_NOT_FOUND vermez)', () => {
    expect(existsSync(path.join(KOK, 'scripts', 'sistem', 'etki.mjs'))).toBe(true);
  });

  it('etki.mjs git tarafından İZLENİYOR (scripts/* yutma tuzağı — 3. kez yaşanmasın)', () => {
    const takipli = execSync('git ls-files scripts/sistem/etki.mjs', { cwd: KOK, encoding: 'utf8' }).trim();
    expect(takipli, '.gitignore allowlist eksik: !scripts/sistem/ + !scripts/sistem/**').toBe('scripts/sistem/etki.mjs');
  });
});

describe('FAZ 1 · hata durumunda liste boşaltma kalıbı büyüyemez', () => {
  // catch içinde set*([]) — hata "boş liste" olarak sunuluyor demektir.
  // Ölçülen taban (26 Ağu 2026, bu kapının kendi sayacıyla): 20 çağrı
  // (TeamDetailView geçmiş düzeltmesi sonrası). Yeni kod bu sayıyı ARTIRAMAZ;
  // azaltmak serbest — azaltınca tavanı da indir.
  const TAVAN = 20;

  it(`catch içinde liste boşaltan çağrı sayısı ≤ ${TAVAN}`, () => {
    const setterDeseni = /set[A-Z]\w*\(\s*\[\s*\]\s*\)/g;
    const bulgular: string[] = [];
    for (const dosya of kaynakDosyalari()) {
      const metin = readFileSync(dosya, 'utf8');
      const gorece = path.relative(KOK, dosya);
      // 1) try/catch blokları: catch { … } gövdesinde setter ara.
      const catchDeseni = /catch\s*(\([^)]*\))?\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = catchDeseni.exec(metin)) !== null) {
        const govdeBas = m.index + m[0].length - 1;
        const govdeSon = esiniBul(metin, govdeBas, '{', '}');
        if (govdeSon < 0) continue;
        const govde = metin.slice(govdeBas, govdeSon);
        for (const s of govde.match(setterDeseni) ?? []) bulgular.push(`${gorece} (catch): ${s}`);
      }
      // 2) .catch(...) satır içi işleyiciler.
      const inlineDeseni = /\.catch\s*\(/g;
      while ((m = inlineDeseni.exec(metin)) !== null) {
        const acilis = m.index + m[0].length - 1;
        const kapanis = esiniBul(metin, acilis, '(', ')');
        if (kapanis < 0) continue;
        const govde = metin.slice(acilis, kapanis);
        for (const s of govde.match(setterDeseni) ?? []) bulgular.push(`${gorece} (.catch): ${s}`);
      }
    }
    expect(
      bulgular.length,
      `catch içinde liste boşaltma arttı (${bulgular.length} > ${TAVAN}). Hata durumu ` +
      `boş-durum ekranı DEĞİLDİR: hata state'i + ErrorState kullan.\n${bulgular.join('\n')}`,
    ).toBeLessThanOrEqual(TAVAN);
  });
});

describe('FAZ 1 · gönderim korumaları bağlı kalır (1.6)', () => {
  it('Maç yayınlama: çevrimiçi kapısı + yanıt penceresi + anahtar korunumu', () => {
    const s = readFileSync(path.join(KOK, 'views', 'MatchCreate.tsx'), 'utf8');
    expect(s).toContain('OFFLINE_PUBLISH');
    expect(s).toContain('withSubmitTimeout(createMatchAtomic(');
    expect(s).toContain('TIMEOUT_PUBLISH');
    // Timeout dalında idempotency anahtarı SIFIRLANMAZ (submitGuard sözleşmesi).
    const timeoutDali = s.slice(s.indexOf('err instanceof SubmitTimeoutError'), s.indexOf('parseCreateMatchError(err)'));
    expect(timeoutDali).not.toContain('publishIdemRef.current = null');
  });

  it('Ücretsiz slot alma: yanıt penceresi bağlı', () => {
    const s = readFileSync(path.join(KOK, 'views', 'MatchJoin.tsx'), 'utf8');
    expect(s).toContain("withSubmitTimeout(Promise.resolve(supabase.rpc('player_buy_slots_v2'");
    expect(s).toContain('TIMEOUT_JOIN');
  });

  it('MatchJoin hata toastı kalıcı: kapatma düğmeli, otomatik silme yok', () => {
    const s = readFileSync(path.join(KOK, 'views', 'MatchJoin.tsx'), 'utf8');
    const blok = s.slice(s.indexOf('const showActionError'), s.indexOf('const showActionSuccess'));
    expect(blok).not.toContain('setTimeout');
    expect(s).toContain('onClose={() => setActionError(null)}');
  });
});

describe('FAZ 3 · ham İngilizce hata metni kalıbı geri gelemez', () => {
  it("gösterim amaçlı `?.message || 'yedek'` kalıbı 0 (kod-koklama `|| ''` serbest)", () => {
    // Boş olmayan yedek metin = mesaj doluysa yedek ASLA görünmez, ham
    // (çoğu zaman İngilizce) sunucu metni ekrana basılır. mapError /
    // toTurkishError kullan. `?.message || ''` biçimi kod-koklamadır
    // (.includes ile kod aranır), o serbesttir.
    const leakDeseni = /\?\.message\s*\|\|\s*['"`][^'"`]/;
    const ihlaller: string[] = [];
    for (const dosya of kaynakDosyalari()) {
      const metin = readFileSync(dosya, 'utf8');
      metin.split('\n').forEach((satir, i) => {
        if (leakDeseni.test(satir)) ihlaller.push(`${path.relative(KOK, dosya)}:${i + 1}`);
      });
    }
    expect(ihlaller, `ham hata metni sızıntı kalıbı geri geldi:\n${ihlaller.join('\n')}`).toEqual([]);
  });
});

describe('FAZ 3 · etiketsiz salt-ikon buton geri gelemez (3.2)', () => {
  // Sezgisel sayaç: tek çocuğu kendinden-kapanan büyük harfli bileşen (ikon)
  // olan, aria-label'sız <button>. Doğrulanmış taban (26 Ağu 2026): süpürme
  // sonrası 2 — ikisi de views/WalletScreen.tsx'te (ekran ERİŞİLEMEZ ve
  // kurucu talimatıyla dokunulmuyor; cüzdan açılmadan önce borç listesinde).
  const TAVAN = 2;

  it(`aria-label'sız salt-ikon buton sayısı ≤ ${TAVAN}`, () => {
    const buton = /<button\b[^>]*?>\s*<[A-Z]\w+\b[^>]*?\/>\s*<\/button>/gs;
    const ihlaller: string[] = [];
    for (const dosya of kaynakDosyalari()) {
      const metin = readFileSync(dosya, 'utf8');
      for (const m of metin.match(buton) ?? []) {
        if (!m.includes('aria-label')) {
          ihlaller.push(`${path.relative(KOK, dosya)}: ${m.slice(0, 80).replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(
      ihlaller.length,
      `etiketsiz salt-ikon buton arttı (${ihlaller.length} > ${TAVAN}) — ekran okuyucu ` +
      `"düğme" der, ne yaptığını söyleyemez. Türkçe aria-label ver (veya IconButton kullan).\n${ihlaller.join('\n')}`,
    ).toBeLessThanOrEqual(TAVAN);
  });
});

describe('FAZ 3 · kontrast borcu büyüyemez (3.1 süpürmesi kurucu onayı bekliyor)', () => {
  // Doğrulanmış taban (26 Ağu 2026): 269 kullanım (bu kapının kendi sayacıyla;
  // className dışı geçişler dahil). İhlallerin tamamı tesis paneli +
  // MatchTicket'ta; oyuncu tarafı temiz. Süpürme (IP-08 kaçağı) görsel onay
  // kapısının arkasında — o yapılana kadar bu kapı yalnız BÜYÜMEYİ engeller.
  // Süpürme yapılınca tavanı düşür.
  const TAVAN = 269;

  it(`text-gray-500/600 kullanım toplamı ≤ ${TAVAN}`, () => {
    let toplam = 0;
    for (const dosya of kaynakDosyalari()) {
      const metin = readFileSync(dosya, 'utf8');
      toplam += (metin.match(/text-gray-(500|600)/g) ?? []).length;
    }
    expect(
      toplam,
      `text-gray-500/600 arttı (${toplam} > ${TAVAN}). index.css kuralı: --color-ink-4 en soluk izinli ton; yenisini ekleme.`,
    ).toBeLessThanOrEqual(TAVAN);
  });
});
