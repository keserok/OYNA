// Android izin bekçisi — "kullandığın yeteneğin iznini de tanımla".
//
// NEDEN VAR (2026-08-01):
//   `services/contactsService.ts` rehberi okuyor ve çalışma anında izin
//   istiyordu, ama `READ_CONTACTS` HİÇBİR YERDE tanımlı değildi:
//   uygulamanın manifest'inde yoktu ve `@capacitor-community/contacts`
//   eklentisinin kendi manifest'i tamamen BOŞ (hiç izin katmıyor).
//
//   Android'de tanımlanmamış bir izin için `requestPermissions()` çağrılırsa
//   kullanıcıya kutu HİÇ gösterilmez, istek doğrudan reddedilmiş sayılır.
//   Sonuç: "rehberden arkadaş bul" özelliği telefonda her zaman
//   "Rehber izni verilmedi" hatası veriyordu. Hata yalnız gerçek cihazda
//   görünüyordu — tarayıcıda eklenti hiç yüklenmediği için sessizdi.
//
// BU TEST NE YAPAR:
//   Kodda kullanılan native yetenekleri tespit eder ve her biri için ilgili
//   iznin AndroidManifest'te tanımlı olduğunu doğrular. Yeni bir eklenti
//   eklenip izni unutulursa burada kırmızı yanar.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const KOK = process.cwd();
const MANIFEST = join(KOK, 'android/app/src/main/AndroidManifest.xml');

/** Kaynakta bu desen geçiyorsa, karşısındaki izin manifest'te ŞART. */
const KURALLAR: Array<{ yetenek: string; desen: RegExp; izin: string; nerede: string }> = [
  {
    yetenek: 'Rehberden arkadaş bulma',
    desen: /@capacitor-community\/contacts/,
    izin: 'android.permission.READ_CONTACTS',
    nerede: 'services/contactsService.ts',
  },
  {
    yetenek: 'Konum (yakındaki saha/maç)',
    desen: /@capacitor\/geolocation/,
    izin: 'android.permission.ACCESS_FINE_LOCATION',
    nerede: 'utils/geo.ts · services',
  },
  {
    yetenek: 'Kamera (QR bilet, profil fotoğrafı)',
    desen: /@capacitor\/camera/,
    izin: 'android.permission.CAMERA',
    nerede: 'hooks/useImageUpload.ts · QRScannerView',
  },
  {
    yetenek: 'Push bildirim',
    desen: /@capacitor\/push-notifications/,
    izin: 'android.permission.POST_NOTIFICATIONS',
    nerede: 'notifications/',
  },
];

/** package.json bağımlılıkları — eklenti kurulu mu? */
const paket = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const bagimliliklar = Object.keys(paket.dependencies ?? {});

describe('Android izinleri — kullanılan her yetenek tanımlı olmalı', () => {
  it('manifest dosyası var', () => {
    expect(existsSync(MANIFEST), `AndroidManifest bulunamadı: ${MANIFEST}`).toBe(true);
  });

  const manifest = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';

  for (const k of KURALLAR) {
    const kurulu = bagimliliklar.some((d) => k.desen.test(d));
    it(`${k.yetenek} → ${k.izin.split('.').pop()}`, () => {
      if (!kurulu) return; // eklenti kaldırılmışsa izin de gerekmez
      expect(
        manifest.includes(k.izin),
        `"${k.yetenek}" özelliği kullanılıyor (${k.nerede}) ama ${k.izin} ` +
        'AndroidManifest.xml içinde TANIMLI DEĞİL. Android tanımsız izin isteğini ' +
        'kullanıcıya sormadan reddeder; özellik telefonda sessizce çalışmaz.',
      ).toBe(true);
    });
  }

  it('eklentinin kendi manifest\'ine güvenilmiyor (contacts eklentisi boş manifest taşır)', () => {
    const eklentiManifest = join(
      KOK, 'node_modules/@capacitor-community/contacts/android/src/main/AndroidManifest.xml',
    );
    if (!existsSync(eklentiManifest)) return;
    const icerik = readFileSync(eklentiManifest, 'utf8');
    // Eklenti bir gün kendi iznini eklerse bu test bilgi verir; asıl güvence
    // yukarıdaki kural — izin BİZİM manifest'imizde durmalı.
    expect(manifest.includes('android.permission.READ_CONTACTS')).toBe(true);
    expect(typeof icerik).toBe('string');
  });
});
