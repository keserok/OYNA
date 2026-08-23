
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UygulamaKapisi } from './components/UygulamaKapisi';
import { initObservability } from './utils/observability';
import { installOynaScrollSystem } from './utils/scrollSystem';
import { oauthDonusPenceresiMi, oauthDonusIsaretiniSil } from './shared/oauthPencere';

// FAZ 7.4 — Sentry/PostHog cephesi (env yoksa no-op).
initObservability();

// Kaydırma davranışı (yaylanma + uç sınırları) TEK yerden kurulur; bundan
// sonra eklenen ekranlar da otomatik olarak doğru davranır.
installOynaScrollSystem();

const uygulamayiCiz = (): void => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }
  if (rootElement.dataset.oynaCizildi === '1') return; // iki kez mount etme
  rootElement.dataset.oynaCizildi = '1';

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
};

// ═══════════════════════════════════════════════════════════════════════════
// SAĞLAYICI DÖNÜŞÜ — ANA SEKMEYE OTURUMU VER, SONRA ÇEKİL
// ───────────────────────────────────────────────────────────────────────────
// KURUCU KARARI (22 Ağustos 2026): "Kişi Apple/Google hesabını onayladığında
// uygulama TEKRAR AÇILMAMALI."
//
// Web'de `signInWithOAuth` varsayılan olarak TAM SAYFA yönlendirmesi yapar:
// uygulama kapanır, sağlayıcıya gidilir, dönüşte SIFIRDAN açılır. Bu tanımı
// gereği "uygulamanın yeniden açılması"dır. Çözüm: giriş AÇILIR PENCEREDE
// yapılır (supabaseAuth · webOAuthAc) ve ana sekme hiç terk edilmez.
//
// Açılan pencere dönüşte BİZİM kaynağımıza gelir; işareti adres sorgusundan
// okunur (`?oyna_donus=1` — window.name/opener neden kullanılmadığı için
// shared/oauthPencere.ts). Orada tüm uygulamayı çizmek hem gereksiz hem
// yanıltıcıdır (kullanıcı iki OYNA görür). Burada yalnız supabase istemcisi
// yüklenir: `detectSessionInUrl` kodu oturuma bozdurur, oturum AYNI kaynağın
// localStorage'ına yazılır (ana sekme oradan görür) ve pencere kapanır.
//
// KAPANAMAZSA UYGULAMA O SEKMEDE ÇİZİLİR (23 Ağustos 2026). Mobil tarayıcılar
// açılır pencereyi SEKME olarak açar ve `window.close()` çoğu zaman sessizce
// reddedilir. Eski kod bu durumda kullanıcıyı BEYAZ BİR SAYFAYLA baş başa
// bırakırdı. Artık oturum zaten açık olduğu için uygulama doğrudan ana
// sayfaya/onboarding'e düşer — kurucunun istediği son durum.
if (oauthDonusPenceresiMi()) {
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
      /* bozdurma tutmasa da burada takılıp kalma; aşağıdaki yol kullanıcıyı
         her hâlükârda bir ekrana çıkarır. */
    }
    oauthDonusIsaretiniSil();
    try { window.close(); } catch { /* kapanamazsa aşağıdaki zamanlayıcı çizer */ }
    // `window.close()` başarılıysa sayfa yıkılır ve bu zamanlayıcı HİÇ
    // çalışmaz. Çalışıyorsa kapanma reddedilmiş demektir: boş sayfa bırakma.
    setTimeout(() => {
      if (!window.closed) uygulamayiCiz();
    }, 400);
  })();
} else {
  uygulamayiCiz();
}
