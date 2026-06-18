#!/usr/bin/env node
/**
 * Yerel admin paneli — port 4005, tarayıcıda /admin.html açar.
 * Kullanım: npm run dev:admin
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const PORT = Number(process.env.PORT) || 4005;
const ADMIN_URL = `http://localhost:${PORT}/admin.html`;
const ROOT_URL = `http://localhost:${PORT}/`;

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => {
      probe.close(() => resolve(false));
    });
    probe.listen(port, '127.0.0.1');
  });
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok || res.status === 304) return true;
    } catch {
      /* sunucu henüz hazır değil */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

async function main() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) {
    console.error('\n❌ .env dosyası bulunamadı.');
    console.error('   cp .env.example .env  →  VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY doldurun.\n');
    process.exit(1);
  }

  const busy = await portInUse(PORT);
  if (busy) {
    console.log(`ℹ️  Port ${PORT} kullanımda — mevcut sunucu kontrol ediliyor...`);
    const ready = await waitForHttp(ADMIN_URL, 8_000);
    if (ready) {
      console.log(`✅ Admin panel zaten çalışıyor: ${ADMIN_URL}`);
      openBrowser(ADMIN_URL);
      return;
    }
    console.error(`\n❌ Port ${PORT} dolu ama admin paneli yanıt vermiyor.`);
    console.error(`   Başka süreci kapatın: lsof -i :${PORT}`);
    console.error(`   veya: kill $(lsof -t -i :${PORT})\n`);
    process.exit(1);
  }

  console.log(`\n🚀 OYNA OS Admin — http://localhost:${PORT}`);
  console.log(`   Panel: ${ADMIN_URL}`);
  console.log(`   Durdurmak için: Ctrl+C\n`);

  const child = spawn(
    'npx',
    ['vite', '--host', '--strictPort'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ADMIN_DEV: '1',
        PORT: String(PORT),
      },
    },
  );

  child.on('error', (err) => {
    console.error('Vite başlatılamadı:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => process.exit(code ?? 0));

  const ready = await waitForHttp(ROOT_URL);
  if (!ready) {
    console.error('\n❌ Sunucu zaman aşımına uğradı. .env ve node_modules kontrol edin.\n');
    child.kill('SIGTERM');
    process.exit(1);
  }

  openBrowser(ADMIN_URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
