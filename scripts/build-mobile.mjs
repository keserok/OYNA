#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// MOBİL PAKET DERLEMESİ — admin paneli mağaza paketine GİRMEZ
// ════════════════════════════════════════════════════════════════════════════
// `npx cap sync` dist klasörünün TAMAMINI native projeye kopyalar. Normal
// derlemede dist içinde admin panelinin HTML'i ve yığınları da bulunur; bu
// dosyalar oyuncunun telefonuna iniyor, uygulamanın boyutunu şişiriyor ve
// mağaza paketinde bulunmaması gereken bir yönetim yüzeyini taşıyordu.
//
// Bu betik yalnız ortam değişkenini kurup normal derlemeyi çalıştırır
// (Windows/macOS/Linux farkı olmadan — kabuk sözdizimine bağlı değildir).
import { spawnSync } from 'node:child_process';

const sonuc = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, OYNA_MOBILE: '1' },
  shell: process.platform === 'win32',
});

process.exit(sonuc.status ?? 1);
