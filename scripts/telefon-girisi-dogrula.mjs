#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// TELEFON GİRİŞİ DOĞRULAMASI — "panelde doğru mu ayarladım?" sorusunun cevabı
//
// NEDEN VAR: Telefon girişi üç ayrı yerde ayarlanır (Supabase sağlayıcı anahtarı,
// Test OTP satırları, demo hesapların telefonları). Üçünden biri eksikse mağaza
// incelemecisi giriş ekranında kalır ve uygulama "çalışmıyor" diye REDDEDİLİR —
// bu uygulamanın en olası ret sebebi budur.
//
// Bu betik incelemecinin yapacağı şeyi BİREBİR yapar: her demo numarası için
// kod ister, gelen kodu doğrular, oturum açar ve HANGİ HESABA düştüğünü yazar.
// Gerçek SMS gitmez (Test OTP satırları sunucuda karşılanır).
//
// KULLANIM:  npm run telefon:dogrula
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((s) => s.includes('=') && !s.trim().startsWith('#'))
    .map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i).trim(), s.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) {
  console.error('.env içinde VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY yok.');
  process.exit(2);
}

// Devir listesindeki demo hesapları — panele girilecek Test OTP satırlarıyla AYNI.
const HESAPLAR = [
  { tel: '905000000000', kod: '500000', bekle: 'Demo Kaleci-Hakem (oyuncu + kaleci + hakem)' },
  { tel: '905000000001', kod: '500001', bekle: 'Hakan Capo (tesis sahibi + oyuncu)' },
  { tel: '905000000002', kod: '500002', bekle: 'Emre Kaya (oyuncu)' },
];

const cagir = async (yol, govde, jeton) => {
  const res = await fetch(`${URL_}${yol}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(govde),
  });
  let veri = null;
  try { veri = await res.json(); } catch { /* gövdesiz yanıt */ }
  return { ok: res.ok, durum: res.status, veri };
};

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', SARI = '\x1b[33m', SOLUK = '\x1b[90m', SIFIR = '\x1b[0m';

console.log(`\n${SOLUK}Proje:${SIFIR} ${URL_}\n`);

let engel = 0;

for (const h of HESAPLAR) {
  const etiket = `+${h.tel}`;

  // 1) Kod iste — Test OTP satırı varsa gerçek SMS GİTMEZ, sunucu 200 döner.
  const iste = await cagir('/auth/v1/otp', { phone: h.tel, create_user: true });
  if (!iste.ok) {
    const kod = iste.veri?.error_code ?? iste.veri?.msg ?? iste.durum;
    if (kod === 'phone_provider_disabled') {
      console.log(`${KIRMIZI}✗${SIFIR} ${etiket}  ${KIRMIZI}Telefon sağlayıcısı KAPALI${SIFIR}`);
      console.log(`${SOLUK}    Supabase → Authentication → Sign In / Providers → Phone: aç.${SIFIR}`);
    } else if (String(kod).includes('sms') || String(kod).includes('provider')) {
      console.log(`${KIRMIZI}✗${SIFIR} ${etiket}  kod istenemedi: ${kod}`);
      console.log(`${SOLUK}    Test OTP satırı yoksa sunucu gerçek SMS göndermeye çalışır.${SIFIR}`);
    } else {
      console.log(`${KIRMIZI}✗${SIFIR} ${etiket}  kod istenemedi: ${kod}`);
    }
    engel++;
    continue;
  }

  // 2) Kodu doğrula — Test OTP satırındaki sabit kod.
  const dogrula = await cagir('/auth/v1/verify', { type: 'sms', phone: h.tel, token: h.kod });
  if (!dogrula.ok || !dogrula.veri?.access_token) {
    const kod = dogrula.veri?.error_code ?? dogrula.veri?.msg ?? dogrula.durum;
    console.log(`${KIRMIZI}✗${SIFIR} ${etiket}  kod ${h.kod} kabul edilmedi: ${kod}`);
    console.log(`${SOLUK}    Test OTP satırı: numara ${h.tel} · kod ${h.kod} (numarayı '+' olmadan yaz).${SIFIR}`);
    engel++;
    continue;
  }

  // 3) Hangi hesaba düştük? Profil adı + rolleri oku.
  const jeton = dogrula.veri.access_token;
  const kid = dogrula.veri.user?.id;
  const pres = await fetch(
    `${URL_}/rest/v1/profiles?id=eq.${kid}&select=name,full_name,role,roles`,
    { headers: { apikey: ANON, Authorization: `Bearer ${jeton}` } },
  );
  const [profil] = (await pres.json().catch(() => [])) ?? [];
  const ad = profil?.name ?? profil?.full_name ?? '(profil okunamadı)';
  const roller = Array.isArray(profil?.roles) ? profil.roles.join(' + ') : (profil?.role ?? '—');

  console.log(`${YESIL}✓${SIFIR} ${etiket}  kod ${h.kod} → ${ad} ${SOLUK}[${roller}]${SIFIR}`);
  if (!profil) {
    console.log(`${SARI}    ! Bu numarada YENİ kullanıcı oluşmuş olabilir — beklenen: ${h.bekle}${SIFIR}`);
  }

  // 4) Oturumu kapat: doğrulama arkasında açık oturum bırakmaz.
  await cagir('/auth/v1/logout', {}, jeton);
}

console.log('');
if (engel > 0) {
  console.log(`${KIRMIZI}${engel} numara giremedi — mağaza incelemesi bu hâliyle REDDEDİLİR.${SIFIR}\n`);
  process.exit(1);
}
console.log(`${YESIL}Telefon girişi eksiksiz çalışıyor — incelemeci üç rolün hepsine girebilir.${SIFIR}\n`);
