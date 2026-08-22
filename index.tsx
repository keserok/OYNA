
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UygulamaKapisi } from './components/UygulamaKapisi';
import { initObservability } from './utils/observability';
import { installOynaScrollSystem } from './utils/scrollSystem';
import { OAUTH_PENCERE_ADI } from './shared/oauthPencere';

// FAZ 7.4 — Sentry/PostHog cephesi (env yoksa no-op).
initObservability();

// Kaydırma davranışı (yaylanma + uç sınırları) TEK yerden kurulur; bundan
// sonra eklenen ekranlar da otomatik olarak doğru davranır.
installOynaScrollSystem();

// ═══════════════════════════════════════════════════════════════════════════
// SAĞLAYICI DÖNÜŞ PENCERESİ — UYGULAMAYI ÇİZME, SESSİZCE KAPAN
// ───────────────────────────────────────────────────────────────────────────
// KURUCU KARARI (22 Ağustos 2026): "Kişi Apple/Google hesabını onayladığında
// uygulama TEKRAR AÇILMAMALI."
//
// Web'de `signInWithOAuth` varsayılan olarak TAM SAYFA yönlendirmesi yapar:
// uygulama kapanır, sağlayıcıya gidilir, dönüşte SIFIRDAN açılır. Bu tanımı
// gereği "uygulamanın yeniden açılması"dır; kullanıcı bunu çökme gibi okuyor.
// Çözüm: giriş AÇILIR PENCEREDE yapılır (supabaseAuth · webOAuthAc) ve ana
// sekme hiç terk edilmez.
//
// Açılan pencere dönüşte BİZİM kaynağımıza gelir. Orada tüm uygulamayı çizmek
// hem gereksiz hem yanıltıcıdır (kullanıcı iki OYNA görür). Burada erkenden
// tanınır: yalnız supabase istemcisi yüklenir — `detectSessionInUrl` kodu
// oturuma bozdurur, oturum AYNI kaynağın deposuna yazılır (ana sekme oradan
// görür) ve pencere kendini kapatır.
//
// Pencere adı bir sözleşmedir; supabaseAuth aynı sabiti kullanır.
const donusPenceresiMi =
  typeof window !== 'undefined' && window.name === OAUTH_PENCERE_ADI && !!window.opener;

if (donusPenceresiMi) {
  void (async () => {
    try {
      const { supabase } = await import('./supabaseClient');
      // Bozdurma detectSessionInUrl ile kendiliğinden koşar; oturumun depoya
      // YAZILDIĞINI görene kadar bekle — erken kapanırsa ana sekme hiçbir şey
      // göremez. Üst sınır ~10 sn.
      for (let i = 0; i < 40; i += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) break;
        await new Promise((coz) => setTimeout(coz, 250));
      }
    } catch {
      /* bozdurma tutmasa da pencereyi açık bırakma; ana sekme zaman
         aşımıyla kullanıcıya sebebini söyler. */
    }
    try { window.close(); } catch { /* kapanamazsa boş sayfa kalır */ }
  })();
} else {

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* ACİL DURUM FRENLERİ — uygulamanın EN DIŞI.
          Bakım modu ve zorunlu güncelleme burada durdurur; içerideki hiçbir
          ekran, hiçbir ödeme çizilmez. En dışta olması bilinçli: rol ayrımı
          yapmaz, oyuncu/tesis sahibi/kaleci/hakem hepsi aynı frene takılır
          (kurucu kararı 4).
          Kapı sorulamazsa HİÇBİR ŞEY yapmaz — uygulama normal açılır. */}
      <UygulamaKapisi>
        <App />
      </UygulamaKapisi>
    </ErrorBoundary>
  </React.StrictMode>
);
}
