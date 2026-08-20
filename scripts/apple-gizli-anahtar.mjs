#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// APPLE İLE GİRİŞ — "Client Secret" ÜRETİCİ (yerel, güvenli)
//
// NEDEN VAR: Supabase'in Apple sağlayıcısı, web/OAuth yolu için Apple'ın
// istediği imzalı bir jetonu (client secret) ister. Bu jeton, Apple'dan
// indirdiğin ÖZEL ANAHTARLA (.p8) imzalanır.
//
// İnternetteki "Apple JWT generator" sayfalarına bu .p8 dosyasını YAPIŞTIRMA:
// o dosya, hesabına Apple ile giriş açabilen özel anahtardır ve bir kez
// indirilir. Bu betik imzayı BU BİLGİSAYARDA üretir; anahtar hiçbir yere gitmez.
//
// KULLANIM:
//   node scripts/apple-gizli-anahtar.mjs \
//     --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \
//     --team TEAMID1234 \
//     --key  ABC123DEFG \
//     --services com.oyna.app.web
//
// Çıktı: Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)"
// alanına yapıştıracağın jeton. Apple bu jetona en fazla 6 AY ömür verir;
// betik son kullanma tarihini de yazar — takvimine koy, süresi dolunca
// aynı komutla yenisini üret.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const arg = (ad) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > -1 ? process.argv[i + 1] : null;
};

const p8Yolu   = arg('p8');
const teamId   = arg('team');
const keyId    = arg('key');
const servicesId = arg('services');
// Apple en fazla 6 ay (15777000 sn) kabul eder; varsayılan tam 6 ay.
const gunSayisi = Number(arg('gun') ?? 180);

if (!p8Yolu || !teamId || !keyId || !servicesId) {
  console.error(`
Eksik bilgi. Dördü de gerekli:

  --p8       Apple'dan indirdiğin AuthKey_XXXXXXXXXX.p8 dosyasının yolu
  --team     Team ID    (Apple Developer → Membership · 10 karakter)
  --key      Key ID     (.p8 dosya adındaki 10 karakter)
  --services Services ID (Identifiers'ta oluşturduğun, ör. com.oyna.app.web)

Örnek:
  node scripts/apple-gizli-anahtar.mjs --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \\
    --team TEAMID1234 --key ABC123DEFG --services com.oyna.app.web
`);
  process.exit(2);
}

let ozelAnahtar;
try {
  ozelAnahtar = createPrivateKey(readFileSync(p8Yolu, 'utf8'));
} catch (e) {
  console.error(`.p8 dosyası okunamadı (${p8Yolu}): ${e.message}`);
  process.exit(1);
}

const b64url = (veri) =>
  Buffer.from(veri).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const simdi = Math.floor(Date.now() / 1000);
const bitis = simdi + gunSayisi * 86400;
const APPLE_UST_SINIR = 15777000; // 6 ay
if (bitis - simdi > APPLE_UST_SINIR) {
  console.error('Apple 6 aydan uzun ömür kabul etmez — --gun en fazla 180 olabilir.');
  process.exit(2);
}

const baslik = { alg: 'ES256', kid: keyId };
const govde = {
  iss: teamId,
  iat: simdi,
  exp: bitis,
  aud: 'https://appleid.apple.com',
  sub: servicesId,
};

const imzalanacak = `${b64url(JSON.stringify(baslik))}.${b64url(JSON.stringify(govde))}`;
// JOSE ham (R||S) imza ister — DER değil. dsaEncoding bunu sağlar.
const imza = sign('sha256', Buffer.from(imzalanacak), {
  key: ozelAnahtar,
  dsaEncoding: 'ieee-p1363',
});
const jeton = `${imzalanacak}.${b64url(imza)}`;

const bitisTarihi = new Date(bitis * 1000).toLocaleDateString('tr-TR', {
  day: '2-digit', month: 'long', year: 'numeric',
});

console.log(`
Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)":

${jeton}

Client IDs alanına ikisini birden yaz (virgülle):
  com.oyna.app,${servicesId}
     └ uygulama içi (native) giriş     └ web/OAuth girişi

SON KULLANMA: ${bitisTarihi} — takvimine koy. Süresi dolduğunda Apple ile
giriş sessizce çalışmaz olur; aynı komutu çalıştırıp alanı güncellemen yeter.
`);
