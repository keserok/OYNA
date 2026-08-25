#!/usr/bin/env node
// kasa.mjs — OYNA kasası: değerleri şifreli tutan tek dosyanın kapısı.
//
//   npm run kasa:durum      neyin nerede olduğunu söyler
//   npm run kasa:kur        ilk kurulum — şablondan çalışma dosyası açar
//   npm run kasa:ac         kasa.age → kasa.md  (parola sorar)
//   npm run kasa:kilitle    kasa.md → kasa.age  (parola sorar, sonra düz metni siler)
//
// ─── NEDEN BÖYLE ────────────────────────────────────────────────────────────
// Kurucu kararı (25 Ağu 2026): anahtar değerleri GitHub'da dursun ama ŞİFRELİ.
// Depo özel olsa bile düz metin kabul edilemez: git geçmişi kalıcıdır, her
// klonda ve her CI çalışmasında yeniden üretilir, silinse bile geçmişte kalır.
//
// Şifreleme aracı `age`: tek küçük ikili, parola modunda anahtar dosyası
// yönetmeye gerek yok. macOS'ta kurulumu:  brew install age
//
// ─── EN ÖNEMLİ GÜVENLİK KURALI ──────────────────────────────────────────────
// `kilitle`, düz metni silmeden ÖNCE şifrelenmiş dosyayı geri açıp içeriğin
// birebir aynı olduğunu doğrular. Bu adım olmasaydı, parolayı yanlış yazdığın
// bir gün kasanın tamamını kaybederdin — ve bunu ancak aylar sonra, açmaya
// çalıştığında öğrenirdin.
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const KOK    = join(dirname(fileURLToPath(import.meta.url)), '..');
const KASA   = join(KOK, 'docs/master/KASA');
const DUZ    = join(KASA, 'kasa.md');
const SIFRELI= join(KASA, 'kasa.age');
const SABLON = join(KASA, 'kasa.ornek.md');
const GORECELI = (p) => p.replace(KOK + '/', '');

const yesil=(s)=>`\x1b[32m${s}\x1b[0m`, kirmizi=(s)=>`\x1b[31m${s}\x1b[0m`;
const sari=(s)=>`\x1b[33m${s}\x1b[0m`, soluk=(s)=>`\x1b[90m${s}\x1b[0m`;
const bas=(s)=>console.log(s);
const dur=(mesaj, ipucu='') => { bas(`\n  ${kirmizi('✗')} ${mesaj}`); if (ipucu) bas(`    ${soluk(ipucu)}`); bas(''); process.exit(1); };

/** `age` kurulu mu? Kurulu değilse ne yapılacağını SÖYLE. */
const ageVarMi = () => spawnSync('age', ['--version'], { stdio: 'ignore' }).status === 0;

/** git bu dosyayı takip ediyor mu? (düz metin ASLA takip edilmemeli) */
const gitTakipEdiyorMu = (yol) =>
  spawnSync('git', ['ls-files', '--error-unmatch', yol], { cwd: KOK, stdio: 'ignore' }).status === 0;

/** git geçmişinde bu yol HİÇ görünmüş mü? */
const gecmisteVarMi = (yol) => {
  const r = spawnSync('git', ['log', '--oneline', '--all', '--', yol], { cwd: KOK, encoding: 'utf8' });
  return (r.stdout || '').trim().length > 0;
};

const komut = process.argv[2] ?? 'durum';

// ══════════════════════════════════════════════════════════════════════════
if (komut === 'durum') {
  bas(`\n  ${'OYNA KASASI'}\n`);
  bas(`  ${ageVarMi() ? yesil('✓') : kirmizi('✗')} age aracı ${ageVarMi() ? 'kurulu' : soluk('KURULU DEĞİL — macOS: brew install age')}`);
  bas(`  ${existsSync(SIFRELI) ? yesil('✓') : sari('!')} ${GORECELI(SIFRELI)} ${existsSync(SIFRELI)
        ? soluk(`${statSync(SIFRELI).size} bayt · şifreli`)
        : soluk('henüz yok — `npm run kasa:kur` ile başla')}`);

  if (existsSync(DUZ)) {
    bas(`  ${sari('!')} ${GORECELI(DUZ)} ${sari('AÇIK DURUYOR')} ${soluk('— işin bitince `npm run kasa:kilitle`')}`);
    if (gitTakipEdiyorMu(GORECELI(DUZ))) {
      bas(`  ${kirmizi('✗')} ${kirmizi('DÜZ METİN GIT TARAFINDAN TAKİP EDİLİYOR — anahtarların sızmak üzere!')}`);
    }
  } else {
    bas(`  ${yesil('✓')} düz metin açık değil`);
  }

  if (gecmisteVarMi(GORECELI(DUZ))) {
    bas(`  ${kirmizi('✗')} ${kirmizi('kasa.md git GEÇMİŞİNDE görünüyor')} ${soluk('— o anahtarların hepsi yenilenmeli')}`);
  }
  bas('');
  process.exit(0);
}

if (!ageVarMi()) {
  dur('`age` kurulu değil.', 'macOS: brew install age   ·   Linux: apt install age');
}

// ══════════════════════════════════════════════════════════════════════════
if (komut === 'kur') {
  if (existsSync(SIFRELI)) dur('Kasa zaten var.', `Açmak için: npm run kasa:ac`);
  if (existsSync(DUZ))     dur('Çalışma dosyası zaten açık.', `${GORECELI(DUZ)} — doldurup \`npm run kasa:kilitle\` çalıştır.`);
  if (!existsSync(SABLON)) dur('Şablon bulunamadı.', GORECELI(SABLON));
  mkdirSync(KASA, { recursive: true });
  writeFileSync(DUZ, readFileSync(SABLON, 'utf8'));
  bas(`\n  ${yesil('✓')} ${GORECELI(DUZ)} açıldı.\n`);
  bas(`  Şimdi ne yapacaksın:`);
  bas(`    1. Dosyayı aç, ${sari('⟨…⟩')} ile işaretli yerleri doldur (bilmediğini boş bırak).`);
  bas(`    2. ${sari('npm run kasa:kilitle')} — bir parola belirler ve dosyayı şifreler.`);
  bas(`    3. O parolayı ${kirmizi('UNUTMA')}. Parolasız kasa açılmaz; kimse açamaz, ben de açamam.\n`);
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════
if (komut === 'ac') {
  if (!existsSync(SIFRELI)) dur('Kasa yok.', `Önce: npm run kasa:kur`);
  if (existsSync(DUZ))      dur('Çalışma dosyası zaten açık.', GORECELI(DUZ));
  bas(`\n  Kasa açılıyor — parolanı gir:\n`);
  const r = spawnSync('age', ['-d', '-o', DUZ, SIFRELI], { stdio: 'inherit' });
  if (r.status !== 0) {
    if (existsSync(DUZ)) unlinkSync(DUZ);
    dur('Açılamadı.', 'Parola yanlış olabilir. Kasa dosyasına dokunulmadı.');
  }
  bas(`\n  ${yesil('✓')} ${GORECELI(DUZ)} açıldı. İşin bitince ${sari('npm run kasa:kilitle')}.\n`);
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════
if (komut === 'kilitle') {
  if (!existsSync(DUZ)) dur('Kilitlenecek açık dosya yok.', GORECELI(DUZ));

  if (gitTakipEdiyorMu(GORECELI(DUZ))) {
    dur('Düz metin git tarafından takip ediliyor — kilitlemek yetmez.',
        `Önce: git rm --cached "${GORECELI(DUZ)}"  ·  sonra .gitignore'a ekli olduğunu doğrula.`);
  }

  const icerik = readFileSync(DUZ, 'utf8');
  const gecici = join(KASA, `.dogrulama-${randomBytes(4).toString('hex')}.tmp`);

  bas(`\n  Kasa kilitleniyor — parola belirle (iki kez sorulur):\n`);
  const s = spawnSync('age', ['-p', '-o', SIFRELI, DUZ], { stdio: 'inherit' });
  if (s.status !== 0) dur('Şifreleme başarısız.', 'Düz metin dosyana DOKUNULMADI.');

  // ── EN ÖNEMLİ ADIM: silmeden önce GERİ AÇILABİLDİĞİNİ kanıtla ──────────
  bas(`\n  Doğrulama — az önce belirlediğin parolayı bir kez daha gir:\n`);
  const d = spawnSync('age', ['-d', '-o', gecici, SIFRELI], { stdio: 'inherit' });
  if (d.status !== 0 || !existsSync(gecici)) {
    if (existsSync(gecici)) unlinkSync(gecici);
    dur('Şifreli dosya geri açılamadı — düz metin SİLİNMEDİ.',
        'Kasan güvende. Parolayı doğru girdiğinden emin olup tekrar dene.');
  }
  const geri = readFileSync(gecici, 'utf8');
  unlinkSync(gecici);
  if (geri !== icerik) {
    dur('Geri açılan içerik aslıyla aynı değil — düz metin SİLİNMEDİ.',
        'Bu beklenmedik bir durum; kasa.age dosyasını kullanma ve haber ver.');
  }

  unlinkSync(DUZ);
  bas(`\n  ${yesil('✓')} Kilitlendi: ${GORECELI(SIFRELI)} ${soluk(`(${statSync(SIFRELI).size} bayt)`)}`);
  bas(`  ${yesil('✓')} Açık düz metin silindi.`);
  bas(`  ${yesil('✓')} Geri açılabildiği doğrulandı ${soluk('— içerik birebir aynı çıktı')}\n`);
  bas(`  Şimdi commit edebilirsin. ${soluk('Parolan kaybolursa kasa da kaybolur — bir yere yaz.')}\n`);
  process.exit(0);
}

dur(`Bilinmeyen komut: ${komut}`, 'Geçerli komutlar: durum · kur · ac · kilitle');
